#!/usr/bin/env python3
"""Opt-in workflow acceptance with real installed plugins/LSPs and a private PTY.

All fixtures and editor state are temporary. Never connects to a user's editor,
updates plugins, or changes the system clipboard.
"""
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
import threading
import time


REPO = Path(__file__).resolve().parents[1]


def main():
    shared = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))) / "nvim"
    assert (shared / "lazy/lazy.nvim").is_dir(), "Install the configured plugins first"
    with tempfile.TemporaryDirectory(prefix="dotdotdot-editor-") as directory:
        root = Path(directory)
        project = root / "project"
        project.mkdir()
        subprocess.run(["git", "init", "-q", str(project)], check=True)
        (project / "pyproject.toml").write_text('[tool.ruff.lint]\nselect = ["E", "F", "W", "I"]\n')
        (project / "newline.py").write_bytes(b'def ratio(a: int, b: int) -> float:\n    return a / b\n\nprint(ratio(3, 5))')
        (project / "helpers.py").write_text('def calculate_score(values: list[int]) -> int:\n    return sum(values)\n\nhidden_project_token = 42\n')
        main_text = 'from helpers import calculate_score\n\ncurrent_score = calculate_score([1, 2, 3])\nprint(current_score)\n'
        (project / "main.py").write_text(main_text)
        (project / "actions.py").write_text('import math\n\nprint(2 + 3)\n')
        (project / "imports.py").write_text('import sys\nimport os\n\nprint(sys.version, os.name)\n')
        (project / "page.html").write_text('<html lang="en"><body></body></html>\n')
        (project / "audit.json").write_text('{"score": 1,}\n')
        web = project / "web"
        web.mkdir()
        (web / "package.json").write_text('{"name":"editor-workflow-test","private":true}\n')
        (web / "tsconfig.json").write_text('{"compilerOptions":{"strict":true,"target":"ES2022"},"include":["*.ts"]}\n')
        (web / "helpers.ts").write_text('export function calculateScore(values: number[]): number { return values.reduce((sum, value) => sum + value, 0); }\n')
        (web / "main.ts").write_text('import { calculateScore } from "./helpers";\nconst currentScore = calculateScore([1, 2, 3]);\nconsole.log(currentScore);\n')
        (web / "style.css").write_text('h1 { color: blue; }\n')
        go = project / "go"
        go.mkdir()
        (go / "go.mod").write_text('module editor.workflow.test\n\ngo 1.24\n')
        (go / "main.go").write_text('package main\n\nfunc calculateTotal(values []int) int {\n total := 0\n for _, value := range values { total += value }\n return total\n}\n\nfunc main() { println(calculateTotal([]int{1, 2, 3})) }\n')
        (root / "foreign.py").write_text('foreign_customer_token = 1\n')
        config = root / "config"
        config.mkdir()
        (config / "nvim").symlink_to(REPO / "nvim")
        (config / "dotfiles-theme").write_text("dark\n")
        data = root / "data/nvim"
        data.mkdir(parents=True)
        for name in ("lazy", "mason", "site"):
            assert (shared / name).is_dir(), f"Missing installed runtime: {name}"
            (data / name).symlink_to(shared / name)
        env = dict(os.environ, XDG_CONFIG_HOME=str(config), XDG_DATA_HOME=str(root / "data"),
                   XDG_STATE_HOME=str(root / "state"), XDG_CACHE_HOME=str(root / "cache"),
                   NVIM_LOG_FILE=str(root / "nvim.log"), TERM="xterm-256color",
                   GOCACHE=str(root / "go-cache"), GOPATH=str(root / "go-path"))
        for name in ("NVIM", "NVIM_LISTEN_ADDRESS", "NVIM_APPNAME", "TMUX", "TMUX_PANE"):
            env.pop(name, None)
        socket = root / "editor.sock"
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 45, 160, 0, 0))
        editor = subprocess.Popen(["nvim", "-n", "-i", "NONE", "--listen", str(socket), "newline.py"],
                                  cwd=project, env=env, stdin=slave, stdout=slave, stderr=slave)
        os.close(slave)
        stopping = threading.Event()
        output = bytearray()

        def drain():
            while not stopping.is_set():
                try:
                    if select.select([master], [], [], .1)[0]:
                        chunk = os.read(master, 65536)
                        output.extend(chunk)
                        if b"\x1b]11;?" in chunk:
                            os.write(master, b"\x1b]11;rgb:1919/1717/2424\x1b\\")
                except OSError:
                    break

        threading.Thread(target=drain, daemon=True).start()

        def rpc(body):
            expression = 'luaeval(' + json.dumps('vim.json.encode((function() ' + body + ' end)())') + ')'
            result = subprocess.run(["nvim", "--server", str(socket), "--remote-expr", expression],
                                    env=env, capture_output=True, text=True, timeout=8)
            assert result.returncode == 0, result.stderr + result.stdout
            return json.loads(result.stdout)

        def eventually(check, description, timeout=15):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if check():
                    return
                time.sleep(.1)
            raise AssertionError(description)

        def keys(text):
            rpc('vim.api.nvim_input(' + json.dumps(text) + '); return true')
            time.sleep(.3)

        def edit(name):
            keys('<Esc>')
            rpc('vim.cmd.stopinsert(); vim.cmd.edit({args={' + json.dumps(name) + '},bang=true}); return true')

        def items():
            return rpc('local a={};for _,x in ipairs(require("blink.cmp").get_items()) do a[#a+1]={label=x.label,source=x.source_id} end;return a')

        try:
            eventually(lambda: socket.exists(), "Editor socket did not start")
            rpc('vim.opt.clipboard=""; _G.workflow_notifications={}; vim.notify=function(m,l) table.insert(_G.workflow_notifications,{message=m,level=l}) end; return true')
            eventually(lambda: rpc('return #vim.lsp.get_clients({bufnr=0})') == 2, "Python LSPs did not attach")
            eventually(lambda: rpc('return #vim.diagnostic.get(0)') > 0, "Missing newline diagnostic")
            keys(' cA')
            eventually(lambda: rpc('return vim.bo.modified'), "Space-cA failed to fix a valid missing newline")
            assert not rpc('return vim.tbl_filter(function(n)return n.level==vim.log.levels.ERROR end,_G.workflow_notifications)'), rpc('return _G.workflow_notifications')
            print("PASS native fix-all handles real Ruff diagnostics", flush=True)

            edit('helpers.py')
            edit('main.py')
            keys('Gohidden_pro')
            eventually(lambda: any(x['label'] == 'hidden_project_token' for x in items()), "Hidden project buffer missing from completion")
            assert all(x['source'] == 'buffer' for x in items()), items()
            keys('<Esc>')
            rpc('vim.cmd.vsplit(' + json.dumps(str(root / "foreign.py")) + ');vim.cmd("wincmd p");return true')
            keys('ccforeign_c')
            time.sleep(.5)
            assert not any(x['label'] == 'foreign_customer_token' for x in items()), items()
            keys('<Esc>')
            rpc('vim.cmd("wincmd p");vim.api.nvim_buf_set_lines(0,0,1,false,{"foreign_customer_token = 2"});vim.cmd.close();return true')
            keys('cccurrent_score.')
            eventually(lambda: any(x['source'] == 'lsp' for x in items()), "Useful member completion disappeared")
            assert all(x['source'] == 'lsp' for x in items()), items()
            keys('<Esc>')
            keys('cccal')
            keys('<C-Space>')
            eventually(lambda: any(x['source'] == 'lsp' for x in items()), "Explicit LSP completion unavailable")
            labels = [x['label'] for x in items()]
            assert labels.count('calculate_score') == 1, items()
            print("PASS project-scoped automatic names, members, and explicit LSP completion", flush=True)

            edit('page.html')
            eventually(lambda: rpc('return #vim.lsp.get_clients({bufnr=0,name="html"})') == 1, "Native command-function HTML server skipped")
            rpc('vim.api.nvim_buf_set_lines(0,0,-1,false,{""});return true')
            keys('ihtml5')
            assert not any(x['source'] == 'snippets' for x in items()), items()
            keys('<C-x><C-s>')
            eventually(lambda: any(x['source'] == 'snippets' for x in items()), "Explicit snippet completion unavailable")
            keys('<Tab>')
            keys('<CR>')
            eventually(lambda: rpc('return vim.snippet.active({direction=1})'), "HTML snippet did not expand")
            keys('eng')
            assert not rpc('return require("blink.cmp").is_menu_visible()'), "Automatic completion interrupted placeholder editing"
            keys('<Tab>')
            assert rpc('return vim.api.nvim_win_get_cursor(0)[1]') == 6, "Tab did not advance to title placeholder"
            keys('<Esc>')
            rpc('vim.snippet.stop();return true')
            print("PASS manual snippets and uninterrupted placeholder navigation", flush=True)

            edit('audit.json')
            eventually(lambda: rpc('return #vim.lsp.get_clients({bufnr=0,name="jsonls"})') == 1, "Native command-function JSON server skipped")
            eventually(lambda: rpc('return #vim.diagnostic.get(0)') > 0, "JSON diagnostics missing")
            print("PASS HTML and JSON native launchers attach", flush=True)

            edit('actions.py')
            eventually(lambda: rpc('return #vim.diagnostic.get(0)') > 0, "Unused import diagnostic missing")
            # Recreate an incompatible query without modifying installed files.
            rpc('vim.treesitter.query.set("diff","highlights","(fixture_missing_diff_node) @diff.delta");return true')
            keys(' ca')
            eventually(lambda: rpc('return vim.bo.filetype=="TelescopePrompt"'), "Code-action preview failed")
            keys('<Esc>')
            rpc('vim.treesitter.query.set("diff","highlights",nil);return true')
            keys(' cA')
            eventually(lambda: rpc('return vim.api.nvim_buf_get_lines(0,0,1,false)[1]~="import math"'), "Fix-all did not remove unused import")
            print("PASS preview and safe fixes on a real Ruff action", flush=True)

            edit('imports.py')
            eventually(lambda: rpc('return #vim.diagnostic.get(0)') > 0, "Unsorted import diagnostic missing")
            keys(' co')
            # Native selection remains available if multiple servers offer actions.
            if rpc('return vim.fn.mode()') == 'c':
                keys('1<CR>')
            eventually(lambda: rpc('return vim.api.nvim_buf_get_lines(0,0,1,false)[1]=="import os"'), "Organize imports failed")
            print("PASS native organize-import handling", flush=True)

            edit('main.py')
            rpc('vim.api.nvim_buf_set_lines(0,0,-1,false,vim.json.decode(' + json.dumps(json.dumps(main_text.splitlines())) + '));vim.api.nvim_win_set_cursor(0,{3,18});return true')
            keys('gd')
            eventually(lambda: rpc('return vim.api.nvim_buf_get_name(0):match("helpers.py$")~=nil'), "Definition jump failed")
            keys(' cr')
            eventually(lambda: rpc('return vim.fn.mode()=="c"'), "Rename input missing")
            keys('<C-u>project_total<CR>')
            eventually(lambda: rpc('return vim.api.nvim_get_current_line():find("project_total",1,true)~=nil'), "Rename did not edit helper")
            keys('<C-o>')
            eventually(lambda: rpc('return vim.api.nvim_get_current_line():find("project_total",1,true)~=nil'), "Cross-file rename did not edit caller")
            keys(' rr')
            eventually(lambda: rpc('for _,t in ipairs(require("overseer").list_tasks()) do if t.name=="Run main.py" then return t.status=="SUCCESS" end end;return false'), "Running a cross-file refactor used unsaved project edits")
            assert 'def project_total' in (project / 'helpers.py').read_text()
            assert (root / 'foreign.py').read_text() == 'foreign_customer_token = 1\n'
            assert rpc('return vim.bo[vim.fn.bufnr(' + json.dumps(str(root / 'foreign.py')) + ')].modified'), "Run saved unrelated project edits"
            print("PASS cross-file rename saves the current project before run", flush=True)

            edit('web/style.css')
            eventually(lambda: rpc('return #vim.lsp.get_clients({bufnr=0,name="cssls"})') == 1, "Native CSS launcher skipped")
            edit('web/main.ts')
            eventually(lambda: rpc('return #vim.lsp.get_clients({bufnr=0,name="vtsls"})') == 1, "TypeScript server did not attach")
            keys('Gocal')
            eventually(lambda: any(x['label'] == 'calculateScore' for x in items()), "TypeScript project names missing")
            assert all(x['source'] == 'buffer' for x in items()), items()
            keys('<C-Space>')
            eventually(lambda: any(x['source'] == 'lsp' and x['label'] == 'calculateScore' for x in items()), "Explicit TypeScript function completion missing")
            rpc('local b=require("blink.cmp");for i,x in ipairs(b.get_items()) do if x.label=="calculateScore" then b.accept({index=i});break end end;return true')
            eventually(lambda: rpc('return vim.api.nvim_get_current_line()=="calculateScore"'), "TypeScript completion inserted unwanted arguments")
            assert not rpc('return vim.snippet.active({direction=1})'), "TypeScript completion unexpectedly started a snippet"
            keys('<Esc>')
            keys('cccurrentScore.')
            eventually(lambda: any(x['source'] == 'lsp' and x['label'] == 'toFixed' for x in items()), "TypeScript member completion missing")
            keys('<Esc>')
            keys('cccalculateScore(')
            eventually(lambda: rpc('for _,w in ipairs(vim.api.nvim_list_wins()) do if vim.api.nvim_win_get_config(w).relative~="" then local b=vim.api.nvim_win_get_buf(w);if table.concat(vim.api.nvim_buf_get_lines(b,0,-1,false)," "):find("calculateScore",1,true) then return true end end end;return false'), "Automatic signature help missing")
            keys('<Esc>')
            print("PASS CSS launcher, quiet TypeScript names, member completion, and signature help", flush=True)

            edit('go/main.go')
            eventually(lambda: rpc('return #vim.lsp.get_clients({bufnr=0,name="gopls"})') == 1, "Go server did not attach")
            keys('Gocal')
            eventually(lambda: any(x['label'] == 'calculateTotal' for x in items()), "Go project names missing")
            assert all(x['source'] == 'buffer' for x in items()), items()
            keys('<Tab>')
            keys('<CR>')
            assert rpc('return vim.api.nvim_get_current_line()') == 'calculateTotal', "Go name completion inserted an unwanted call"
            keys('<Esc>')
            keys('dd')
            keys(' cf')
            eventually(lambda: rpc('return vim.api.nvim_buf_get_lines(0,3,4,false)[1]:match("^\\t")~=nil'), "Go formatter failed")
            keys(' rr')
            eventually(lambda: rpc('for _,t in ipairs(require("overseer").list_tasks()) do if t.name=="Run Go package" then return t.status=="SUCCESS" end end;return false'), "Go package failed to run", timeout=45)
            print("PASS Go names, formatting, and package execution", flush=True)
            print("All Neovim workflow acceptance checks passed.", flush=True)
        except Exception:
            terminal = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b\([^a-zA-Z]*[a-zA-Z]', '', output[-14000:].decode(errors="replace"))
            print("EDITOR OUTPUT:", terminal[-4000:], flush=True)
            raise
        finally:
            if editor.poll() is None:
                subprocess.run(["nvim", "--server", str(socket), "--remote-send", "<CR><Esc>:qa!<CR>"],
                               env=env, capture_output=True, timeout=5)
                try:
                    editor.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    editor.terminate()
                    editor.wait(timeout=5)
            stopping.set()
            os.close(master)


if __name__ == '__main__':
    main()
