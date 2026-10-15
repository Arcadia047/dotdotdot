"""Exercise bootstrap with the real optional OMP CLI and disposable settings."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]
OMP = shutil.which('omp')


@unittest.skipUnless(OMP, 'Optional OMP CLI is not installed')
class OmpThemes(unittest.TestCase):
    def test_bootstrap_links_and_selects_both_slots_without_replacing_settings(self):
        with tempfile.TemporaryDirectory(prefix='dotdotdot-omp-themes-') as directory:
            root = Path(directory)
            agent = root / 'custom agent'
            agent.mkdir()
            protected = agent / 'auth.json'
            protected.write_text('{"fixture": "preserve"}\n')
            env = dict(os.environ, HOME=directory, XDG_CONFIG_HOME=str(root / 'config'),
                       PI_CODING_AGENT_DIR=str(agent))
            env.pop('OMP_PROFILE', None)

            def run(args):
                result = subprocess.run(args, cwd=REPO, env=env, text=True,
                                        capture_output=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                return result.stdout.strip()

            run([OMP, 'config', 'set', 'terminal.showImages', 'true'])
            before = protected.read_bytes()
            run(['/bin/bash', '-c', 'source ./bootstrap.sh; '
                 'OMP_PROFILE=unrelated configure_omp_themes; configure_omp_themes'])
            for slot, variant in (('light', 'dawn'), ('dark', 'main')):
                name = f'dotdotdot-rose-pine-{variant}'
                self.assertEqual(run([OMP, 'config', 'get', f'theme.{slot}']), name)
                self.assertEqual((agent / 'themes' / f'{name}.json').resolve(),
                                 REPO / 'omp/themes' / f'{name}.json')
            self.assertEqual(run([OMP, 'config', 'get', 'terminal.showImages']), 'true')
            self.assertEqual(protected.read_bytes(), before)
            self.assertFalse((root / '.dotfiles-backups').exists())
            self.assertFalse((root / '.omp/profiles').exists())
            run(['/bin/bash', '-c', 'source ./bootstrap.sh; check_omp_themes; ((check_failures == 0))'])
            run([OMP, 'config', 'set', 'theme.dark', 'dark-rose-pine'])
            result = subprocess.run(['/bin/bash', '-c',
                                     'source ./bootstrap.sh; check_omp_themes; ((check_failures == 0))'],
                                    cwd=REPO, env=env, capture_output=True, text=True, timeout=20)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('theme.dark', result.stdout)

    def test_dry_run_does_not_create_settings_or_theme_links(self):
        with tempfile.TemporaryDirectory(prefix='dotdotdot-omp-dry-run-') as directory:
            root = Path(directory)
            agent = root / 'agent'
            env = dict(os.environ, HOME=directory, PI_CODING_AGENT_DIR=str(agent))
            env.pop('OMP_PROFILE', None)
            result = subprocess.run(['/bin/bash', '-c',
                                     'source ./bootstrap.sh; dry_run=1; configure_omp_themes'],
                                    cwd=REPO, env=env, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertFalse(agent.exists())
