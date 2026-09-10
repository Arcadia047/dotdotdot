#!/usr/bin/env python3
"""Opt-in network acceptance: install tools into temporary Neovim storage."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[1]
shared = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))) / "nvim"
assert (shared / "lazy/lazy.nvim").is_dir(), "Install the configured Neovim plugins first"
with tempfile.TemporaryDirectory(prefix="dotdotdot-first-use-") as directory:
    root = Path(directory)
    config = root / "config"
    config.mkdir()
    (config / "nvim").symlink_to(repo / "nvim")
    data = root / "data/nvim"
    data.mkdir(parents=True)
    (data / "lazy").symlink_to(shared / "lazy")
    if (shared / "mason/registries").is_dir():
        shutil.copytree(shared / "mason/registries", data / "mason/registries")
    (root / "first.lua").write_text("local answer=42\nprint(answer)\n")
    (root / "kernel.cu").write_text("int add(int a,int b){return a+b;}\n")
    # Exercise CUDA language tooling without requiring a GPU toolkit in the
    # fixture. Real projects must provide their actual compilation flags/SDK.
    (root / ".clangd").write_text("CompileFlags:\n  Add: [-nocudainc, -nocudalib]\n")
    env = dict(os.environ, XDG_CONFIG_HOME=str(config), XDG_DATA_HOME=str(root / "data"),
               XDG_STATE_HOME=str(root / "state"), XDG_CACHE_HOME=str(root / "cache"),
               DOTDOTDOT_FIRST_USE_TEST=str(repo / "tests/first_use.lua"),
               PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin")
    command = ("lua vim.defer_fn(function() local ok,err=pcall(dofile,vim.env.DOTDOTDOT_FIRST_USE_TEST); "
               "if not ok then print(err); vim.cmd.cquit() end end,100)")
    result = subprocess.run(["nvim", "--headless", "-i", "NONE", str(root / "first.lua"), "-c", command],
                            env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=540)
    print(result.stdout)
    assert result.returncode == 0, "Fresh-install acceptance failed"
