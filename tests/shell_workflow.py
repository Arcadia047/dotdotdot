#!/usr/bin/env python3
"""Real-key workflow checks in disposable shells and a private tmux server."""
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time

REPO = Path(__file__).resolve().parents[1]


def visible(output):
    return re.sub(rb'\x1b\[[0-?]*[ -/]*[@-~]', b'', output)


class Shell:
    def __init__(self, root, name, shared_state=None, history=()):
        self.home = root/name
        self.home.mkdir()
        config = self.home/'config'
        config.mkdir()
        (config/'dotfiles-theme').write_text('dark\n')
        (self.home/'.p10k.zsh').symlink_to(REPO/'.p10k.zsh')
        self.snapshot_file = self.home/'snapshot'
        self.output = bytearray()
        self.env = dict(os.environ, HOME=str(self.home), ZDOTDIR=str(self.home),
                        XDG_CONFIG_HOME=str(config), XDG_CACHE_HOME=str(self.home/'cache'),
                        XDG_STATE_HOME=str(shared_state or self.home/'state'),
                        XDG_DATA_HOME=str(self.home/'data'), _ZO_DATA_DIR=str(self.home/'zoxide'),
                        FNM_DIR=os.environ.get('FNM_DIR', str(Path.home()/'.local/share/fnm')),
                        TMUX_BOOTSTRAPPED='1',
                        DOTDOTDOT_TEST_REPO=str(REPO), TERM='xterm-256color', COLORTERM='truecolor')
        for key in ('TMUX', 'TMUX_PANE', '_DOTDOTDOT_ENV_LOADED', '_DOTDOTDOT_FZF_BASE_OPTS',
                    'FNM_MULTISHELL_PATH'):
            self.env.pop(key, None)
        import shlex
        (self.home/'.zshrc').write_text('''
POWERLEVEL9K_DISABLE_CONFIGURATION_WIZARD=true
source "$DOTDOTDOT_TEST_REPO/.zshrc"
_workflow_capture() {
  printf '%s\\0' "$BUFFER" "$POSTDISPLAY" "$CURSOR" "$PWD" > "$HOME/snapshot"
}
# Observe redraws without changing LASTWIDGET or history-search state.
add-zle-hook-widget zle-line-pre-redraw _workflow_capture
add-zle-hook-widget zle-line-init _workflow_capture
bindkey '^X^S' .reset-prompt
''' + ''.join('print -s -- ' + shlex.quote(line) + '\n' for line in history))
        self.pid, self.master = pty.fork()
        if self.pid == 0:
            os.chdir(root/'project')
            os.execve('/bin/zsh', ['/bin/zsh', '-d', '-i'], self.env)
        fcntl.ioctl(self.master, termios.TIOCSWINSZ, struct.pack('HHHH', 35, 130, 0, 0))
        self.pump(1.3)

    def pump(self, seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if select.select([self.master], [], [], 0.03)[0]:
                try:
                    self.output.extend(os.read(self.master, 65536))
                except OSError:
                    return

    def send(self, keys, pause=0.25):
        os.write(self.master, keys.encode() if isinstance(keys, str) else keys)
        self.pump(pause)

    def snapshot(self, refresh=False):
        # Redraw hooks already captured the last real key, without adding a key
        # that would interrupt native history-search sequences.
        if refresh:
            self.send(b'\x18\x13')
        self.pump(0.05)
        deadline = time.monotonic() + 2
        while not self.snapshot_file.exists() and time.monotonic() < deadline:
            self.pump(0.05)
        assert self.snapshot_file.exists(), 'Capture failed: a picker or process still owns the input'
        return self.snapshot_file.read_bytes().decode().split('\0')[:4]

    def clear(self):
        self.send(b'\x05\x15')

    def command(self, command):
        self.clear()
        self.send(command + '\r', 0.5)
        assert self.snapshot()[0] == '', 'Command did not return to the shell prompt'

    def expect(self, expected, description):
        actual = self.snapshot()
        assert actual[0].rstrip() == expected, f'{description}: {actual!r}'
        print('PASS ' + description, flush=True)

    def close(self):
        os.kill(self.pid, signal.SIGHUP)
        os.close(self.master)
        os.waitpid(self.pid, 0)


def private_tmux(shell, project):
    import shlex
    socket = str(shell.home/'tmux.sock')
    config = shell.home/'tmux.conf'
    config.write_text('set -g default-shell /bin/zsh\n'
                      'set -g default-command "/bin/zsh -d -i"\n'
                      'set -g default-terminal tmux-256color\nset -g status off\n'
                      'source-file ' + shlex.quote(str(REPO/'.tmux/navigation.conf')) + '\n')

    def tmux(*args):
        return subprocess.check_output(['tmux', '-S', socket, *args], env=shell.env,
                                       text=True, stderr=subprocess.STDOUT, timeout=10).strip()

    master = pid = None
    try:
        tmux('-f', str(config), 'new-session', '-d', '-s', 'qa', '-x', '130', '-y', '35',
             '-c', str(project))
        tmux('new-window', '-d', '-t', 'qa', '-c', str(project))
        pid, master = pty.fork()
        if pid == 0:
            os.execvpe('tmux', ['tmux', '-S', socket, 'attach-session', '-t', 'qa'], shell.env)
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 35, 130, 0, 0))

        def press(keys, pause=0.3):
            os.write(master, keys.encode() if isinstance(keys, str) else keys)
            deadline = time.monotonic() + pause
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.03)[0]:
                    os.read(master, 65536)

        def capture():
            press(b'', 0.05)
            assert shell.snapshot_file.exists(), 'Private tmux capture must reach zsh'
            return shell.snapshot_file.read_bytes().decode().split('\0')[:4]

        press(b'', 1.3)
        press('echo LOCAL_TMUX_A_642\r', 0.5)
        press(b'\x0a', 0.5)
        assert tmux('display-message', '-p', '#{window_index}') == '2'
        press('echo FOREIGN_TMUX_B_864\r', 0.5)
        press(b'\x0b', 0.5)
        assert tmux('display-message', '-p', '#{window_index}') == '1'
        press(b'\x12', 0.7)
        press('864')
        press('\r', 0.4)
        assert capture()[0] == 'echo FOREIGN_TMUX_B_864'
        press(b'\x05\x15\x1b[A')
        assert capture()[0] == 'echo LOCAL_TMUX_A_642'
        print('PASS private tmux keeps global Ctrl-R and local Up after task switching', flush=True)
        press(b'\x05\x15')
        press('echo edit-me')
        press(b'\x01\x01\x06')
        assert capture()[2] == '1'
        press(b'\x05\x15git stat', 0.5)
        press('\t', 0.5)
        assert capture()[0].rstrip() == 'git status'
        print('PASS private tmux delivers native Ctrl-F and semantic Tab completion', flush=True)
    finally:
        try:
            tmux('kill-server')
        except subprocess.CalledProcessError:
            pass
        if pid:
            try:
                os.kill(pid, signal.SIGHUP)
            except ProcessLookupError:
                pass
            os.waitpid(pid, 0)
        if master is not None:
            os.close(master)


