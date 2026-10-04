"""Behavior checks with disposable homes; never touch live sessions or packages."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]
NVIM = shutil.which('nvim')


class Configuration(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='dotdotdot-check-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.env = os.environ.copy()
        for name in ('JAVA_HOME', 'DOTDOTDOT_JAVA_VERSION', 'DOTDOTDOT_JDTLS_JAVA_VERSION',
                     'DOTFILES_THEME', 'TMUX', 'ZDOTDIR', '_DOTDOTDOT_ENV_LOADED',
                     '_DOTDOTDOT_FZF_BASE_OPTS'):
            self.env.pop(name, None)
        self.env.update(HOME=str(self.root), XDG_CONFIG_HOME=str(self.root/'config'),
                        XDG_CACHE_HOME=str(self.root/'cache'), XDG_STATE_HOME=str(self.root/'state'),
                        HOMEBREW_PREFIX=str(self.root/'brew'), NVIM_LOG_FILE=str(self.root/'nvim.log'),
                        DOTDOTDOT_TEST_REPO=str(REPO))
        (self.root/'config').mkdir()
        (self.root/'config/dotfiles-theme').write_text('dark\n')
        home = self.root/'brew/opt/openjdk/libexec/openjdk.jdk/Contents/Home'
        (home/'bin').mkdir(parents=True)
        (home/'release').write_text('JAVA_VERSION="25.0.1"\n')
        (home/'bin/java').write_text('#!/bin/sh\nexit 0\n')
        (home/'bin/java').chmod(0o755)

    def run_command(self, args, success=True):
        result = subprocess.run(args, cwd=REPO, env=self.env, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
        return result.stdout

    def test_editor_and_terminal_contracts(self):
        print(self.run_command([NVIM, '--headless', '-u', 'NONE', '-i', 'NONE', '-n',
                                '-l', str(REPO/'tests/config.lua')]))

    def test_first_use_tool_installer(self):
        print(self.run_command([NVIM, '--headless', '-u', 'NONE', '-i', 'NONE', '-n',
                                '-l', str(REPO/'tests/tooling.lua')]))

    def test_editor_project_save_boundaries(self):
        print(self.run_command([NVIM, '--headless', '-u', 'NONE', '-i', 'NONE', '-n',
                                '-l', str(REPO/'tests/project.lua')]))

    def test_bootstrap_theme_migration_and_idempotence(self):
        state = self.root/'config/dotfiles-theme'
        state.unlink()
        original = self.root/'tracked-theme.conf'
        original.write_text('light\n')
        state.symlink_to(original)
        self.run_command(['/bin/bash', '-c', 'source ./bootstrap.sh; initialize_theme; initialize_theme'])
        self.assertFalse(state.is_symlink())
        self.assertEqual(state.read_text(), 'light\n')
        self.assertEqual(original.read_text(), 'light\n')
        backups = list((self.root/'.dotfiles-backups').rglob('dotfiles-theme'))
        self.assertEqual(len(backups), 1)
        self.assertTrue(backups[0].is_symlink())

    def test_fresh_bootstrap_defaults_to_auto_and_preserves_explicit_dark(self):
        state = self.root/'config/dotfiles-theme'
        state.unlink()
        self.run_command(['/bin/bash', '-c', 'source ./bootstrap.sh; initialize_theme'])
        self.assertEqual(state.read_text(), 'auto\n')
        state.write_text('dark\n')
        self.run_command(['/bin/bash', '-c', 'source ./bootstrap.sh; initialize_theme'])
        self.assertEqual(state.read_text(), 'dark\n')

    def test_auto_theme_follows_system_updates_and_respects_manual_override(self):
        state = self.root/'config/dotfiles-theme'
        cache = self.root/'config/dotfiles-theme-system'
        state.write_text('auto\n')
        cache.write_text('light\n')
        fake_bin = self.root/'brew/bin'
        fake_bin.mkdir()
        tmux = fake_bin/'tmux'
        tmux.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$HOME/tmux.calls"\n'
                        'if [ "$1" = list-sessions ]; then printf \'$0\\n\'; fi\n')
        tmux.chmod(0o755)
        # Match a GUI launch: brew is installed but absent from PATH.
        self.env['PATH'] = '/usr/bin:/bin'
        self.run_command(['/bin/zsh', '-dfc', '''
source ./zsh/theme.zsh
_dotdotdot_system_theme() { print dark; }
[[ "$DOTFILES_THEME" == light ]] || exit 1
theme auto
[[ "$(theme)" == 'auto (dark)' && "$COLORFGBG" == '15;0' ]] || exit 1
_dotdotdot_sync_system_theme light
[[ "$(theme)" == 'auto (light)' && "$COLORFGBG" == '0;15' ]] || exit 1
_dotdotdot_sync_system_theme light
theme dark
_dotdotdot_sync_system_theme light force
[[ "$(theme)" == dark && "$COLORFGBG" == '15;0' ]] || exit 1
'''])
        self.assertEqual(state.read_text(), 'dark\n')
        self.assertEqual(cache.read_text(), 'light\n')
        calls = (self.root/'tmux.calls').read_text()
        self.assertEqual(calls.count('source-file'), 3)
        self.assertIn('set-environment -t $0 DOTFILES_THEME light', calls)
        self.assertIn('set-environment -t $0 COLORFGBG 0;15', calls)

    def test_shell_palette_refreshes_after_external_theme_change(self):
        self.env['FZF_DEFAULT_OPTS'] = '--layout=reverse'
        (self.root/'.p10k.zsh').symlink_to(REPO/'.p10k.zsh')
        output = self.run_command(['/bin/zsh', '-dfc', '''
source ./zsh/theme.zsh
p10k() { :; }
source ./.p10k.zsh
_dotdotdot_refresh_theme
[[ "$POWERLEVEL9K_DIR_FOREGROUND" == '#31748f' ]] || exit 1
[[ "$ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE" == 'fg=#908caa' ]] || exit 1
print light > "$XDG_CONFIG_HOME/dotfiles-theme"
_dotdotdot_refresh_theme
[[ "$DOTFILES_THEME" == light && "$COLORFGBG" == '0;15' ]] || exit 1
[[ "$DOTDOTDOT_COLORS[base]" == '#faf4ed' ]] || exit 1
[[ "$POWERLEVEL9K_DIR_FOREGROUND" == '#286983' ]] || exit 1
[[ "$ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE" == 'fg=#797593' ]] || exit 1
[[ "$FZF_DEFAULT_OPTS" == '--layout=reverse '* && "$FZF_DEFAULT_OPTS" == *'bg:#faf4ed'* ]] || exit 1
_dotdotdot_refresh_theme
print -r -- "$FZF_DEFAULT_OPTS"
/bin/zsh -dfc 'source ./zsh/theme.zsh; _dotdotdot_apply_shell_theme; print -r -- "$FZF_DEFAULT_OPTS"'
'''])
        self.assertEqual(len(output.splitlines()), 2)
        for line in output.splitlines():
            self.assertEqual(line.count('--color='), 1)

    def test_bootstrap_dry_run_leaves_theme_link_untouched(self):
        state = self.root/'config/dotfiles-theme'
        state.unlink()
        state.symlink_to(REPO/'theme.conf')
        self.run_command(['/bin/bash', '-c', 'source ./bootstrap.sh; dry_run=1; initialize_theme'])
        self.assertTrue(state.is_symlink())
        self.assertFalse((self.root/'.dotfiles-backups').exists())

    def test_bootstrap_links_twice_without_backing_up_twice(self):
        source = self.root/'source'
        target = self.root/'target'
        source.write_text('source')
        target.write_text('original')
        output = self.run_command(['/bin/bash', '-c',
                                  'source ./bootstrap.sh; link_item "$1" "$2"; link_item "$1" "$2"',
                                  'test', str(source), str(target)])
        self.assertTrue(target.is_symlink())
        self.assertEqual(output.count('Backed up:'), 1)

    def test_theme_command_preserves_repo_and_refreshes_detached_tmux(self):
        state = self.root/'config/dotfiles-theme'
        original = self.root/'tracked-theme.conf'
        original.write_text('dark\n')
        state.unlink()
        state.symlink_to(original)
        fake_bin = self.root/'bin'
        fake_bin.mkdir()
        tmux = fake_bin/'tmux'
        tmux.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$HOME/tmux.calls"\n'
                        'if [ "$1" = list-sessions ]; then printf \'$0\\n$1\\n\'; fi\n')
        tmux.chmod(0o755)
        self.env['PATH'] = str(fake_bin) + ':' + self.env['PATH']
        self.run_command(['/bin/zsh', '-dfc', 'source ./zsh/theme.zsh; theme light; theme dark'])
        self.assertFalse(state.is_symlink())
        self.assertEqual(state.read_text(), 'dark\n')
        self.assertEqual(original.read_text(), 'dark\n')
        calls = (self.root/'tmux.calls').read_text()
        self.assertEqual(calls.count('source-file'), 2)
        for session in ('$0', '$1'):
            self.assertIn(f'set-environment -t {session} DOTFILES_THEME light', calls)
            self.assertIn(f'set-environment -t {session} COLORFGBG 0;15', calls)
            self.assertIn(f'set-environment -t {session} DOTFILES_THEME dark', calls)
            self.assertIn(f'set-environment -t {session} COLORFGBG 15;0', calls)
        self.assertNotIn('new-session', calls)
        self.run_command(['/bin/zsh', '-dfc', 'source ./zsh/theme.zsh; theme invalid'], success=False)
        self.assertEqual(state.read_text(), 'dark\n')

    def test_bootstrap_and_editor_share_java_policy(self):
        profile = self.root/'config/dotdotdot/machine.zsh'
        profile.parent.mkdir()
        # Legacy typeset-only preferences must also reach the resolver.
        profile.write_text('typeset -g DOTDOTDOT_JAVA_VERSION=17\n')
        output = self.run_command(['/bin/bash', '-c', 'source ./bootstrap.sh; java_runtime check'], success=False)
        self.assertIn('requests Java 17', output)
        profile.write_text('typeset -g DOTDOTDOT_JAVA_VERSION=25\n')
        output = self.run_command(['/bin/bash', '-c', 'source ./bootstrap.sh; java_runtime check'])
        self.assertIn('Project Java 25', output)
        self.assertIn('jdtls Java 25', output)

    def test_doctor_distinguishes_pinned_dirty_submodule(self):
        fake_bin = self.root/'bin'
        fake_bin.mkdir()
        git = fake_bin/'git'
        git.write_text('''#!/bin/sh
case "$4" in
status) printf ' abc123 .tmux/plugins/example (v1)\\n' ;;
foreach) printf '.tmux/plugins/example\\n' ;;
esac
''')
        git.chmod(0o755)
        self.env['PATH'] = str(fake_bin) + ':' + self.env['PATH']
        output = self.run_command(['/bin/bash', '-c',
                                  'source ./bootstrap.sh; check_submodules; test "$check_warnings" = 1'])
        self.assertIn('WARN: local changes', output)

    def test_nightly_download_failure_keeps_stable(self):
        fake_bin = self.root/'bin'
        fake_bin.mkdir()
        brew = fake_bin/'brew'
        brew.write_text("""#!/bin/sh
