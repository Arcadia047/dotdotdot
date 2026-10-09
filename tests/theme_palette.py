#!/usr/bin/env python3
"""Opt-in installed WezTerm and Neovim palette checks with disposable state."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[1]
shared = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'nvim'
assert (shared / 'lazy/lazy.nvim').is_dir(), 'Install the configured Neovim plugins first'

with tempfile.TemporaryDirectory(prefix='dotdotdot-palette-') as directory:
    root = Path(directory)
    config = root / 'config'
    config.mkdir()
    (config / 'nvim').symlink_to(REPO / 'nvim')
    (config / 'dotfiles-theme').write_text('auto\n')
    (config / 'dotfiles-theme-system').write_text('dark\n')
    data = root / 'data/nvim'
    data.mkdir(parents=True)
    for name in ('lazy', 'mason', 'site'):
        (data / name).symlink_to(shared / name)
    env = dict(os.environ, HOME=directory, XDG_CONFIG_HOME=str(config),
               XDG_DATA_HOME=str(root / 'data'), XDG_STATE_HOME=str(root / 'state'),
               XDG_CACHE_HOME=str(root / 'cache'), NVIM_LOG_FILE=str(root / 'nvim.log'),
               DOTDOTDOT_TEST_REPO=str(REPO))
    for name in ('NVIM', 'TMUX', 'TMUX_PANE', 'DOTFILES_THEME'):
        env.pop(name, None)
    # Keep the CLI probe alongside the real config so config_dir resolves as in
    # production. It is removed even after a failed assertion; no live UI changes.
    with tempfile.NamedTemporaryFile(mode='w', suffix='.lua', prefix='.palette-check-',
                                     dir=REPO / 'wezterm') as probe:
        probe.write('''local wezterm = require("wezterm")
local ok, config = pcall(dofile, wezterm.config_dir .. "/wezterm.lua")
if not ok then wezterm.log_error(tostring(config)); return {} end
local output = assert(io.open(os.getenv("DOTDOTDOT_PALETTE_OUTPUT"), "w"))
output:write(wezterm.json_encode(config.colors))
output:close()
return config
''')
        probe.flush()
        env['DOTDOTDOT_PALETTE_OUTPUT'] = str(root / 'colors.json')
        for mode, text, base in (('light', '#464261', '#faf4ed'),
                                 ('dark', '#e0def4', '#191724'),
                                 ('light', '#464261', '#faf4ed')):
            (config / 'dotfiles-theme').write_text(mode + '\n')
            result = subprocess.run([shutil.which('wezterm'), '--config-file', probe.name,
                                     'show-keys', '--lua'], env=dict(env, HOME=str(Path.home())), capture_output=True,
                                    text=True, timeout=20)
            assert result.returncode == 0 and not result.stderr.strip(), result.stderr
            assert (root / 'colors.json').exists(), repr(result.stdout[:500])
            colors = json.loads((root / 'colors.json').read_text())
            assert colors['foreground'] == text and colors['background'] == base, colors
            assert colors['selection_bg'] != base and colors['selection_fg'] == text, colors
            assert colors['ansi'][7] == text and colors['brights'][7] == text, colors
            print(f'PASS installed WezTerm {mode} config, text, visible selection, ANSI and UI schema', flush=True)
    (config / 'dotfiles-theme').write_text('auto\n')
    subprocess.run([shutil.which('nvim'), '--headless', '-i', 'NONE', '-n',
                    '-c', 'lua local ok, err = pcall(dofile, ' + json.dumps(str(REPO / 'tests/theme_palette.lua')) + '); if not ok then print(err); vim.cmd("cquit") end'],
                   env=env, check=True, timeout=30)
