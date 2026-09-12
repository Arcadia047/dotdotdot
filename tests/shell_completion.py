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
        for name in ('alpha-fixture.txt', 'beta-fixture.txt'):
            (root / name).touch()
        (root / '.zshrc').write_text('''
POWERLEVEL9K_DISABLE_CONFIGURATION_WIZARD=true
POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(prompt_char)
POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=()
source "$DOTDOTDOT_TEST_REPO/.zshrc"
print -s -- 'echo suggestion-accepted'
_dotdotdot_test_capture() {
  print -rl -- "$BUFFER" "$POSTDISPLAY" "$CURSOR" > "$HOME/snapshot"
}
ZSH_AUTOSUGGEST_IGNORE_WIDGETS+=(_dotdotdot_test_capture)
zle -N _dotdotdot_test_capture
bindkey '^X^S' _dotdotdot_test_capture
bindkey '^Xv' autosuggest-disable
bindkey '^Xe' autosuggest-enable
''')
        env = dict(os.environ, HOME=directory, ZDOTDIR=directory,
                   XDG_CONFIG_HOME=directory + '/config', XDG_CACHE_HOME=directory + '/cache',
                   XDG_STATE_HOME=directory + '/state', XDG_DATA_HOME=directory + '/data',
                   TMUX_BOOTSTRAPPED='1', DOTDOTDOT_TEST_REPO=str(repo), TERM='xterm-256color')
        for key in ('TMUX', 'TMUX_PANE', '_DOTDOTDOT_ENV_LOADED'):
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
            send(b'\x15source "$DOTDOTDOT_TEST_REPO/.zshrc"\r')
            pump(0.5)
            suggestion()
            send(b'\t')
            expect_buffer('echo suggestion-accepted', 'Reloading the config repairs an already-initialized shell')
        finally:
            os.kill(pid, signal.SIGHUP)
            os.close(master)
            os.waitpid(pid, 0)
    print('All 7 shell completion checks passed.')


if __name__ == '__main__':
    main()
