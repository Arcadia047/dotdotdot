#!/usr/bin/env python3
"""Real OMP adapter smoke. Local loopback only; no inherited provider credentials.

Run: python3 omp/workflow/fixtures/real-rpc-smoke.py
Artifacts remain in its printed temporary directory for diagnosis.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--omp', default=shutil.which('omp'))
    parser.add_argument('--bun', default=shutil.which('bun'))
    args = parser.parse_args()
    if not args.omp or not args.bun:
        parser.error('Both omp and bun must be installed')
    root = Path(tempfile.mkdtemp(prefix='omp-adapter-smoke-', dir='/tmp'))
    for name in ('agent', 'home', 'cwd'):
        (root / name).mkdir()
    requests = []
    report = dict(verdict='blocked', summary='Loopback fixture planted defect')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            req = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            requests.append(dict(path=self.path, model=req.get('model'),
                                 tools=[t['function']['name'] for t in req.get('tools', [])],
                                 messages=req.get('messages')))
            (root / 'requests.json').write_text(json.dumps(requests, indent=2))
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()

            def send(delta, finish=None):
                event = dict(id='fixture-stream', object='chat.completion.chunk', created=0,
                             model='fixture', choices=[dict(index=0, delta=delta, finish_reason=finish)])
                self.wfile.write(('data: ' + json.dumps(event) + '\n\n').encode())
                self.wfile.flush()

            send(dict(role='assistant', content=''))
            if len(requests) == 1:
                send(dict(tool_calls=[dict(index=0, id='model-tool-id', type='function',
                                           function=dict(name='finish_report', arguments=json.dumps(report)))]))
                send({}, 'tool_calls')
            else:
                send(dict(content=json.dumps(report)))
                send({}, 'stop')
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    (root / 'agent' / 'config.yml').write_text('startup:\n  quiet: true\n  checkUpdate: false\n  setupWizard: false\n  changelogMode: hidden\nmarketplace:\n  autoUpdate: off\n')
    (root / 'agent' / 'models.yml').write_text(f'''providers:
  rpc-fixture:
    baseUrl: http://127.0.0.1:{server.server_port}/v1
    auth: none
    api: openai-completions
    models:
      - id: fixture
        name: Local RPC fixture
        reasoning: false
        input: [text]
        contextWindow: 128000
        maxTokens: 4096
        cost: {{input: 0, output: 0, cacheRead: 0, cacheWrite: 0}}
''')
    (root / 'probe.ts').write_text('''import { getAgentDir } from "@oh-my-pi/pi-coding-agent";
import { Database } from "bun:sqlite";
import { writeFileSync } from "node:fs";
export default function(pi) {
 const parsed=pi.zod.object({ value: pi.zod.string() }).parse({value:"loaded"});
 const db=new Database(getAgentDir()+"/probe.sqlite");
 const result=db.query("select 42 as value").get(); db.close();
 writeFileSync(getAgentDir()+"/extension-loaded.json",JSON.stringify({child:process.env.DOTDOTDOT_WORK_CHILD,parsed:parsed.value,value:result.value}));
}
''')
    env = {k: os.environ[k] for k in ('PATH', 'LANG') if k in os.environ}
    env.update(HOME=str(root / 'home'), PI_CODING_AGENT_DIR=str(root / 'agent'),
               PI_CONFIG_DIR=str(root / 'config'), XDG_CONFIG_HOME=str(root / 'xdg'),
               XDG_CACHE_HOME=str(root / 'cache'), XDG_STATE_HOME=str(root / 'state'),
               TMPDIR=str(root), TERM='dumb')
    command = [args.bun, str(Path(__file__).with_suffix('.ts')), str(root), args.omp]
    (root / 'launch.json').write_text(json.dumps(dict(command=command, env=env), indent=2))
    try:
        completed = subprocess.run(command, env=env, text=True, capture_output=True, timeout=45)
        (root / 'driver.stdout').write_text(completed.stdout)
        (root / 'driver.stderr').write_text(completed.stderr)
        if completed.returncode:
            raise RuntimeError(completed.stderr)
        assert len(requests) == 2, requests
        assert all(r['path'] == '/v1/chat/completions' and r['model'] == 'fixture' for r in requests)
        assert 'finish_report' in requests[0]['tools'], requests
        assert not ({'task', 'eval', 'write', 'edit', 'bash'} & set(requests[0]['tools'])), requests
        print(completed.stdout.strip())
    finally:
        server.shutdown()
        server.server_close()
        print('Evidence: ' + str(root), flush=True)


if __name__ == '__main__':
    main()
