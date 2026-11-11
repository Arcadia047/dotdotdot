#!/usr/bin/env python3
"""Native OMP dashboard acceptance; isolated home, no model or work credentials.

Run: python3 omp/workflow/fixtures/real-dashboard-smoke.py
Exercises actual extension loading, local HTTP auth, controls and shutdown.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, ProxyHandler, build_opener


def main():
    # Local acceptance must never send its capability through system proxies.
    urlopen = build_opener(ProxyHandler({})).open
    executable = shutil.which('omp')
    assert executable, 'Install OMP before this acceptance run.'
    root = Path(tempfile.mkdtemp(prefix='omp-dashboard-native-', dir='/tmp'))
    agent = root / 'agent'
    agent.mkdir()
    (root / 'home').mkdir()
    (agent / 'models.yml').write_text('''providers:
  fixture:
    baseUrl: http://127.0.0.1:9/v1
    auth: none
    api: openai-completions
    models:
      - id: model
        name: Local acceptance fixture
        reasoning: false
        input: [text]
        contextWindow: 128000
        maxTokens: 4096
        cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}
''')
    (agent / 'config.yml').write_text('startup:\n  quiet: true\n  checkUpdate: false\n  setupWizard: false\n  changelogMode: hidden\nmarketplace:\n  autoUpdate: off\n')
    entry = Path(__file__).resolve().parents[1] / 'index.ts'
    wrapper = root / 'entry.ts'
    wrapper.write_text('import {registerWorkExtension} from ' + json.dumps(str(entry)) + ''';
import {writeFileSync} from 'node:fs';
import {getAgentDir} from '@oh-my-pi/pi-coding-agent';
export default async function(pi) {
 const messages=[];
 const facade=new Proxy(pi,{get(target,key) {
  return key==='sendMessage' ? (message,options)=>{
   messages.push(message.content);
   writeFileSync(getAgentDir()+'/notices.json',JSON.stringify(messages));
   return pi.sendMessage(message,options);
  } : Reflect.get(target,key);
 }});
 registerWorkExtension(facade,{agentDir:getAgentDir()});
}
''')
    env = {key: os.environ[key] for key in ('PATH', 'LANG') if key in os.environ}
    env.update(HOME=str(root / 'home'), PI_CODING_AGENT_DIR=str(agent), PI_CONFIG_DIR='.omp', TMPDIR=str(root), TERM='dumb')
    common = [executable, '--mode', 'rpc', '--no-ui', '--model', 'fixture/model', '--no-tools', '--no-extensions', '--no-skills', '--no-rules', '--no-context-files', '--no-lsp', '--no-pty', '--no-title']
    # The standalone host rewrites its package alias in each extension entry,
    # not inside a secondary module's default factory. Check the real entry
    # separately, then use the pure registration seam for observable notices.
    preflight = subprocess.run(common + ['--extension', str(entry)], cwd=root, env=env,
                               input='{"id":"commands","type":"get_available_commands"}\n', capture_output=True, text=True, timeout=30)
    (root / 'entry-preflight.jsonl').write_text(preflight.stdout)
    assert preflight.returncode == 0 and not preflight.stderr, preflight.stderr
    preflight_frames = [json.loads(line) for line in preflight.stdout.splitlines()]
    assert any(command.get('name') == 'work' for frame in preflight_frames
               for command in frame.get('commands', frame.get('data', {}).get('commands', []))), 'Production entry did not register /work'
    command = common + ['--extension', str(wrapper)]
    frames = []
    with (root / 'stderr.log').open('w') as stderr:
        process = subprocess.Popen(command, cwd=root, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr, text=True)
        reader = threading.Thread(target=lambda: frames.extend(process.stdout), daemon=True)
        reader.start()

        def notices():
            path = agent / 'notices.json'
            try:
                return json.loads(path.read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                return []

        def slash(text, expected):
            before = len(notices())
            process.stdin.write(json.dumps(dict(id=f'command-{before}', type='prompt', message=text)) + '\n')
            process.stdin.flush()
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                recent = notices()[before:]
                if any(expected in item for item in recent):
                    return recent
                assert process.poll() is None, (root / 'stderr.log').read_text()
                time.sleep(.03)
            raise AssertionError(f'{text} did not complete; evidence: {root}')

        def request(base, token=None, body=None):
            headers = {'Authorization': 'Bearer ' + token} if token else {}
            if body is not None:
                headers.update({'Content-Type': 'application/json', 'Origin': base})
            return urlopen(Request(base + ('/api/control' if body is not None else '/api/status'), headers=headers,
                                   data=json.dumps(body).encode() if body is not None else None), timeout=5)

        try:
            notice = slash('/work dashboard', 'Work dashboard: ')[-1]
            address = notice.split('Work dashboard: ', 1)[1]
            parsed = urlsplit(address)
            base = f'{parsed.scheme}://{parsed.netloc}'
            token = parse_qs(parsed.fragment)['token'][0]
            try:
                request(base)
                raise AssertionError('Private status accepted without its capability')
            except HTTPError as error:
                assert error.code == 401
            state = json.load(request(base, token))
            assert state['counts']['total'] == 0 and state['profile'] == 'default'
            with urlopen(base + '/', timeout=5) as response:
                assert response.status == 200 and 'Content-Security-Policy' in response.headers
            assert json.load(request(base, token, {'action': 'pause'})) == {'accepted': True}
            assert json.load(request(base, token))['paused'] is True
            assert json.load(request(base, token, {'action': 'resume'})) == {'accepted': True}
            assert json.load(request(base, token))['paused'] is False
            assert all(len(message) < 350 for message in slash('/work status', 'Details: /work dashboard'))
            slash('/work dashboard stop', 'Work dashboard stopped.')
            try:
                request(base, token)
                raise AssertionError('Stopped dashboard still answered')
            except (URLError, ConnectionError):
                pass
            # Reopen and prove session shutdown closes the active HTTP server.
            notice = slash('/work dashboard', 'Work dashboard: ')[-1]
            parsed = urlsplit(notice.split('Work dashboard: ', 1)[1])
            final_base = f'{parsed.scheme}://{parsed.netloc}'
            final_token = parse_qs(parsed.fragment)['token'][0]
            process.stdin.close()
            process.wait(timeout=15)
            reader.join(timeout=2)
            assert process.returncode == 0, (root / 'stderr.log').read_text()
            try:
                request(final_base, final_token)
                raise AssertionError('Session shutdown left its dashboard alive')
            except (URLError, ConnectionError):
                pass
            print(f'PASS native OMP: dashboard/auth/pause/resume/stop/shutdown; no model request. Evidence: {root}')
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)
            (root / 'stdout.jsonl').write_text(''.join(frames))


if __name__ == '__main__':
    main()
