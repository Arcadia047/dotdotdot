#!/usr/bin/env python3
"""Real public WorkManager + OmpWorker + installed OMP acceptance fixture.

Run: python3 omp/workflow/fixtures/real-manager-smoke.py

A deterministic loopback-only provider drives native write/bash tools, then
fresh read-only reviewer sessions and finish_report. Real Git worktrees, shell
checks, OMP sessions and RPC transcripts remain in the printed evidence folder.
HOME/config/environment are isolated; no external provider or credential is used.
This tests pipeline mechanics, not model judgment, skill adoption, or work data.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import queue
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import time


def text_content(content):
    if isinstance(content, str):
        return content
    return '\n'.join(part.get('text', '') for part in content or [] if isinstance(part, dict))


def warm_agent(root, executable, env):
    """Initialize one shared profile like the already-running production parent.

    OMP 18.18.6 can race its first agent.db migration when two entirely new
    processes start together. This real ready/get_state exchange is a fixture
    prerequisite, with no prompt/model call, not a manager runtime workaround.
    """
    command = [executable, '--mode', 'rpc', '--no-ui', '--cwd', str(root),
               '--session-dir', str(root / 'prewarm-session'), '--model', 'manager-fixture/fixture',
               '--thinking', 'off', '--no-tools', '--no-extensions', '--no-skills', '--no-rules',
               '--no-context-files', '--no-lsp', '--no-pty', '--no-title']
    (root / 'prewarm-launch.json').write_text(json.dumps(command, indent=2))
    frames = []
    received = queue.Queue()
    with (root / 'prewarm.stderr.log').open('w') as stderr:
        process = subprocess.Popen(command, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=stderr, text=True, start_new_session=True)

        def read():
            for line in process.stdout:
                frames.append(line)
                received.put(json.loads(line))
            received.put(dict(eof=True))

        reader = threading.Thread(target=read, daemon=True)
        reader.start()
        deadline = time.monotonic() + 20

        def until(predicate):
            while True:
                frame = received.get(timeout=max(.001, deadline - time.monotonic()))
                assert not frame.get('eof'), 'OMP exited during isolated profile initialization'
                if predicate(frame):
                    return frame

        try:
            until(lambda frame: frame.get('type') == 'ready')
            process.stdin.write(json.dumps(dict(id='prewarm-state', type='get_state')) + '\n')
            process.stdin.flush()
            state = until(lambda frame: frame.get('type') == 'response' and frame.get('id') == 'prewarm-state')
            assert state['success'], state
            assert state['data']['model']['provider'] == 'manager-fixture', state
            assert state['data']['model']['id'] == 'fixture', state
            process.stdin.close()
            process.wait(timeout=max(.001, deadline - time.monotonic()))
            assert process.returncode == 0, 'OMP profile initialization failed'
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
            reader.join(timeout=1)
            (root / 'prewarm.stdout.jsonl').write_text(''.join(frames))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--omp', default=shutil.which('omp'))
    parser.add_argument('--bun', default=shutil.which('bun'))
    args = parser.parse_args()
    if not args.omp or not args.bun:
        parser.error('Both omp and bun must be installed')
    root = Path(tempfile.mkdtemp(prefix='omp-manager-smoke-', dir='/tmp'))
    for name in ('agent', 'home', 'requests'):
        (root / name).mkdir()
    lock = threading.Lock()
    requests = []
    errors = []
    # Both first implementation requests must be in flight before either writes.
    parallel = threading.Barrier(2, timeout=20)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            try:
                self.respond()
            except Exception as error:
                with lock:
                    errors.append(repr(error))
                    (root / 'provider-errors.json').write_text(json.dumps(errors, indent=2))
                try:
                    self.send_error(500, 'Local fixture assertion failed; inspect evidence')
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def respond(self):
            req = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            messages = req.get('messages', [])
            prompt = '\n'.join(text_content(message.get('content')) for message in messages if message.get('role') == 'user')
            job = re.search(r'Fixture job: (alpha|beta)\.', prompt)
            assert job, 'Missing fixture job in real manager prompt'
            job = job.group(1)
            if 'Perform an independent Spec review;' in prompt:
                role = 'spec-reviewer'
            elif 'Perform an independent Standards and technical correctness review;' in prompt:
                role = 'technical-reviewer'
            else:
                role = 'implementer'
                assert f'You are the implementer for job {job}.' in prompt
            tools = {tool['function']['name']: tool['function'] for tool in req.get('tools', [])}
            assert self.path == '/v1/chat/completions' and req.get('model') == 'fixture'
            assert not ({'task', 'eval'} & set(tools)), 'Delegation tools must be unavailable'
            if role == 'implementer':
                assert {'write', 'edit', 'bash'} <= set(tools)
                assert 'finish_report' not in tools
            else:
                assert {'read', 'finish_report'} <= set(tools)
                assert not ({'write', 'edit', 'bash'} & set(tools)), 'Review sessions must be read-only'
            calls = [call['function']['name'] for message in messages if message.get('role') == 'assistant'
                     for call in message.get('tool_calls', [])]
            results = [text_content(message.get('content')) for message in messages if message.get('role') == 'tool']
            assert all(not result.lstrip().startswith(('Error:', 'Error executing')) for result in results), results
            record = dict(path=self.path, job=job, role=role, priorTools=calls, tools=list(tools), request=req,
                          receivedAt=time.monotonic())
            with lock:
                number = len(requests) + 1
                record['number'] = number
                requests.append(record)
                (root / 'requests' / f'{number:03d}-{job}-{role}.json').write_text(json.dumps(record, indent=2))

            name = None
            report = None
            if role == 'implementer':
                expected = ['write', 'bash']
                assert calls == expected[:len(calls)] and len(calls) <= len(expected), calls
                if not calls:
                    parallel.wait()
                    name, arguments = 'write', dict(path='value.txt', content=f'{job}\n')
                elif calls == ['write']:
                    name = 'bash'
                    arguments = dict(command=f'test "$(cat value.txt)" = {job} && '
                                     f'git add -- value.txt && git commit -m "Set fixture {job}" && '
                                     f'printf "fixture-native-commit-{job} " && git rev-parse HEAD')
                else:
                    assert any(f'fixture-native-commit-{job}' in result for result in results), results
            else:
                revision = re.search(r'Call finish_report with revision ([a-f0-9]{40}),', prompt)
                diff = re.search(r'Read the runtime-captured actual diff at (.+?), produced from base ', prompt)
                assert revision and diff, 'Missing runtime revision/diff from actual quality prompt'
                report = dict(revision=revision.group(1), verdict='pass', findings=[])
                expected = ['read', 'read', 'finish_report']
                assert calls == expected[:len(calls)] and len(calls) <= len(expected), calls
                if not calls:
                    name, arguments = 'read', dict(path=diff.group(1))
                elif calls == ['read']:
                    assert 'value.txt' in results[-1] and job in results[-1], results
                    name, arguments = 'read', dict(path='value.txt')
                elif calls == ['read', 'read']:
                    assert job in results[-1], results
                    name, arguments = 'finish_report', report

            if name:
                parameters = tools[name].get('parameters', {})
                if 'i' in parameters.get('properties', {}):
                    arguments['i'] = f'Exercise native {name} for fixture {job} {role}'
                assert set(parameters.get('required', [])) <= set(arguments), (name, tools[name])
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()

            def send(delta, finish=None):
                event = dict(id=f'fixture-stream-{number}', object='chat.completion.chunk', created=0,
                             model='fixture', choices=[dict(index=0, delta=delta, finish_reason=finish)])
                self.wfile.write(('data: ' + json.dumps(event) + '\n\n').encode())
                self.wfile.flush()

            send(dict(role='assistant', content=''))
            if name:
                send(dict(tool_calls=[dict(index=0, id=f'fixture-tool-{number}', type='function',
                                           function=dict(name=name, arguments=json.dumps(arguments)))]))
                send({}, 'tool_calls')
            else:
                send(dict(content=json.dumps(report) if report else f'Committed scoped fixture change for {job}.'))
                send({}, 'stop')
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()

    env = {key: os.environ[key] for key in ('PATH', 'LANG') if key in os.environ}
    env.update(HOME=str(root / 'home'), PI_CODING_AGENT_DIR=str(root / 'agent'),
               PI_CONFIG_DIR=str(root / 'config'), XDG_CONFIG_HOME=str(root / 'xdg'),
               XDG_CACHE_HOME=str(root / 'cache'), XDG_STATE_HOME=str(root / 'state'),
               TMPDIR=str(root), TERM='dumb')
    server = None
    process = None
    try:
        version = subprocess.run([args.omp, '--version'], env=env, text=True, capture_output=True, check=True, timeout=10).stdout.strip()
        (root / 'omp-version.txt').write_text(version + '\n')
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.daemon_threads = True
        threading.Thread(target=server.serve_forever, daemon=True).start()
        (root / 'agent' / 'config.yml').write_text('startup:\n  quiet: true\n  checkUpdate: false\n  setupWizard: false\n  changelogMode: hidden\nmarketplace:\n  autoUpdate: off\n')
        (root / 'agent' / 'models.yml').write_text(f'''providers:
  manager-fixture:
    baseUrl: http://127.0.0.1:{server.server_port}/v1
    auth: none
    api: openai-completions
    models:
      - id: fixture
        name: Local manager acceptance fixture
        reasoning: false
        input: [text]
        contextWindow: 128000
        maxTokens: 4096
        cost: {{input: 0, output: 0, cacheRead: 0, cacheWrite: 0}}
''')
        warm_agent(root, args.omp, env)
        assert not requests, 'Profile initialization must not invoke any model'
        command = [args.bun, str(Path(__file__).with_suffix('.ts')), str(root), args.omp]
        (root / 'launch.json').write_text(json.dumps(dict(command=command, env=env, ompVersion=version), indent=2))
        with (root / 'driver.stdout').open('w') as stdout, (root / 'driver.stderr').open('w') as stderr:
            process = subprocess.Popen(command, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
            process.wait(timeout=90)
        assert process.returncode == 0, (root / 'driver.stderr').read_text()
        assert not errors, errors
        groups = {}
        for request in requests:
            groups.setdefault((request['job'], request['role']), []).append(request['priorTools'])
        expected = {(job, role): [[], ['write'], ['write', 'bash']] if role == 'implementer'
                    else [[], ['read'], ['read', 'read'], ['read', 'read', 'finish_report']]
                    for job in ('alpha', 'beta') for role in ('implementer', 'spec-reviewer', 'technical-reviewer')}
        assert groups == expected, groups
        result = json.loads((root / 'result.json').read_text())
        result.update(ompVersion=version, providerRequests=len(requests), parallelImplementerRequests=True)
        (root / 'result.json').write_text(json.dumps(result, indent=2))
        print(f'PASS {version}: 2 ready branches; native writes/commits; 2 runtime checks; 4 fresh reviews; original dirty checkout preserved.')
        print('Scope: controlled provider behavior verifies pipeline mechanics, not model judgment or skill adoption.')
    finally:
        if process and process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
        # OmpWorker uses detached child groups; preserve logs but stop survivors
        # after a driver timeout, only when their live command still names this run.
        for record in (root / 'state').rglob('process.json'):
            worker = json.loads(record.read_text())
            pid = worker['pid']
            command = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], text=True, capture_output=True, timeout=3).stdout
            if str(root) in command:
                try:
                    os.killpg(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        parallel.abort()
        if server:
            server.shutdown()
            server.server_close()
        print('Evidence: ' + str(root), flush=True)


if __name__ == '__main__':
    main()
