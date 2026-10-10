"""CPU-only adapter checks. These do not run or benchmark LingBot-Map."""
import json
import unittest
from unittest.mock import patch
import numpy as np
from pathlib import Path
from export_map import compact_map, extract_frames

class ExportTests(unittest.TestCase):
    def test_frame_cap_does_not_overstate_timeline(self):
        import cv2
        class Recording:
            def isOpened(self): return True
            def get(self, prop): return 30 if prop == cv2.CAP_PROP_FPS else 1800
            def set(self, *args): pass
            def read(self): return True, np.zeros((2,2,3), dtype=np.uint8)
            def release(self): pass
        with patch.object(cv2, 'VideoCapture', return_value=Recording()), patch.object(cv2, 'imwrite', return_value=True):
            paths, times, duration = extract_frames('recording.mp4', Path('.'), fps=4, clip_seconds=60)
        self.assertEqual(len(paths), 120)
        self.assertEqual(duration, 30)
        self.assertEqual(times[-1], 29.75)

    def test_bounded_finite_json_with_relative_camera_coordinates(self):
        rng=np.random.default_rng(42)
        points=rng.normal(size=(1000,3))
        points[0]=np.nan
        confidence=np.linspace(0,1,1000)
        colors=np.tile([128,64,32],(1000,1))
        cameras=np.array([[0,0,0],[1,0,0]])
        result=compact_map(points,confidence,colors,cameras,[0,.5],1,
                           {"inferenceSeconds":1,"peakGpuMb":1,"frames":2},maximum=100)
        self.assertLessEqual(len(result['points']),100)
        self.assertEqual(len(result['cameras']),2)
        self.assertTrue(all(p[3:]==[128,64,32] for p in result['points']))
        json.dumps(result,allow_nan=False)

    def test_invalid_prediction_shapes_and_nonfinite_cameras_fail(self):
        points=np.ones((3,3));colors=np.ones((3,3))
        for confidence,cameras in [(np.ones(2),np.ones((2,3))),
                                    (np.ones(3),np.full((2,3),np.nan))]:
            with self.assertRaises(ValueError):
                compact_map(points,confidence,colors,cameras,[0,.5],1,{})

if __name__=='__main__':
    unittest.main()
