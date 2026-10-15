#!/usr/bin/env python3
"""Replay an offline OMP image through a private tmux server and terminal PTY.

Run: python3 tests/terminal_images.py
Requires installed omp and tmux with SIXEL. No live sessions, credentials,
clipboard or external model calls. --stream uses a loopback-only fixture server;
--tall tests an image larger than the viewport. The terminal's identity reply is
simulated; this checks protocol ownership and pane clipping, not native GUI pixels.
"""
import argparse
import base64
from contextlib import contextmanager
import fcntl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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
import tempfile
import termios
import threading
import time
import zlib

REPO = Path(__file__).resolve().parents[1]
SIXEL = re.compile(rb'\x1bP[0-9;]*q"\d+;\d+;(\d+);(\d+)[^\x1b]*\x1b\\')


def fixture_pixels_match(image):
    """Independently sample the encoded raster's four solid color regions."""
    width, height = int(image[1]), int(image[2])
    targets = {(width//4, height//4): (255, 255, 128),
               (3*width//4, height//4): (0, 255, 128),
               (width//4, 3*height//4): (255, 0, 128),
               (3*width//4, 3*height//4): (0, 0, 128)}
    samples, colors = {}, {}
    x = y = index = color = 0
    data = image[0].split(b'q', 1)[1][:-2].decode('ascii')
    while index < len(data):
        char = data[index]
        index += 1
        repeat = 1
        if char in '#"!':
            match = re.match(r'[0-9;]+', data[index:])
            assert match, 'Malformed SIXEL parameters'
            values = [int(value) for value in match[0].split(';')]
            index += len(match[0])
            if char == '#':
                color = values[0]
                if len(values) == 5:
                    assert values[1] == 2, 'Fixture expects RGB color registers'
                    colors[color] = tuple(round(value*255/100) for value in values[2:])
                continue
            if char == '"':
                continue
            repeat = values[0]
            char = data[index]
            index += 1
        if char == '$':
            x = 0
        elif char == '-':
            x = 0
            y += 6
        elif '?' <= char <= '~':
            bits = ord(char)-63
            for (tx, ty) in targets:
                if x <= tx < x+repeat and y <= ty < y+6 and bits & (1 << (ty-y)):
                    samples[tx, ty] = colors[color]
            x += repeat
        else:
            raise AssertionError(f'Unexpected SIXEL byte: {char!r}')
    return all(point in samples and all(abs(a-b) <= 10 for a, b in zip(samples[point], expected))
               for point, expected in targets.items())


@contextmanager
def local_stream(enabled):
    """Optional synthetic OpenAI-compatible stream, bound only to loopback."""
    if not enabled:
        yield None
        return

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            self.server.requests.append((self.path, request.get('model')))
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()

            def send(delta, finish=None):
                event = dict(id='local-image-stream', object='chat.completion.chunk',
                             created=0, model='scroll', choices=[dict(index=0, delta=delta,
                                                                      finish_reason=finish)])
                self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode())
                self.wfile.flush()

            send(dict(role='assistant', content=''))
            for index in range(60):
                send(dict(content=f'STREAM_ROW_{index:02d} text moves past the image.\n\n'))
                time.sleep(0.035)
            send(dict(content='STREAM_COMPLETE\n'))
            send({}, 'stop')
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.requests = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def image_fixture(root, tall=False):
    width, height = (540, 1440) if tall else (108, 72)
    pixels = b''.join(b'\0' + b''.join(bytes((255 if x < width//2 else 0,
                                            255 if y < height//2 else 0, 128))
                                    for x in range(width)) for y in range(height))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data))

    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b''))
    image = dict(type='image', data=base64.b64encode(png).decode(), mimeType='image/png')
    timestamp = '2026-10-15T00:00:00.000Z'
    usage = dict(input=1, output=1, cacheRead=0, cacheWrite=0, totalTokens=2,
                 cost=dict(input=0, output=0, cacheRead=0, cacheWrite=0, total=0))
    entries = [dict(type='session', version=3, id='image-repro', timestamp=timestamp, cwd=str(root))]
    messages = [dict(role='user', content='IMAGE REPRO FIXTURE', timestamp=0),
                dict(role='assistant', content=[dict(type='toolCall', id='read0', name='read',
                                                    arguments=dict(path='fixture.png'))],
                     api='anthropic-messages', provider='anthropic', model='claude-sonnet-4-5',
                     usage=usage, stopReason='toolUse', timestamp=1),
                dict(role='toolResult', toolCallId='read0', toolName='read', content=[image],
                     isError=False, timestamp=2)]
    for index, message in enumerate(messages):
        entries.append(dict(type='message', id=f'm{index}', parentId=f'm{index-1}' if index else None,
                            timestamp=timestamp, message=message))
    fixture = root/'fixture.jsonl'
    fixture.write_text(''.join(json.dumps(entry)+'\n' for entry in entries))
    return fixture


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', action='store_true', help='Bypass the adapter; expected to fail on OMP 18.4.1')
    parser.add_argument('--stream', action='store_true', help='Also drive real OMP streaming from a local fixture server')
    parser.add_argument('--tall', action='store_true', help='Use a 540x1440 image, taller than the 960x720 viewport')
    args = parser.parse_args()
    for command in ('omp', 'tmux'):
        assert shutil.which(command), f'Install {command} before running this check'
    with local_stream(args.stream) as server, tempfile.TemporaryDirectory(prefix='dotdotdot-images-') as directory:
        root = Path(directory)
        fixture = image_fixture(root, tall=args.tall)
        (root/'agent').mkdir()
        (root/'agent/config.yml').write_text(
            'terminal:\n  showImages: true\nstartup:\n  quiet: true\n  checkUpdate: false\n'
            '  setupWizard: false\n  changelogMode: hidden\nmarketplace:\n  autoUpdate: off\n')
        # Allowlist prevents inherited provider keys, brokers and user profiles.
        env = {key: os.environ[key] for key in ('PATH', 'LANG', 'TMPDIR') if key in os.environ}
        env.update(HOME=str(root), PI_CODING_AGENT_DIR=str(root/'agent'),
                   XDG_CONFIG_HOME=str(root/'config'), XDG_CACHE_HOME=str(root/'cache'),
                   XDG_STATE_HOME=str(root/'state'), TERM='xterm-256color',
                   COLORTERM='truecolor', WEZTERM_PANE='0')
        socket = str(root/'tmux.sock')
        config = root/'tmux.conf'
        config.write_text('set -g default-terminal tmux-256color\nset -g allow-passthrough on\n'
                          'set -g remain-on-exit on\n'
                          'set -g status on\nset -g status-left STATUS-SAFE\n'
                          'set -g status-right STATUS-SAFE\n'
                          'set -as terminal-features ",xterm-256color:sixel"\n')
        launch = root/'launch.zsh'
        launch.write_text('while [[ ! -f "$1" ]]; do sleep 0.02; done\nshift\n'
                          + ('' if args.baseline else f'source {shlex.quote(str(REPO/"zsh/omp.zsh"))}\n')
                          + 'omp "$@"\n')
        ready = root/'ready'
        command = ['/bin/zsh', '-df', str(launch), str(ready), '--resume', str(fixture),
                   '--cwd', str(root), '--no-extensions', '--no-skills', '--no-rules',
                   '--no-lsp', '--no-pty', '--no-title']
        if server:
            (root/'agent/models.yml').write_text(
                'providers:\n  image-fixture:\n'
                f'    baseUrl: http://127.0.0.1:{server.server_port}/v1\n'
                '    auth: none\n    api: openai-completions\n    models:\n'
                '      - id: scroll\n        name: Local image scroll fixture\n'
                '        reasoning: false\n        input: [text, image]\n'
                '        contextWindow: 128000\n        maxTokens: 4096\n'
                '        cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}\n')
            command += ['--model', 'image-fixture/scroll', '--no-tools']

        def tmux(*arguments):
            result = subprocess.run(['tmux', '-S', socket, *arguments], env=env, text=True,
                                    capture_output=True, timeout=8)
            assert result.returncode == 0, result.stderr or result.stdout
            return result.stdout.strip()

        master = client = None
        output = bytearray()
        replies = bytearray()

        def pump(seconds=0.1):
            deadline = time.monotonic()+seconds
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.02)[0]:
                    try:
                        data = os.read(master, 65536)
                    except OSError:
                        break
                    output.extend(data)
                    replies.extend(data)
                    # Answer tmux's terminal identification, not OMP's detection.
                    if b'\x1b[>q' in replies:
                        os.write(master, b'\x1bP>|WezTerm 20260909-081506-9fa147c9\x1b\\')
                        replies.clear()

        def redraw(label):
            output.clear()
            tmux('refresh-client')
            pump(0.4)
            images = list(SIXEL.finditer(output))
            assert images, (f'{label}: tmux cannot redraw the image; OMP bypassed its image grid '
                            f'(Kitty placements at startup: {kitty_count})')
            assert b'\x1b_G' not in output, f'{label}: cursor-based Kitty graphics escaped tmux'
            print('PASS '+label, flush=True)
            return images

        try:
            tmux('-f', str(config), 'new-session', '-d', '-s', 'qa', '-x', '80', '-y', '36',
                 shlex.join(command))
            assert tmux('display', '-p', '#{sixel_support}') == '1', 'tmux must be built with SIXEL'
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 36, 80, 960, 720))
            client = subprocess.Popen(['tmux', '-S', socket, 'attach', '-t', 'qa'],
                                      stdin=slave, stdout=slave, stderr=slave, env=env)
            os.close(slave)
            deadline = time.monotonic()+5
            while not tmux('display', '-p', '#{client_termtype}').startswith('WezTerm'):
                assert time.monotonic() < deadline, 'Simulated WezTerm handshake failed'
                pump()
            ready.touch()
            deadline = time.monotonic()+20
            while b'IMAGE REPRO FIXTURE' not in output:
                assert time.monotonic() < deadline, 'OMP did not render the fixture'
                pump()
            pump(1)
            kitty_count = len(re.findall(rb'\x1b_Ga=[tp]', output))
            assert kitty_count or SIXEL.search(output), 'OMP did not render an image at all'
            print(f'OMP startup: {kitty_count} Kitty transmit/placement commands, '
                  f'{len(SIXEL.findall(output))} SIXEL images', flush=True)
            if not args.baseline:
                assert any(fixture_pixels_match(image) for image in SIXEL.finditer(output)), (
                    'Image raster lost the fixture color regions')
                print('PASS decoded image pixels preserve all four recognizable color regions', flush=True)
            redraw('tmux owns and redraws the OMP image')
            # Switching away and back must restore the image without asking OMP to repaint.
            tmux('new-window', '-d', '-t', 'qa', '-n', 'blank', '/bin/cat')
            tmux('select-window', '-t', 'qa:1')
            pump(0.2)
            output.clear()
            tmux('refresh-client')
            pump(0.2)
            assert not SIXEL.search(output), 'Image leaked into an unrelated window'
            tmux('select-window', '-t', 'qa:0')
            pump(0.2)
            redraw('window switch restores the image without leaked placements')
            tmux('copy-mode', '-t', 'qa:0.0')
            tmux('send-keys', '-t', 'qa:0.0', '-X', 'scroll-up')
            pump(0.2)
            tmux('send-keys', '-t', 'qa:0.0', '-X', 'cancel')
            pump(0.2)
            redraw('copy-mode scrolling restores the image')
            # Resize/reflow and pane clipping must remain under tmux's control.
            tmux('split-window', '-h', '-d', '-t', 'qa:0.0', '/bin/cat')
            pump(1)
            images = redraw('split-pane reflow retains native images')
            pane_width = int(tmux('display', '-p', '-t', 'qa:0.0', '#{pane_width}'))
            pane_height = int(tmux('display', '-p', '-t', 'qa:0.0', '#{pane_height}'))
            for image in images:
                assert int(image[1]) <= pane_width*12, 'Image extends across the pane separator'
                assert int(image[2]) <= pane_height*20, 'Image taller than the pane'
                # tmux emits an absolute cursor move immediately before each image.
                position = re.search(rb'\x1b\[(\d*(?:;\d*)?)H$', output[:image.start()])
                assert position, 'Missing absolute image origin'
                coords = position[1].split(b';')
                row = int(coords[0] or b'1')-1
                col = int(coords[1] or b'1')-1 if len(coords) > 1 else 0
                assert row*20+int(image[2]) <= pane_height*20, 'Image overlaps the status bar'
                assert col*12+int(image[1]) <= pane_width*12, 'Image overlaps another pane'
            print('PASS image rectangles stay inside the pane and above the status bar', flush=True)
            if server:
                output.clear()
                tmux('send-keys', '-t', 'qa:0.0', '-l', 'scroll fixture')
                tmux('send-keys', '-t', 'qa:0.0', 'Enter')
                deadline = time.monotonic()+15
                while b'STREAM_COMPLETE' not in output:
                    assert time.monotonic() < deadline, (
                        'Local stream did not finish: '+tmux('capture-pane', '-p', '-t', 'qa:0.0'))
                    pump()
                pump(0.3)
                assert server.requests == [('/v1/chat/completions', 'scroll')], server.requests
                assert b'\x1b_G' not in output, 'Streaming revived cursor-based Kitty placements'
                assert b'STREAM_ROW_' in output, 'No text streamed through the real OMP renderer'
                print('PASS real OMP streams 60 text blocks past the image using only loopback', flush=True)
                # The old image must leave the viewport rather than linger over new text.
                output.clear()
                tmux('refresh-client')
                pump(0.4)
                assert not SIXEL.search(output), 'Scrolled-out image left a stale placement in the viewport'
                assert 'STREAM_COMPLETE' in tmux('capture-pane', '-p', '-t', 'qa:0.0')
                print('PASS scrolled-out image leaves no stale placement after streaming', flush=True)
        finally:
            # Let OMP dispose its workers/SQLite before removing their temporary home.
            if client and client.poll() is None:
                subprocess.run(['tmux', '-S', socket, 'send-keys', '-t', 'qa:0.0', 'C-c'],
                               env=env, capture_output=True, timeout=5)
                pump(0.1)
                subprocess.run(['tmux', '-S', socket, 'send-keys', '-t', 'qa:0.0', 'C-c'],
                               env=env, capture_output=True, timeout=5)
                deadline = time.monotonic()+5
                while time.monotonic() < deadline:
                    dead = subprocess.run(['tmux', '-S', socket, 'display', '-p', '-t', 'qa:0.0',
                                           '#{pane_dead}'], env=env, capture_output=True, text=True, timeout=5)
                    if dead.returncode or dead.stdout.strip() == '1':
                        break
                    pump(0.1)
            subprocess.run(['tmux', '-S', socket, 'kill-server'], env=env, capture_output=True, timeout=5)
            if client:
                client.wait(timeout=5)
            if master is not None:
                os.close(master)
    print('All terminal image checks passed. Native GUI appearance needs separate visual acceptance.')


if __name__ == '__main__':
    main()
