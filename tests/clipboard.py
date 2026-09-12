#!/usr/bin/env python3
"""Mouse and keyboard copying through a private tmux PTY and OSC 52 clipboard.

Run: python3 tests/clipboard.py. Captures terminal clipboard messages locally;
it never reads or changes the macOS clipboard or attaches to a live tmux server.
"""
import argparse
import base64
import fcntl
import os
from pathlib import Path
import pty
import re
import select
import shlex
import shutil
import struct
import subprocess
import sys
import tempfile
import termios
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--copy-config', type=Path)
    args = parser.parse_args()
    repo = args.repo.resolve()
    copy_config = (args.copy_config or repo / '.tmux/copy.conf').resolve()
    assert shutil.which('tmux'), 'Install tmux before running this test'
    lines = ['alpha bravo charlie delta', '0123456789ABCDEFGHIJKLMNO', 'very useful text']
    with tempfile.TemporaryDirectory(prefix='dotdotdot-copy-') as directory:
        root = Path(directory)
        socket = str(root / 'tmux.sock')
        fixture = root / 'fixture.py'
        screen = '\x1b[2J\x1b[5;1H' + '\r\n'.join(lines) + '\r\n'
        fixture.write_text('import os, tty\n'
                           'tty.setraw(0)\n'
                           f'os.write(1, {screen.encode()!r})\n'
                           'while True:\n'
                           ' data = os.read(0, 4096)\n'
                           ' if not data: break\n'
                           f' with open({str(root / "input")!r}, "ab") as stream: stream.write(data)\n')
        config = root / 'tmux.conf'
        config.write_text('set -g status off\nset -g default-shell /bin/bash\n'
                          "set -as terminal-features ',xterm-256color:clipboard'\n"
                          f'source-file {shlex.quote(str(repo / ".tmux/navigation.conf"))}\n'
                          f'source-file {shlex.quote(str(copy_config))}\n')
        env = dict(os.environ, TERM='xterm-256color')
        env.pop('TMUX', None)
        env.pop('TMUX_PANE', None)

        def tmux(*command):
            return subprocess.check_output(['tmux', '-S', socket, *command], env=env,
                                           text=True, stderr=subprocess.STDOUT, timeout=5).rstrip('\n')

        master = client = None
        output = bytearray()

        def pump(seconds=0.05):
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.01)[0]:
                    try:
                        output.extend(os.read(master, 65536))
                    except OSError:
                        break

        def send(keys):
            os.write(master, keys)
            pump()

        def mouse(code, point, release=False):
            x, y = point
            send(f'\x1b[<{code};{x};{y}{"m" if release else "M"}'.encode())

        def clipboard():
            messages = re.findall(rb'\x1b\]52;[^;]*;([A-Za-z0-9+/=]+)(?:\x07|\x1b\\)', output)
            return [base64.b64decode(value).decode() for value in messages]

        def check_copy(label, expected, key=b'y'):
            # tmux can include a trailing row break when selection reaches EOL.
            send(key)
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and (not clipboard() or clipboard()[-1].rstrip('\n') != expected.rstrip('\n')):
                pump()
            values = clipboard()
            assert values and values[-1].rstrip('\n') == expected.rstrip('\n'), f'{label}: clipboard {values[-1:]!r} != {expected!r}'
            assert tmux('show-buffer') == expected.rstrip('\n'), f'{label}: tmux paste buffer disagrees'
            assert tmux('display', '-p', '#{pane_in_mode}') == '0', f'{label}: trapped in copy mode'
            print('PASS ' + label, flush=True)

        def drag(start, motion, end):
            # Separate gestures so tmux does not classify them as double/triple clicks.
            pump(0.4)
            count = len(clipboard())
            mouse(0, start)
            mouse(32, motion)
            mouse(0, end, release=True)
            assert tmux('display', '-p', '#{selection_present}') == '1', 'Release lost the selection'
            assert len(clipboard()) == count, 'Mouse release copied before explicit y/Enter'

        try:
            tmux('-f', str(config), 'new-session', '-d', '-s', 'qa', '-x', '100', '-y', '24',
                 shlex.join([sys.executable, '-u', str(fixture)]))
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 100, 0, 0))
            client = subprocess.Popen(['tmux', '-S', socket, 'attach-session', '-t', 'qa'],
                                      stdin=slave, stdout=slave, stderr=slave, env=env)
            os.close(slave)
            pump(0.3)
            assert lines[0] in tmux('capture-pane', '-p'), 'Fixture did not render'
            drag((1, 5), (2, 5), (len(lines[0]), 5))
            check_copy('Fast drag copies the release position, not two characters', lines[0])
            send(lines[0].encode())
            assert (root / 'input').read_text() == lines[0], 'Paste did not reach the application'
            assert clipboard()[-1] == lines[0], 'Pasting changed clipboard contents'
            print('PASS Copied text can be pasted immediately without changing the clipboard', flush=True)
            drag((len(lines[0]), 5), (len(lines[0]) - 1, 5), (1, 5))
            check_copy('Reverse fast drag preserves the full selection', lines[0])
            drag((7, 5), (8, 5), (5, 6))
            check_copy('Multiline fast drag includes the final line', lines[0][6:] + '\n' + lines[1][:5])
            drag((1, 7), (16, 7), (16, 7))
            check_copy('Repeated ordinary drag supports Enter as a copy alias', lines[2], b'\r')
            send(b'\x01[\x16')  # Enter copy mode, then enable rectangles.
            drag((1, 5), (2, 5), (8, 6))
            assert tmux('display', '-p', '#{rectangle_toggle}') == '1', 'Release lost rectangle mode'
            check_copy('Rectangular drag retains its shape and final coordinates', lines[0][:8] + '\n' + lines[1][:8] + '\n')
            send(b'\x01[')
            for key in b'gjjjj0vll':
                send(bytes([key]))
            check_copy('Keyboard v selection and y still copy normally', lines[0][:3])
        finally:
            subprocess.run(['tmux', '-S', socket, 'kill-server'], env=env, capture_output=True, timeout=5)
            if client:
                client.wait(timeout=5)
            if master is not None:
                os.close(master)
    print('All 7 clipboard checks passed.')


if __name__ == '__main__':
    main()
