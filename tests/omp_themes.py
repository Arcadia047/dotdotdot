#!/usr/bin/env python3
"""Render both shared themes with installed OMP in isolated offline PTY sessions."""
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import struct
import subprocess
import tempfile
import termios
import time

REPO = Path(__file__).resolve().parents[1]
OMP = shutil.which('omp')
assert OMP, 'Install optional OMP before running this check'


def main():
    for mode, variant, text, base in (('light', 'dawn', '#464261', '#faf4ed'),
                                       ('dark', 'main', '#e0def4', '#191724')):
        with tempfile.TemporaryDirectory(prefix='dotdotdot-omp-render-') as directory:
            root = Path(directory)
            agent = root / 'agent'
            (agent / 'themes').mkdir(parents=True)
            for name in ('main', 'dawn'):
                (agent / 'themes' / f'dotdotdot-rose-pine-{name}.json').symlink_to(
                    REPO / 'omp/themes' / f'dotdotdot-rose-pine-{name}.json')
            (agent / 'config.yml').write_text(
                'theme:\n  light: dotdotdot-rose-pine-dawn\n  dark: dotdotdot-rose-pine-main\n'
                'terminal:\n  showImages: false\nstartup:\n  quiet: true\n  checkUpdate: false\n'
                '  setupWizard: false\n  changelogMode: hidden\nmarketplace:\n  autoUpdate: off\n')
            timestamp = '2026-10-15T00:00:00.000Z'
            entries = [dict(type='session', version=3, id='theme-fixture', timestamp=timestamp,
                            cwd=directory),
                       dict(type='message', id='m0', parentId=None, timestamp=timestamp,
                            message=dict(role='user', content='THEME RENDER FIXTURE', timestamp=0))]
            fixture = root / 'fixture.jsonl'
            fixture.write_text(''.join(json.dumps(entry)+'\n' for entry in entries))
            env = {key: os.environ[key] for key in ('PATH', 'LANG', 'TMPDIR') if key in os.environ}
            env.update(HOME=directory, PI_CODING_AGENT_DIR=str(agent),
                       XDG_CONFIG_HOME=str(root / 'config'), XDG_CACHE_HOME=str(root / 'cache'),
                       XDG_STATE_HOME=str(root / 'state'), TERM='xterm-256color',
                       COLORTERM='truecolor', COLORFGBG='0;15' if mode == 'light' else '15;0')
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 36, 100, 720, 800))
            process = subprocess.Popen([OMP, '--resume', str(fixture), '--cwd', directory,
                                        '--no-extensions', '--no-skills', '--no-rules',
                                        '--no-lsp', '--no-pty', '--no-title'],
                                       stdin=slave, stdout=slave, stderr=slave, env=env)
            os.close(slave)
            output = bytearray()
            try:
                deadline = time.monotonic()+12
                rendered = False
                while time.monotonic()<deadline:
                    if select.select([master], [], [], .05)[0]:
                        try:
                            data = os.read(master, 65536)
                        except OSError:
                            break
                        output.extend(data)
                        for code, color in ((b'10', text), (b'11', base), (b'12', text)):
                            if b'\x1b]'+code+b';?' in data:
                                rgb = '/'.join(color[i:i+2]*2 for i in (1, 3, 5)).encode()
                                os.write(master, b'\x1b]'+code+b';rgb:'+rgb+b'\x1b\\')
                        if b'\x1b[6n' in data:
                            os.write(master, b'\x1b[1;1R')
                        if b'\x1b[c' in data or b'\x1b[0c' in data:
                            os.write(master, b'\x1b[?62;22c')
                    plain = re.sub(rb'\x1b\[[0-?]*[ -/]*[@-~]', b'', bytes(output))
                    rgb = ';'.join(str(int(text[i:i+2], 16)) for i in (1, 3, 5)).encode()
                    if b'THEME RENDER FIXTURE' in plain and b'38;2;'+rgb in output:
                        rendered = True
                        break
                    if process.poll() is not None:
                        break
                assert rendered, (mode, bytes(output[-2000:]))
                assert b'Failed to load theme' not in output and b'Invalid theme' not in output
                print(f'PASS installed OMP renders {variant} with shared text {text}', flush=True)
            finally:
                try:
                    if process.poll() is None:
                        process.terminate()
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                finally:
                    os.close(master)


if __name__ == '__main__':
    main()
