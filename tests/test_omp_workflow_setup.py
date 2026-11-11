"""Exercise the optional manager link with real bootstrap and isolated homes."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]


class OmpWorkflowSetup(unittest.TestCase):
    def run_bootstrap(self, root, body, **overrides):
        env = dict(os.environ, HOME=str(root))
        for key in ('OMP_PROFILE', 'PI_PROFILE', 'PI_CONFIG_DIR', 'PI_CODING_AGENT_DIR'):
            env.pop(key, None)
        env.update(overrides)
        return subprocess.run(['/bin/bash', '-c', 'source ./bootstrap.sh; ' + body],
                              cwd=REPO, env=env, capture_output=True, text=True, timeout=20)

    def test_opt_in_links_only_the_entrypoint_and_preserves_existing_configuration(self):
        with tempfile.TemporaryDirectory(prefix='omp-setup-') as directory:
            root = Path(directory)
            agent = root / '.omp/agent'
            extension = agent / 'extensions/dotdotdot-work.ts'
            extension.parent.mkdir(parents=True)
            protected = {agent / name: f'preserve {name}\n' for name in
                         ('auth.json', 'models.yml', 'config.yml', 'sessions/session.json', 'extensions/other.ts')}
            for path, body in protected.items():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(body)
            extension.write_text('previous extension\n')
            result = self.run_bootstrap(root, 'configure_omp_workflow; configure_omp_workflow; '
                                        'check_link "$repo_root/omp/workflow/index.ts" "$HOME/.omp/agent/extensions/dotdotdot-work.ts"; '
                                        '((check_failures == 0))')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue(extension.is_symlink())
            self.assertEqual(extension.resolve(), REPO / 'omp/workflow/index.ts')
            backups = list((root / '.dotfiles-backups').rglob('dotdotdot-work.ts'))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(), 'previous extension\n')
            for path, body in protected.items():
                self.assertEqual(path.read_text(), body)
            self.assertEqual(sorted(p.name for p in extension.parent.iterdir()), ['dotdotdot-work.ts', 'other.ts'])

    def test_profiles_and_explicit_default_agent_override_match_omp_paths(self):
        cases = [({}, '.omp/agent'),
                 ({'PI_CONFIG_DIR': '.work-omp'}, '.work-omp/agent'),
                 ({'OMP_PROFILE': 'work', 'PI_CODING_AGENT_DIR': '/ignored'}, '.omp/profiles/work/agent'),
                 ({'PI_PROFILE': 'legacy'}, '.omp/profiles/legacy/agent'),
                 ({'OMP_PROFILE': '', 'PI_PROFILE': 'legacy'}, '.omp/agent')]
        with tempfile.TemporaryDirectory(prefix='omp-profile-') as directory:
            root = Path(directory)
            for env, expected in cases:
                with self.subTest(env=env):
                    result = self.run_bootstrap(root, 'omp_workflow_agent_dir', **env)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertEqual(result.stdout.strip(), str(root / expected))
            custom = root / 'custom agent'
            result = self.run_bootstrap(root, 'configure_omp_workflow', PI_CODING_AGENT_DIR=str(custom))
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual((custom / 'extensions/dotdotdot-work.ts').resolve(), REPO / 'omp/workflow/index.ts')
            result = self.run_bootstrap(root, 'omp_workflow_agent_dir', OMP_PROFILE='', PI_PROFILE='legacy',
                                        PI_CODING_AGENT_DIR=str(root / '.omp/profiles/legacy/agent'))
            self.assertEqual(result.stdout.strip(), str(root / '.omp/agent'))

    def test_dry_run_and_optional_check_are_read_only(self):
        with tempfile.TemporaryDirectory(prefix='omp-dry-') as directory:
            root = Path(directory)
            result = self.run_bootstrap(root, 'check_omp_workflow; ((check_failures == 0)); dry_run=1; configure_omp_workflow')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('optional OMP work manager is not enabled', result.stdout)
            self.assertEqual(list(root.iterdir()), [])
            required = self.run_bootstrap(root, 'omp_workflow=1; check_omp_workflow; ((check_failures == 0))')
            self.assertNotEqual(required.returncode, 0)

    def test_invalid_profile_or_config_path_cannot_write_outside_selected_home(self):
        with tempfile.TemporaryDirectory(prefix='omp-invalid-') as directory:
            root = Path(directory)
            for env in ({'OMP_PROFILE': '../other'}, {'OMP_PROFILE': 'Upper'}, {'OMP_PROFILE': 'con.txt'},
                        {'OMP_PROFILE': 'trailing.'}, {'PI_CONFIG_DIR': '../outside'},
                        {'PI_CONFIG_DIR': '/absolute'}, {'PI_CODING_AGENT_DIR': 'relative-agent'}):
                with self.subTest(env=env):
                    result = self.run_bootstrap(root, 'configure_omp_workflow', **env)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(list(root.iterdir()), [])

    def test_cli_accepts_opt_in_during_an_actual_dry_run(self):
        with tempfile.TemporaryDirectory(prefix='omp-cli-') as directory:
            root = Path(directory)
            env = dict(os.environ, HOME=directory, PI_CONFIG_DIR='.omp')
            for key in ('OMP_PROFILE', 'PI_PROFILE', 'PI_CODING_AGENT_DIR'):
                env.pop(key, None)
            result = subprocess.run(['/bin/bash', './bootstrap.sh', '--dry-run', '--omp-workflow'],
                                    cwd=REPO, env=env, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('dotdotdot-work.ts', result.stdout + result.stderr)
            self.assertFalse((root / '.omp/agent/extensions').exists())