printf '%s\\n' "$*" >> "$HOME/brew.calls"
case "$1" in
list) exit 1 ;;
fetch) exit 1 ;;
esac
""")
        brew.chmod(0o755)
        self.env['PATH'] = str(fake_bin) + ':' + self.env['PATH']
        self.run_command(['/bin/bash', 'scripts/use-wezterm-nightly'], success=False)
        calls = (self.root/'brew.calls').read_text()
        self.assertNotIn('uninstall', calls)

    def test_failed_nightly_install_restores_stable(self):
        fake_bin = self.root/'bin'
        fake_bin.mkdir()
        brew = fake_bin/'brew'
        brew.write_text("""#!/bin/sh
printf '%s\\n' "$*" >> "$HOME/brew.calls"
case "$1:$3" in
list:wezterm@nightly|install:wezterm@nightly) exit 1 ;;
esac
""")
        brew.chmod(0o755)
        self.env['PATH'] = str(fake_bin) + ':' + self.env['PATH']
        self.run_command(['/bin/bash', 'scripts/use-wezterm-nightly'], success=False)
        calls = (self.root/'brew.calls').read_text().splitlines()
        self.assertLess(calls.index('fetch --cask wezterm@nightly'), calls.index('uninstall --cask wezterm'))
        self.assertEqual(calls[-1], 'install --cask wezterm')


if __name__ == '__main__':
    unittest.main(verbosity=2)
