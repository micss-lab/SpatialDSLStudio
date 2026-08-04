"""Unit tests for elevation-aware layout normalization (no Isaac Sim needed)."""

import os
import unittest

from layout import load_layout, scene_bounds


class LayoutElevationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture = os.path.join(os.path.dirname(os.path.abspath(__file__)), "warehouse_layout.json")
        cls.layout = load_layout(fixture)

    def test_scales_all_three_position_axes_to_metres(self):
        self.assertEqual([drone["z"] for drone in self.layout["drones"]], [4.5, 0.0])
        self.assertAlmostEqual(self.layout["drones"][0]["x"], 12.0)
        self.assertAlmostEqual(self.layout["drones"][0]["height"], 0.4)
        self.assertTrue(all(robot["z"] == 0.0 for robot in self.layout["robots"]))

    def test_drones_remain_separate_from_ground_obstacles(self):
        self.assertEqual(len(self.layout["drones"]), 2)
        self.assertEqual(len(self.layout["obstacles"]), 3)
        self.assertNotIn("Inspection Drone Alpha", {
            obstacle["name"] for obstacle in self.layout["obstacles"]
        })

    def test_scene_bounds_include_aerial_xy_without_using_elevation(self):
        bounds = scene_bounds(self.layout, margin=0.0)
        self.assertLessEqual(bounds[0], min(drone["x"] for drone in self.layout["drones"]))
        self.assertGreaterEqual(bounds[2], max(drone["x"] for drone in self.layout["drones"]))
        self.assertEqual(len(bounds), 4)


if __name__ == "__main__":
    unittest.main()
