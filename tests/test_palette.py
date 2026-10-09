"""Cross-consumer checks prevent packaged OMP assets drifting from shared roles."""
import json
from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]


class PackagedPalette(unittest.TestCase):
    def test_omp_dawn_uses_the_shared_palette_for_every_role(self):
        dawn = {}
        for line in (REPO / 'theme/palette.tsv').read_text().splitlines():
            if line.startswith('#'):
                continue
            role, main, light = line.split()
            dawn[role] = light
        omp = json.loads((REPO / 'omp/themes/dotdotdot-rose-pine-dawn.json').read_text())
        names = {'highlight_low': 'highlightLow', 'highlight_med': 'highlightMed',
                 'highlight_high': 'highlightHigh'}
        self.assertEqual(omp['vars'], {names.get(role, role): value for role, value in dawn.items()})
        for surface, value in (omp['colors'] | omp['export']).items():
            self.assertIn(value, omp['vars'], f'{surface} bypasses the shared palette')
