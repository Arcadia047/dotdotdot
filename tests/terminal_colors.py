#!/usr/bin/env python3
"""Check real tmux color replies across manual/auto switches and full-screen apps.

Uses a private server, three disposable panes, and a simulated outer terminal.
No live sessions, clipboard, provider calls, or macOS appearance changes.
"""
import fcntl
import json
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

REPO = Path(__file__).resolve().parents[1]
TMUX = shutil.which('tmux')
assert TMUX, 'Install tmux before running this check'
PALETTES = {'light': ('#464261', '#faf4ed'), 'dark': ('#e0def4', '#191724')}

PANE = r'''
import json, os, pathlib, select, sys, time, tty
root, name = pathlib.Path(sys.argv[1]), sys.argv[2]
tty.setraw(0)
if name != 'plain':
    os.write(1, b'\x1b]10;#464261\x07\x1b]11;#faf4ed\x07\x1b]12;#464261\x07')
if name == 'fullscreen': os.write(1, b'\x1b[?1049h')
(root/(name+'.ready')).touch()
stage = 0
while True:
    trigger = root/(name+'.go'+str(stage))
    if not trigger.exists(): time.sleep(.01); continue
    if trigger.read_text() == 'leave-alt': os.write(1, b'\x1b[?1049l')
    os.write(1, b'\x1b]10;?\x07\x1b]11;?\x07\x1b]12;?\x07')
    output = b''
    until = time.monotonic()+2
    while time.monotonic()<until:
        if select.select([0], [], [], .02)[0]: output += os.read(0, 4096)
        if output.count(b'\x07')+output.count(b'\x1b\\') >= 3: break
    (root/(name+'.out'+str(stage))).write_text(output.hex())
    stage += 1
'''


def main():
    with tempfile.TemporaryDirectory(prefix='dotdotdot-terminal-colors-') as directory:
        root = Path(directory)
        config = root / 'config'
        config.mkdir()
        (config / 'dotfiles-theme').write_text('light\n')
        (root / '.tmux').symlink_to(REPO / '.tmux')
        (root / '.tmux.conf').symlink_to(REPO / '.tmux.conf')
        (root / 'tmux_no_auto_restore').touch()
        script = root / 'pane.py'
        script.write_text(PANE)
        env = dict(os.environ, HOME=directory, XDG_CONFIG_HOME=str(config),
                   TERM='xterm-256color', DOTFILES_THEME='light', COLORFGBG='0;15')
        for key in ('TMUX', 'TMUX_PANE'):
            env.pop(key, None)
        command = [TMUX, '-S', str(root / 'socket')]

        def tmux(*args):
            result = subprocess.run(command + list(args), env=env, text=True,
                                    capture_output=True, timeout=20)
            assert result.returncode == 0, result.stdout + result.stderr
            return result.stdout.strip()

        def launch(name):
            return shlex.join([sys.executable, str(script), directory, name])

        master = client = None
        pending = bytearray()

        def pump(seconds=.05):
            until = time.monotonic()+seconds
            while time.monotonic()<until:
                if not select.select([master], [], [], .01)[0]:
                    continue
                try:
                    data = os.read(master, 65536)
                except OSError:
                    break
                pending.extend(data)
                # Deliberately keep the client's cached Dawn colors throughout.
                # The shared mode must override these stale terminal replies.
                for match in list(re.finditer(rb'\x1b\](10|11);\?(?:\x07|\x1b\\)', pending)):
                    code = match[1]
                    color = b'4646/4242/6161' if code == b'10' else b'fafa/f4f4/eded'
                    os.write(master, b'\x1b]'+code+b';rgb:'+color+b'\x1b\\')
                if b'\x1b[c' in pending or b'\x1b[0c' in pending:
                    os.write(master, b'\x1b[?62;4;22c')
                if b'\x1b[>c' in pending or b'\x1b[>0c' in pending:
                    os.write(master, b'\x1b[>77;20261015;0c')
                if b'\x1b[>q' in pending:
                    os.write(master, b'\x1bP>|WezTerm fixture\x1b\\')
                pending.clear()

        def wait_for(file):
            deadline = time.monotonic()+8
            while not file.exists():
                assert time.monotonic()<deadline, f'Timed out waiting for {file.name}'
                pump()

        try:
            tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'audit', '-x', '100', '-y', '32', launch('plain'))
            tmux('split-window', '-h', '-d', '-t', 'audit:0', launch('fullscreen'))
            tmux('new-window', '-d', '-t', 'audit', '-n', 'hidden', launch('hidden'))
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 100, 640, 800))
            client = subprocess.Popen(command+['attach', '-t', 'audit'],
                                      stdin=slave, stdout=slave, stderr=slave, env=env)
            os.close(slave)
            for name in ('plain', 'fullscreen', 'hidden'):
                wait_for(root / (name+'.ready'))
            pump(.3)
            sync_env = dict(env, TMUX=f'{root / "socket"},{tmux("display", "-p", "#{pid}")},0')
            stages = [('light', False, ''), ('dark', False, ''), ('dark', False, 'leave-alt'),
                      ('light', False, ''), ('dark', True, ''), ('light', True, '')]
            for stage, (mode, auto, action) in enumerate(stages):
                if auto:
                    (config / 'dotfiles-theme').write_text('auto\n')
                    code = 'source "$1"; _dotdotdot_sync_system_theme "$2" force'
                else:
                    code = 'source "$1"; theme "$2"'
                result = subprocess.run(['/bin/zsh', '-dfc', code, 'theme-check',
                                         str(REPO / 'zsh/theme.zsh'), mode],
                                        env=sync_env, capture_output=True, text=True, timeout=20)
                assert result.returncode == 0, result.stdout+result.stderr
                for name in ('plain', 'fullscreen', 'hidden'):
                    (root / (name+'.go'+str(stage))).write_text(action if name == 'fullscreen' else '')
                for name in ('plain', 'fullscreen', 'hidden'):
                    output = root / (name+'.out'+str(stage))
                    wait_for(output)
                    replies = bytes.fromhex(output.read_text())
                    found = dict(re.findall(rb'\x1b\](1[012]);rgb:([0-9a-fA-F/]+)', replies))
                    for code, color in ((b'10', PALETTES[mode][0]), (b'11', PALETTES[mode][1]),
                                        (b'12', PALETTES[mode][0])):
                        expected = '/'.join(color[i:i+2]*2 for i in (1, 3, 5)).encode()
                        assert found.get(code) == expected, (mode, name, code, replies)
                print(f'PASS {"auto" if auto else "manual"} {mode}: OSC 10/11/12 in normal, full-screen and hidden panes {action}', flush=True)
            assert tmux('display', '-p', '-t', 'audit:0.1', '#{alternate_on}') == '0'
            # New windows inherit correct defaults without relying on a prompt.
            tmux('new-window', '-d', '-t', 'audit', '-n', 'new', launch('new'))
            wait_for(root / 'new.ready')
            assert tmux('display', '-p', '-t', 'audit:new', '#{pane_fg} #{pane_bg}') == '#464261 #faf4ed'
            print('PASS new window inherits the selected palette', flush=True)
        finally:
            subprocess.run(command+['kill-server'], env=env, capture_output=True)
            if client:
                client.wait(timeout=5)
            if master is not None:
                os.close(master)


if __name__ == '__main__':
    main()
