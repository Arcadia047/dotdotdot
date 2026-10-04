#!/usr/bin/env python3
"""Real-key zsh acceptance using installed plugins and disposable history/state.

Run explicitly: python3 tests/shell_completion.py. No personal history is read,
no fixture command is executed, and existing terminal sessions are untouched.
"""
import argparse
import fcntl
import os
from pathlib import Path
import pty
import select
import signal
import struct
import tempfile
import termios
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    repo = args.repo.resolve()
    prefix = Path(os.environ.get('HOMEBREW_PREFIX', '/opt/homebrew'))
    for plugin in ('share/zsh-autosuggestions/zsh-autosuggestions.zsh',
                   'opt/fzf-tab/share/fzf-tab/fzf-tab.zsh'):
        assert (prefix / plugin).is_file(), f'Install required shell plugin: {plugin}'
    with tempfile.TemporaryDirectory(prefix='dotdotdot-shell-') as directory:
        root = Path(directory)
        config = root / 'config'
        config.mkdir()
        (config / 'dotfiles-theme').write_text('auto\n')
        (config / 'dotfiles-theme-system').write_text('light\n')
        for name in ('alpha-fixture.txt', 'beta-fixture.txt'):
            (root / name).touch()
        (root / 'gamma-fixture-dir').mkdir()
        (root / '.p10k.zsh').symlink_to(repo / '.p10k.zsh')
        (root / '.zshrc').write_text('''
POWERLEVEL9K_DISABLE_CONFIGURATION_WIZARD=true
POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(prompt_char)
POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=()
source "$DOTDOTDOT_TEST_REPO/.zshrc"
print -s -- 'echo suggestion-accepted'
print -s -- 'cd gamma-fixture-dir/deeper/place'
_dotdotdot_test_capture() {
  print -rl -- "$BUFFER" "$POSTDISPLAY" "$CURSOR" > "$HOME/snapshot"
}
_dotdotdot_test_pwd() {
  print -r -- "$PWD" > "$HOME/pwd"
}
_dotdotdot_test_theme() {
  print -rl -- "$BUFFER" "$CURSOR" "$DOTFILES_THEME" "$COLORFGBG" \
    "$ZSH_HIGHLIGHT_STYLES[default]" "$ZSH_HIGHLIGHT_STYLES[path]" \
    "$ZSH_HIGHLIGHT_STYLES[command]" "$POWERLEVEL9K_PROMPT_CHAR_OK_VIINS_FOREGROUND" \
    "${region_highlight[@]}" > "$HOME/theme-snapshot"
}
ZSH_AUTOSUGGEST_IGNORE_WIDGETS+=(_dotdotdot_test_capture _dotdotdot_test_theme)
zle -N _dotdotdot_test_capture
bindkey '^X^S' _dotdotdot_test_capture
zle -N _dotdotdot_test_pwd
bindkey '^X^P' _dotdotdot_test_pwd
zle -N _dotdotdot_test_theme
bindkey '^X^T' _dotdotdot_test_theme
bindkey '^Xv' autosuggest-disable
bindkey '^Xe' autosuggest-enable
''')
        env = dict(os.environ, HOME=directory, ZDOTDIR=directory,
                   XDG_CONFIG_HOME=directory + '/config', XDG_CACHE_HOME=directory + '/cache',
                   XDG_STATE_HOME=directory + '/state', XDG_DATA_HOME=directory + '/data',
                   TMUX_BOOTSTRAPPED='1', DOTDOTDOT_TEST_REPO=str(repo), TERM='xterm-256color',
                   COLORTERM='truecolor')
        for key in ('TMUX', 'TMUX_PANE', '_DOTDOTDOT_ENV_LOADED', '_DOTDOTDOT_FZF_BASE_OPTS'):
            env.pop(key, None)
        pid, master = pty.fork()
        if pid == 0:
            os.chdir(directory)
            os.execve('/bin/zsh', ['/bin/zsh', '-d', '-i'], env)
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 120, 0, 0))
        output = bytearray()

        def pump(seconds):
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.05)[0]:
                    try:
                        output.extend(os.read(master, 65536))
                    except OSError:
                        break

        def send(keys):
            os.write(master, keys)
            pump(0.15)

        def snapshot():
            file = root / 'snapshot'
            file.unlink(missing_ok=True)
            send(b'\x18\x13')
            deadline = time.monotonic() + 2
            while not file.exists() and time.monotonic() < deadline:
                pump(0.05)
            return file.read_text().splitlines() if file.exists() else []

        def wait_for(condition, description):
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if condition():
                    return
                pump(0.1)
            raise AssertionError(description)

        def pwd_snapshot():
            file = root / 'pwd'
            file.unlink(missing_ok=True)
            send(b'\x18\x10')
            deadline = time.monotonic() + 2
            while not file.exists() and time.monotonic() < deadline:
                pump(0.05)
            return file.read_text().strip() if file.exists() else None

        def expect_buffer(expected, description):
            actual = snapshot()
            assert actual and actual[0].rstrip() == expected, f'{description}: {actual!r}'
            print('PASS ' + description, flush=True)

        def suggestion():
            send(b'echo ')
            wait_for(lambda: snapshot()[:2] == ['echo ', 'suggestion-accepted'],
                     'The history suggestion must be visible before testing acceptance')

        try:
            pump(2)
            suggestion()
            send(b'\t')
            pump(0.5)
            expect_buffer('echo suggestion-accepted', 'Tab inserts the visible suggestion without executing it')
            send(b'\x15\r')
            suggestion()
            send(b'\t')
            expect_buffer('echo suggestion-accepted', 'Tab still accepts after plugins rebind at the next prompt')
            send(b'\x15')
            suggestion()
            send(b'\x06')
            expect_buffer('echo suggestion-accepted', 'Ctrl-F remains an acceptance alias')
            send(b'\x15\x18v')
            send(b'cat alpha-fix')
            assert snapshot()[1] == '', 'Fallback test must have no visible suggestion'
            send(b'\t')
            expect_buffer('cat alpha-fixture.txt', 'Tab completes a filename when no suggestion is visible')
            send(b'\x15')
            start = len(output)
            send(b'cat \t')
            wait_for(lambda: b'alpha-fixture.txt' in output[start:] and b'beta-fixture.txt' in output[start:],
                     'Tab must open the directory completion menu for ambiguous input')
            send(b'beta-fixture')
            pump(0.5)
            send(b'\r')
            expect_buffer('cat beta-fixture.txt', 'Selecting a completion inserts it without executing the command')
            send(b'\x15\x18e')
            suggestion()
            send(b'\t')
            expect_buffer('echo suggestion-accepted', 'Suggestion acceptance works again after using the completion menu')
            send(b'\x15cd gamma-fix')
            wait_for(lambda: snapshot()[:2] == ['cd gamma-fix', 'ture-dir/'],
                     'The local directory prefix must outrank the seeded history entry')
            print('PASS The local directory prefix outranks history from another directory', flush=True)
            send(b'\r')
            root_path = str(root.resolve())
            wait_for(lambda: pwd_snapshot() == root_path + '/gamma-fixture-dir',
                     'The typed prefix must land in the current directory')
            print('PASS cd uses the current directory prefix before zoxide', flush=True)
            send(b'\x15cd gamma-nowhere\r')
            pump(0.5)
            assert pwd_snapshot() == root_path + '/gamma-fixture-dir', \
                'A prefix that matches nothing locally must not leave the fixture directory'
            print('PASS cd still falls back when nothing local matches', flush=True)
            send(b'\x15source "$DOTDOTDOT_TEST_REPO/.zshrc"\r')
            pump(0.5)
            suggestion()
            send(b'\t')
            expect_buffer('echo suggestion-accepted', 'Reloading the config repairs an already-initialized shell')
            send(b'\x15tmux a -t lear')
            for mode, colorfgbg, command_color, prompt_color in (
                    ('dark', '15;0', '#31748f', '#c4a7e7'),
                    ('light', '0;15', '#286983', '#907aa9')):
                # Model WezTerm's atomic cache replacement while ZLE owns a pending line.
                temporary = config / 'appearance-next'
                temporary.write_text(mode + '\n')
                temporary.replace(config / 'dotfiles-theme-system')
                send(b'n')
                file = root / 'theme-snapshot'
                file.unlink(missing_ok=True)
                send(b'\x18\x14')
                wait_for(file.exists, 'Theme capture widget must run')
                actual = file.read_text().splitlines()
                assert actual[:4] == ['tmux a -t learn', '15', mode, colorfgbg], \
                    f'{mode} transition must refresh the palette without executing/editing the command: {actual!r}'
                assert actual[4:7] == ['none', 'underline', 'fg=' + command_color], actual
                assert actual[7] == prompt_color, actual
                assert any(region.startswith('0 4 fg=' + command_color) for region in actual[8:]), actual
                assert any(region.startswith('5 6 none') for region in actual[8:]), actual
                assert any(region.startswith('10 15 none') for region in actual[8:]), actual
                print('PASS ' + mode + ' switch repaints the pending command and inherits readable argument colors', flush=True)
                send(b'\x7f')
            for mode, suggestion_color in (('dark', '#908caa'), ('light', '#797593')):
                send(b'\x15echo sugges')
                wait_for(lambda: snapshot()[:2] == ['echo sugges', 'tion-accepted'],
                         'A suggestion must be visible before switching appearance')
                temporary = config / 'appearance-next'
                temporary.write_text(mode + '\n')
                temporary.replace(config / 'dotfiles-theme-system')
                send(b't')
                wait_for(lambda: snapshot()[:2] == ['echo suggest', 'ion-accepted'],
                         'Theme refresh must preserve the pending suggestion')
                file = root / 'theme-snapshot'
                file.unlink(missing_ok=True)
                send(b'\x18\x14')
                wait_for(file.exists, 'Theme capture widget must run')
                actual = file.read_text().splitlines()
                assert actual[2] == mode, actual
                assert any(region.startswith('12 24 fg=' + suggestion_color)
                           for region in actual[8:]), actual
                print('PASS ' + mode + ' switch repaints and preserves the visible suggestion', flush=True)
        finally:
            os.kill(pid, signal.SIGHUP)
            os.close(master)
            os.waitpid(pid, 0)
    print('All 10 shell completion and 4 theme transition checks passed.')


if __name__ == '__main__':
    main()
