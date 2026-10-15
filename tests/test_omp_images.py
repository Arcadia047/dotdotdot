"""OMP launch policy; fake executables record the environment at the CLI boundary."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]


class OmpImages(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='dotdotdot-omp-policy-')
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        (root/'omp').write_text(
            '#!/usr/bin/env python3\nimport json, os, sys\n'
            'print(json.dumps({"protocol": os.environ.get("PI_FORCE_IMAGE_PROTOCOL"), '
            '"args": sys.argv[1:]}))\nsys.exit(7)\n')
        (root/'tmux').write_text('#!/bin/sh\nprintf "%s\\n" "$TEST_CLIENT"\n')
        for name in ('omp', 'tmux'):
            (root/name).chmod(0o755)
        self.env = {key: os.environ[key] for key in ('PATH', 'LANG') if key in os.environ}
        self.env.update(PATH=str(root)+os.pathsep+self.env['PATH'], HOME=str(root),
                        TMUX='/tmp/private,123,0', TMUX_PANE='%42',
                        TEST_CLIENT='1|256,RGB,sixel|WezTerm 20260909-081506-9fa147c9')

    def launch(self, **changes):
        env = dict(self.env)
        for key, value in changes.items():
            if value is None:
                env.pop(key, None)
            else:
                env[key] = value
        result = subprocess.run(
            ['/bin/zsh', '-dfc', 'source "$1"; shift; omp "$@"; result=$?; '
             'print -r -- "AFTER=${PI_FORCE_IMAGE_PROTOCOL-unset}"; exit $result',
             'omp-policy', str(REPO/'zsh/omp.zsh'), '--profile', 'with spaces', '--version'],
            env=env, text=True, capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 7, result.stdout+result.stderr)
        lines = result.stdout.splitlines()
        payload = json.loads(lines[0])
        self.assertEqual(payload['args'], ['--profile', 'with spaces', '--version'])
        self.assertEqual(lines[1], 'AFTER='+env.get('PI_FORCE_IMAGE_PROTOCOL', 'unset'))
        return payload['protocol']

    def test_wezterm_with_native_tmux_images(self):
        self.assertEqual(self.launch(), 'sixel')

    def test_explicit_protocol_wins(self):
        for protocol in ('kitty', 'sixel', 'iterm2', 'off'):
            with self.subTest(protocol=protocol):
                self.assertEqual(self.launch(PI_FORCE_IMAGE_PROTOCOL=protocol), protocol)

    def test_other_terminals_and_unsupported_tmux_keep_auto_detection(self):
        for client in ('0|sixel|WezTerm nightly', '1|RGB|WezTerm nightly',
                       '1|sixel|ghostty 1.3', '', '1|sixel|'):
            with self.subTest(client=client):
                self.assertIsNone(self.launch(TEST_CLIENT=client))

    def test_direct_terminal_and_stale_wezterm_marker_keep_auto_detection(self):
        self.assertIsNone(self.launch(TMUX=None, WEZTERM_PANE='0', TERM_PROGRAM='WezTerm'))
        self.assertIsNone(self.launch(TMUX_PANE=None, WEZTERM_PANE='0'))
        self.assertIsNone(self.launch(TEST_CLIENT='1|sixel|kitty 0.42', WEZTERM_PANE='0'))


if __name__ == '__main__':
    unittest.main()
