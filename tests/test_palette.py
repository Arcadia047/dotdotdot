"""Cross-consumer checks prevent packaged OMP assets drifting from shared roles."""
import json
from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]


class PackagedPalette(unittest.TestCase):
    def test_both_omp_themes_use_the_shared_palette_for_every_role(self):
        palettes = {'main': {}, 'dawn': {}}
        for line in (REPO / 'theme/palette.tsv').read_text().splitlines():
            if line.startswith('#'):
                continue
            role, main, light = line.split()
            palettes['main'][role] = main
            palettes['dawn'][role] = light
        names = {'highlight_low': 'highlightLow', 'highlight_med': 'highlightMed',
                 'highlight_high': 'highlightHigh'}
        for variant, palette in palettes.items():
            with self.subTest(variant=variant):
                omp = json.loads((REPO / f'omp/themes/dotdotdot-rose-pine-{variant}.json').read_text())
                self.assertEqual(omp['vars'], {names.get(role, role): value for role, value in palette.items()})
                for surface, value in (omp['colors'] | omp['export']).items():
                    self.assertIn(value, omp['vars'], f'{surface} bypasses the shared palette')
