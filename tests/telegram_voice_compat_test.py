import importlib.util
import unittest
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('reminder_voice', Path(__file__).resolve().parent.parent / 'scripts/telegram-reminder-voice.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SpeedCompatibilityTest(unittest.TestCase):
    def test_fractional_rate_survives_upstream_integer_truncation(self):
        class Session:
            def get_inputs(self):
                return [type('Input', (), {'name': 'speed', 'type': 'tensor(float)'})()]
            def run(self, names, inputs):
                return inputs
        original = {'speed': np.array([0], dtype=np.int32), 'input_ids': [[0, 1, 0]]}
        result = module.CompatibleKokoroSession(Session(), 0.96).run(None, original)
        self.assertEqual(result['speed'].dtype, np.float32)
        self.assertAlmostEqual(float(result['speed'][0]), 0.96, places=6)
        self.assertEqual(int(original['speed'][0]), 0)
        self.assertEqual(result['input_ids'], original['input_ids'])

    def test_integer_export_keeps_its_expected_dtype(self):
        class Session:
            def get_inputs(self):
                return [type('Input', (), {'name': 'speed', 'type': 'tensor(int32)'})()]
            def run(self, names, inputs):
                return inputs
        inputs = {'speed': np.array([1], dtype=np.int32)}
        self.assertIs(module.CompatibleKokoroSession(Session(), 1).run(None, inputs), inputs)


if __name__ == '__main__':
    unittest.main()
