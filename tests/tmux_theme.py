#!/usr/bin/env python3
"""Real tmux theme acceptance on a private server with disposable state."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[1]
TMUX = shutil.which('tmux')
assert TMUX, 'Install tmux before running this acceptance check'

with tempfile.TemporaryDirectory(prefix='dotdotdot-tmux-theme-') as directory:
    root = Path(directory)
    config = root / 'config'
    config.mkdir()
    (root / '.tmux').mkdir()
    for name in ('plugins', 'theme.conf', 'navigation.conf', 'copy.conf'):
        (root / '.tmux' / name).symlink_to(REPO / '.tmux' / name)
    (root / 'zsh').symlink_to(REPO / 'zsh')
    (root / '.tmux.conf').symlink_to(REPO / '.tmux.conf')
    # Continuum deliberately omits its save hook when other servers exist.
    # Give only that process-list probe an isolated fixture view; never stop
    # user servers or patch the plugin to bypass its production protection.
    (root / 'tmux_no_auto_restore').touch()
    fixture_bin = root / 'bin'
    fixture_bin.mkdir()
    ps = fixture_bin / 'ps'
    ps.write_text('''#!/bin/sh
if [ "$#" = 4 ] && [ "$1" = -u ] && [ "$3" = -o ] && [ "$4" = 'command pid' ]; then
  fixture_pid="${TMUX#*,}"
  fixture_pid="${fixture_pid%%,*}"
  printf 'COMMAND PID\\ntmux: server %s\\n' "$fixture_pid"
else
  exec /bin/ps "$@"
fi
''')
    ps.chmod(0o755)
    env = dict(os.environ, HOME=directory, XDG_CONFIG_HOME=str(config),
               DOTFILES_THEME='light', COLORFGBG='0;15',
               PATH=str(fixture_bin) + os.pathsep + os.environ['PATH'])
    for key in ('TMUX', 'TMUX_PANE'):
        env.pop(key, None)
    command = [TMUX, '-S', str(root / 'socket')]

    def tmux(*args):
        result = subprocess.run(command + list(args), env=env, text=True,
                                capture_output=True, timeout=20)
        assert result.returncode == 0, result.stdout + result.stderr
        return result.stdout.strip()

    try:
        tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'base', '/bin/sleep 60')
        # Exercise migration from the legacy imports and preserve unrelated names.
        tmux('set', '-g', 'update-environment',
             'DISPLAY DOTFILES_THEME COLORFGBG SSH_AUTH_SOCK DOTFILES_THEME_BACKUP')
        for selection, mode in (('light', 'light'), ('dark', 'dark'), ('light', 'light'),
                                ('auto', 'dark'), ('auto', 'light'), ('auto', 'dark')):
            (config / 'dotfiles-theme').write_text(selection + '\n')
            (config / 'dotfiles-theme-system').write_text(mode + '\n')
            tmux('source-file', str(REPO / '.tmux.conf'))
            dark = mode == 'dark'
            assert tmux('show', '-gqv', '@rose_pine_variant') == ('main' if dark else 'dawn')
            assert ('#191724' if dark else '#faf4ed') in tmux('show', '-gqv', 'status-style')
            for key, value in (('DOTFILES_THEME', mode), ('COLORFGBG', '15;0' if dark else '0;15')):
                assert tmux('show-environment', '-g', key) == key + '=' + value
            imports = tmux('show', '-gqv', 'update-environment').split()
            assert 'DOTFILES_THEME' not in imports and 'COLORFGBG' not in imports, imports
            assert 'SSH_AUTH_SOCK' in imports and 'DOTFILES_THEME_BACKUP' in imports, imports
            inactive = tmux('display-message', '-p', '#{E:window-status-format}')
            active = tmux('display-message', '-p', '#{E:window-status-current-format}')
            assert ('bg=#26233a' if dark else 'bg=#f2e9e1') in inactive
            assert ('bg=#c4a7e7' if dark else 'bg=#286983') in active and 'bold' in active
            assert inactive.endswith('#[default]') and active.endswith('#[default]')
            assert tmux('show', '-gqv', 'allow-passthrough') == 'on'
            status = tmux('show', '-gqv', 'status-right')
            assert '#{pane_current_command}' in status and '#{session_name}' in status
            assert 'continuum_save.sh' in status, status
            print(f'PASS tmux {selection}/{mode} palette, environment, filled blocks and save hook', flush=True)
        # The client deliberately still holds Dawn while shared state is dark.
        tmux('new-session', '-d', '-s', 'stale-client', '/bin/sleep 60')
        expected = 'dark 15;0'
        assert tmux('display-message', '-p', '-t', 'stale-client',
                    '#{DOTFILES_THEME} #{COLORFGBG}') == expected
        subprocess.run(command + ['-C', 'attach-session', '-t', 'stale-client'],
                       env=env, input='detach-client\n', text=True,
                       capture_output=True, check=True, timeout=10)
        assert tmux('display-message', '-p', '-t', 'stale-client',
                    '#{DOTFILES_THEME} #{COLORFGBG}') == expected
        print('PASS creating and attaching from a stale shell preserves the authoritative theme', flush=True)
    finally:
        subprocess.run(command + ['kill-server'], env=env, capture_output=True)
