"""CPU-only adapter checks. These do not run or benchmark LingBot-Map."""
import json
import unittest
import numpy as np
from export_map import compact_map

class ExportTests(unittest.TestCase):
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