def node_prompt(root, project):
    # A long path crowds out the right prompt; requirement warnings must still show.
    (project/'.nvmrc').write_text('999999\n')
    shell = Shell(root, 'node-warning')
    try:
        shell.pump(0.5)
        output = visible(shell.output)
        assert b'Do you want to install' not in output
        assert b'Node requirement unmet (active' in output
        shell.send('echo pending-edit')
        assert shell.snapshot()[0] == 'echo pending-edit'
        shell.clear()
        start = len(shell.output)
        shell.command('cd ..')
        assert b'Node requirement unmet' not in visible(shell.output[start:]).split(b'cd ..')[-1]
        print('PASS Node requirement warning stays visible and navigation never prompts for installation', flush=True)
    finally:
        shell.close()


def main():
    with tempfile.TemporaryDirectory(prefix='dotdotdot-workflow-') as temporary:
        root = Path(temporary)
        project = root/'project'
        project.mkdir()
        for name in ('service-a', 'service-b', 'design notes', 'status-reports', 'tests', 'src/api'):
            (project/name).mkdir(parents=True)
        (project/'linked-api').symlink_to('src/api', target_is_directory=True)
        (project/'package.json').write_text(json.dumps({'name': 'fixture', 'scripts': {'test': 'echo test', 'unit test': 'echo unit'}}))
        shells = []
        try:
            s = Shell(root, 'paths', history=('git status --short', 'cd service-b/old', 'npm run test -- --watch'))
            shells.append(s)
            s.send('git stat', 0.6)
            s.send('\t', 0.5)
            s.expect('git status', 'A directory cannot replace the git subcommand or inject history flags')
            s.clear()
            s.send('npm run te', 0.6)
            # The first native npm completion starts Node and loads npm itself.
            s.send('\t', 3)
            s.expect('npm run test', 'npm script completion ignores a tests directory and remembered flags')
            s.command('comp-rebuild')
            s.send('npm run unit', 0.6)
            s.send('\t', 1.2)
            s.expect('npm run unit\\ test', 'npm candidates retain spaces and survive a completion rebuild')
            s.clear()
            s.send('cd desi', 0.6)
            s.send('\t', 0.5)
            s.expect('cd design\\ notes/', 'Native completion quotes directory names with spaces')
            s.send('\r', 0.5)
            assert s.snapshot()[3] == str((project/'design notes').resolve())
            s.command('cd ..')
            s.send('cd serv', 0.6)
            start = len(s.output)
            s.send('\t', 0.7)
            menu = visible(s.output[start:])
            assert b'service-a' in menu and b'service-b' in menu, menu[-500:]
            s.send('a', 0.3)
            s.send('\r', 0.4)
            s.expect('cd service-a/', 'Ambiguous directory completion requires a candidate selection')
            s.clear()
            s.command('cd -P linked-api')
            assert s.snapshot()[3] == str((project/'src/api').resolve())
            s.command('cd -')
            assert s.snapshot()[3] == str(project.resolve())
            print('PASS native cd options and previous-directory navigation', flush=True)
            s.command('cd src/api')
            (project/'src/client').mkdir()
            s.command('cd api client')
            assert s.snapshot()[3] == str((project/'src/client').resolve())
            print('PASS native cd string substitution', flush=True)
            s.command('cd ../..')
            # Long hints remain available without invoking completions on each keystroke.
            long_line = 'echo ' + 'long-history-fragment-' * 3
            s.command("print -s -- '" + long_line + "'")
            s.send(long_line[:-5], 0.5)
            assert s.snapshot(refresh=True)[1] == long_line[-5:]
            s.send(b'\x1b[C')
            s.expect(long_line, 'History hints work beyond the old 40-character cutoff')
            s.clear()
            # New terminals and existing terminals must expose the same candidates.
            for pause in (0.0, 0.6):
                s.send('cd serv', pause)
                start = len(s.output)
                s.send('\t', 1.2)
                menu = visible(s.output[start:])
                assert b'service-a' in menu and b'service-b' in menu, menu[-500:]
                s.send(b'\x1b', 0.6)
                s.clear()
            print('PASS Tab offers the same candidates immediately and after a pause', flush=True)

            shared = root/'shared-state'
            a = Shell(root, 'pane-a', shared)
            b = Shell(root, 'pane-b', shared)
            shells.extend((a, b))
            b.command('echo LOCAL_PANE_B')
            a.command('echo FOREIGN_PANE_A_753')
            history_file = shared/'zsh/history'
            before_search = history_file.read_bytes()
            b.send(b'\x12', 0.7)
            b.send('753', 0.3)
            b.send('\r', 0.4)
            b.expect('echo FOREIGN_PANE_A_753', 'Ctrl-R finds another open pane command while idle')
            assert history_file.read_bytes() == before_search, 'Search must not rewrite history'
            b.clear()
            b.send('echo keep-this')
            b.send(b'\x12', 1.2)
            b.send(b'\x1b', 0.6)
            b.expect('echo keep-this', 'Cancelling global search preserves the pending command')
            b.clear()
            b.send(b'\x1b[A')
            b.expect('echo LOCAL_PANE_B', 'Up excludes the imported command and stays local')
            b.send(b'\x1b[B')
            b.expect('', 'Down restores the original empty input')
            b.send('echo LOC')
            b.send(b'\x1b[A')
            b.expect('echo LOCAL_PANE_B', 'Native Up searches local history by typed prefix')
            b.send(b'\x1b[B')
            b.expect('echo LOC', 'Native Down restores the typed prefix')
            b.clear()
            b.command('source "$DOTDOTDOT_TEST_REPO/.zshrc"')
            b.command('echo LOCAL_AFTER_RELOAD')
            a.command('echo FOREIGN_AFTER_RELOAD_975')
            b.send(b'\x12', 0.7)
            b.send('975', 0.3)
            b.send('\r', 0.4)
            b.expect('echo FOREIGN_AFTER_RELOAD_975', 'Reload preserves global Ctrl-R')
            b.clear()
            b.send(b'\x1b[A')
            b.expect('echo LOCAL_AFTER_RELOAD', 'Reload preserves local Up history')
            b.clear()
            multiline = 'echo MULTILINE_HISTORY_357\necho SECOND_LINE_357'
            a.send(b'\x1b[200~' + multiline.encode() + b'\x1b[201~')
            assert a.snapshot()[0] == multiline
            a.send('\r', 0.5)
            b.send(b'\x12', 0.7)
            b.send('MULTILINE_HISTORY_357', 0.4)
            b.send('\r', 0.4)
            b.expect(multiline, 'Native history context and fzf preserve multiline commands')
            private_tmux(s, project)
            node_prompt(root, project)
        finally:
            for shell in reversed(shells):
                shell.close()
    print('All shell workflow checks passed.')


if __name__ == '__main__':
    main()
