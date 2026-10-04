"""Native completion freshness and real fnm activation in disposable homes."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]


class ShellPolicy(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='dotdotdot-shell-policy-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.env = dict(os.environ, HOME=str(self.root), ZDOTDIR=str(self.root),
                        XDG_CONFIG_HOME=str(self.root/'config'), XDG_CACHE_HOME=str(self.root/'cache'),
                        XDG_STATE_HOME=str(self.root/'state'), XDG_DATA_HOME=str(self.root/'data'),
                        _ZO_DATA_DIR=str(self.root/'zoxide'), FNM_DIR=str(self.root/'fnm'),
                        TMUX_BOOTSTRAPPED='1', DOTDOTDOT_TEST_REPO=str(REPO))
        for name in ('TMUX', 'TMUX_PANE', '_DOTDOTDOT_ENV_LOADED', 'FNM_MULTISHELL_PATH',
                     '_DOTDOTDOT_FZF_BASE_OPTS'):
            self.env.pop(name, None)
        config = self.root/'config'
        config.mkdir()
        (config/'dotfiles-theme').write_text('dark\n')
        (self.root/'.zshrc').write_text('POWERLEVEL9K_DISABLE_CONFIGURATION_WIZARD=true\n'
                                      'source "$DOTDOTDOT_TEST_REPO/.zshrc"\n')

    def zsh(self, script, interactive=False):
        result = subprocess.run(['/bin/zsh', '-dic' if interactive else '-dfc', script],
                                env=self.env, cwd=self.root, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def test_new_shell_discovers_new_completion_file(self):
        completions = self.root/'completions'
        completions.mkdir()
        wrapper = self.root/'.zshrc'
        wrapper.write_text(f'fpath=("{completions}" $fpath)\n' + wrapper.read_text())
        first = self.zsh('print -r -- "MAPPING=${_comps[audit-tool]:-missing}"', interactive=True)
        self.assertIn('MAPPING=missing', first.stdout)
        (completions/'_audit_tool').write_text('#compdef audit-tool\n_arguments "--help[help]"\n')
        second = self.zsh('print -r -- "MAPPING=${_comps[audit-tool]:-missing}"', interactive=True)
        self.assertIn('MAPPING=_audit_tool', second.stdout)

    @unittest.skipUnless(shutil.which('fnm'), 'fnm is required for runtime integration')
    def test_node_activation_never_prompts_and_reports_unmet_requirement(self):
        # Real fnm with fake offline installations, so no downloads or user runtimes are touched.
        for version in ('20.18.2', '24.20.0'):
            binary = self.root/f'fnm/node-versions/v{version}/installation/bin/node'
            binary.parent.mkdir(parents=True)
            binary.write_text(f'#!/bin/sh\nprintf "v{version}\\n"\n')
            binary.chmod(0o755)
        (self.root/'fnm/aliases').mkdir()
        (self.root/'fnm/aliases/default').symlink_to(self.root/'fnm/node-versions/v24.20.0/installation')
        for name, version in (('service-a', '20.18.2'), ('service-b', '24.20.0'), ('missing', '22')):
            project = self.root/name
            project.mkdir()
            (project/'.nvmrc').write_text(version + '\n')
        result = self.zsh('''
cd service-a
source "$DOTDOTDOT_TEST_REPO/zsh/node.zsh"
[[ "$(node --version)" == v20.18.2 ]] || exit 1
cd ../service-b
[[ "$(node --version)" == v24.20.0 ]] || exit 2
cd ../missing || exit 3
[[ -n "$DOTDOTDOT_NODE_ERROR" && "$DOTDOTDOT_NODE_ACTIVE" == v24.20.0 ]] || exit 4
p10k() { print -r -- "$*"; }
prompt_node_warning
[[ "$(node --version)" == v24.20.0 ]] || exit 5
print 20.18.2 > .nvmrc
_dotdotdot_node_refresh
[[ -z "$DOTDOTDOT_NODE_ERROR" && "$(node --version)" == v20.18.2 ]] || exit 6
cd ..
[[ "$(node --version)" == v24.20.0 ]] || exit 7
source "$DOTDOTDOT_TEST_REPO/zsh/node.zsh"
[[ ${#${(M)chpwd_functions:#_dotdotdot_node_refresh}} == 1 ]] || exit 8
[[ ${#${(M)precmd_functions:#_dotdotdot_node_refresh}} == 1 ]] || exit 9
''')
        self.assertNotIn('Do you want to install', result.stderr)
        self.assertIn('Requested version', result.stderr)
        self.assertIn('fnm install && fnm use', result.stderr)
        self.assertIn('Node requirement unmet (active v24.20.0)', result.stdout)
        self.assertFalse((self.root/'fnm/node-versions/v22.0.0').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
