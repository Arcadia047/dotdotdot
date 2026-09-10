#!/usr/bin/env python3
"""Real PTY -> tmux key dispatch -> configured Neovim integration checks.

Run explicitly: python3 tests/navigation.py. Uses installed plugins, temporary
state, and a private socket. Never attaches to or kills a user's tmux server.
"""

import argparse
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shlex
import shutil
import struct
import subprocess
import tempfile
import termios
import threading
import time


def run(*args, **kwargs):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT, timeout=10, **kwargs).strip()


def eventually(check, description, timeout=5):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            last = check()
            if last:
                return
        except (subprocess.CalledProcessError, OSError, ValueError) as error:
            last = str(error)
        time.sleep(0.05)
    raise AssertionError(f"{description} (last result: {last})")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    repo = args.repo.resolve()
    for command in ("tmux", "nvim"):
        assert shutil.which(command), f"Missing {command}"
    data = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share")))
    for plugin in ("lazy.nvim", "neo-tree.nvim", "bufferline.nvim"):
        assert (data / "nvim/lazy" / plugin).is_dir(), f"Install Neovim plugins first: {plugin}"
    with tempfile.TemporaryDirectory(prefix="dotdotdot-nav-") as directory:
        root = Path(directory)
        socket = str(root / "tmux.sock")
        rpc = str(root / "nvim.sock")
        config = root / "config"
        config.mkdir()
        (config / "nvim").symlink_to(repo / "nvim", target_is_directory=True)
        env = dict(os.environ, TERM="xterm-256color", XDG_CONFIG_HOME=str(config),
                   XDG_DATA_HOME=str(data), XDG_STATE_HOME=str(root / "state"),
                   XDG_CACHE_HOME=str(root / "cache"))
        env.pop("TMUX", None)
        env.pop("TMUX_PANE", None)
        fixtures = root / "files"
        fixtures.mkdir()
        for name in ("one.txt", "two.txt", "three.txt"):
            (fixtures / name).write_text(name + "\n")
        nav = repo / ".tmux/navigation.conf"
        tmux_config = root / "tmux.conf"
        body = f"source-file {shlex.quote(str(nav))}\n"
        tmux_config.write_text("set -g default-shell /bin/bash\nset -g status off\n"
                               "set -g default-terminal tmux-256color\nset -g mode-keys vi\n"
                               "set -g extended-keys on\nset -g extended-keys-format csi-u\n" + body)

        def tmux(*command):
            return run("tmux", "-S", socket, *command, env=env)

        def expr(expression):
            return run("nvim", "--server", rpc, "--remote-expr", expression, env=env)

        def lua(code):
            return expr("luaeval(" + json.dumps(code) + ")")

        def command(code):
            return lua("vim.cmd(" + json.dumps(code) + ")")

        master = None
        client = None
        stopping = threading.Event()
        try:
            pane = tmux("-f", str(tmux_config), "new-session", "-d", "-P", "-F", "#{pane_id}",
                        "-s", "qa", "-x", "160", "-y", "45", "-c", str(fixtures),
                        shlex.join(["nvim", "--listen", rpc, "-i", "NONE", "one.txt", "two.txt", "three.txt"]))
            first = tmux("display-message", "-p", "-t", pane, "#{window_id}")
            second = tmux("new-window", "-d", "-P", "-F", "#{window_id}", "-t", "qa", "/bin/bash --noprofile --norc")
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 45, 160, 0, 0))
            client = subprocess.Popen(["tmux", "-S", socket, "attach-session", "-t", "qa"],
                                      stdin=slave, stdout=slave, stderr=slave, env=env)
            os.close(slave)
            stopping = threading.Event()

            def drain():
                while not stopping.is_set():
                    try:
                        if select.select([master], [], [], 0.1)[0]:
                            os.read(master, 65536)
                    except OSError:
                        break

            thread = threading.Thread(target=drain, daemon=True)
            thread.start()
            eventually(lambda: expr("v:vim_did_enter") == "1", "Neovim started", 15)
            eventually(lambda: tmux("list-clients", "-F", "#{client_session}") == "qa", "PTY client attached")

            def press(keys):
                os.write(master, keys)
                time.sleep(0.15)

            def active_pane():
                return tmux("display-message", "-p", "#{pane_id}")

            def active_window():
                return tmux("display-message", "-p", "#{window_id}")

            def check(description, condition):
                eventually(condition, description)
                print("PASS " + description, flush=True)


            # The user's everyday layout: several buffers, one editor window,
            # and one pane per tmux window. No split is needed for navigation.
            check("Starts with one visible editor window", lambda: expr("winnr('$')") == "1")
            check("Starts on first file", lambda: expr("expand('%:t')") == "one.txt")
            press(b"\x0c")
            check("Ctrl-l selects the next buffer with no splits", lambda: expr("expand('%:t')") == "two.txt" and active_pane() == pane)
            press(b"\x08")
            check("Ctrl-h selects the previous buffer", lambda: expr("expand('%:t')") == "one.txt")
            press(b"\x08")
            check("Buffer cycling wraps through the ordered file list", lambda: expr("expand('%:t')") == "three.txt")
            press(b"\x0a")
            check("Ctrl-j selects the next tmux window from Neovim", lambda: active_window() == second)
            press(b"\x0b")
            check("Ctrl-k returns to Neovim's tmux window", lambda: active_window() == first and expr("expand('%:t')") == "three.txt")
            press(b"\x0b")
            check("Ctrl-k wraps to the previous task from Neovim", lambda: active_window() == second)
            press(b"\x0a")
            check("Ctrl-j also switches tasks from a shell", lambda: active_window() == first)
            press(b"\x1b[1;2C")
            check("Shift-Right remains a next-task alias", lambda: active_window() == second)
            press(b"\x1b[1;2D")
            check("Shift-Left remains a previous-task alias", lambda: active_window() == first)

            press(b" 1")
            original_buffer = expr("bufnr()")
            press(b"iX\x0c")
            check("Insert-mode Ctrl-l switches buffers and exits insert mode", lambda: expr("expand('%:t')") == "two.txt" and expr("mode()") == "n")
            check("Switching buffers preserves unsaved edits", lambda: expr("getbufvar(" + original_buffer + ", '&modified')") == "1" and expr("getbufline(" + original_buffer + ", 1)[0]").startswith("X"))
            press(b"\x08")
            check("Ctrl-h returns to the unsaved file", lambda: expr("bufnr()") == original_buffer)
            press(b"i\x0a")
            check("Ctrl-j switches tasks even during insert mode", lambda: active_window() == second)
            press(b"\x0b\x1b")
            check("Returning preserves the current file", lambda: expr("bufnr()") == original_buffer)

            def tree_exists():
                return lua("#vim.tbl_filter(function(w) return vim.bo[vim.api.nvim_win_get_buf(w)].filetype == 'neo-tree' end, vim.api.nvim_tabpage_list_wins(0))") == "1"

            command("Neotree focus left")
            check("Neo-tree opens", lambda: expr("&filetype") == "neo-tree")
            press(b"\x0c")
            check("Ctrl-l from Neo-tree cycles files without replacing the tree", lambda: expr("expand('%:t')") == "two.txt" and tree_exists())
            command("Neotree focus left")
            press(b"\x08")
            check("Ctrl-h from Neo-tree selects the previous file", lambda: expr("expand('%:t')") == "one.txt" and tree_exists())
            command("Neotree focus left")
            press(b" 3")
            check("Numbered selection remains stable beside Neo-tree", lambda: expr("expand('%:t')") == "three.txt" and tree_exists())
            press(b"[b")
            check("Bracket-b remains a previous-buffer alias", lambda: expr("expand('%:t')") == "two.txt")
            press(b"]b")
            check("Bracket-b remains a next-buffer alias", lambda: expr("expand('%:t')") == "three.txt")
            press(b" \t")
            check("Space-Tab still selects the alternate buffer", lambda: expr("expand('%:t')") == "two.txt")
            command("Neotree focus left")
            press(b"\x0a")
            check("Ctrl-j switches tasks from Neo-tree", lambda: active_window() == second)
            press(b"\x0b")
            check("Ctrl-k returns to the same Neo-tree view", lambda: active_window() == first and expr("&filetype") == "neo-tree")
            press(b" b")
            check("Which-key offers Close Current Buffer in Neo-tree", lambda: "Close Current Buffer" in tmux("capture-pane", "-p", "-t", pane))
            press(b"\x1b")
            check("Which-key Escape dismisses the menu", lambda: lua("not require('which-key.view').valid() and 1 or 0") == "1")
            press(b" fb")
            check("Buffer picker opens from Neo-tree", lambda: expr("&filetype") == "TelescopePrompt")
            press(b"\x0a")
            check("Ctrl-j switches tasks while the picker is open", lambda: active_window() == second)
            press(b"\x0b")
            check("Ctrl-k returns to the open picker", lambda: expr("&filetype") == "TelescopePrompt")
            press(b"\x1b")
            check("Picker Escape returns to editing", lambda: expr("&buftype") == "" and tree_exists())
            command("OverseerOpen")
            lua("require('overseer').open({enter=true})")
            check("Overseer opens", lambda: expr("&filetype") == "OverseerList")
            press(b"\x0a")
            check("Ctrl-j switches tasks from Overseer", lambda: active_window() == second)
            press(b"\x0b\x0c")
            check("Ctrl-l leaves Overseer for a file buffer", lambda: expr("&buftype") == "")
            command("OverseerClose")

            # Rare split operations remain explicit and do not own Ctrl-h/l.
            press(b" wh")
            check("Explicit Space-w-h still focuses Neo-tree", lambda: expr("&filetype") == "neo-tree")
            press(b" wl")
            check("Explicit Space-w-l returns to the editor", lambda: expr("&buftype") == "")
            command("botright split")
            terminal_win = expr("win_getid()")
            command("terminal /bin/bash --noprofile --norc")
            command("startinsert")
            press(b"\x0a")
            check("Ctrl-j switches tasks from terminal input", lambda: active_window() == second)
            press(b"\x0b\x08")
            check("Ctrl-h returns from an embedded terminal to a file buffer", lambda: expr("&buftype") == "")
            command("lua vim.api.nvim_win_close(" + terminal_win + ", true)")
            press(b"\x0a")
            tmux("copy-mode")
            press(b"\x0b")
            check("Ctrl-k switches tasks out of tmux copy mode", lambda: active_window() == first)
            press(b"\x01\t")
            check("Prefix-Tab remains a previous-task shortcut", lambda: active_window() == second)
            tmux("send-keys", "-X", "cancel")
            press(b"\x011")
            check("Prefix-1 selects the first task", lambda: active_window() == first)
            press(b"\x012")
            check("Prefix-2 selects the second task", lambda: active_window() == second)

            press(b"\x011 2")
            closing_buffer = expr("bufnr()")
            press(b" bd")
            check("Close Current Buffer removes the selected file and preserves Neo-tree", lambda: expr("buflisted(" + closing_buffer + ")") == "0" and tree_exists() and expr("&buftype") == "")
            check("Closing another file retains unsaved edits", lambda: expr("getbufvar(" + original_buffer + ", '&modified')") == "1")

        except Exception:
            print("FAILURE CONTEXT:", tmux("capture-pane", "-p", "-t", pane), flush=True)
            raise
        finally:
            # Let the disposable editor finish cache writes before removing its
            # temporary directory. This socket belongs only to this test.
            if Path(rpc).exists():
                try:
                    command("qa!")
                except (subprocess.SubprocessError, OSError):
                    pass
                eventually(lambda: not Path(rpc).exists(), "Test editor exited")
            subprocess.run(["tmux", "-S", socket, "kill-server"], env=env, capture_output=True)
            if client:
                client.wait(timeout=5)
            if master is not None:
                stopping.set()
                os.close(master)
        print("All navigation integration checks passed.")


if __name__ == "__main__":
    main()
