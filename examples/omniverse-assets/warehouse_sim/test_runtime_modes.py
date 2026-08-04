import json
import math
import tempfile
import unittest
from pathlib import Path

from run_warehouse_sim import (
    differential_wheel_speeds,
    load_drone_asset_config,
    load_robot_asset_config,
    wrap_degrees,
)


class RuntimeControlModeTests(unittest.TestCase):
    def test_straight_drive_commands_equal_wheel_rates(self):
        left, right = differential_wheel_speeds(1.14, 0, 0.057, 0.324)

        self.assertAlmostEqual(left, 20.0)
        self.assertAlmostEqual(right, 20.0)

    def test_in_place_rotation_commands_opposite_wheels(self):
        left, right = differential_wheel_speeds(0, 90, 0.057, 0.324)

        self.assertLess(left, 0)
        self.assertAlmostEqual(left, -right)

    def test_invalid_drive_geometry_is_rejected(self):
        with self.assertRaises(ValueError):
            differential_wheel_speeds(1, 0, 0, 0.324)

    def test_heading_error_wraps_at_180_degrees(self):
        self.assertEqual(wrap_degrees(190), -170)
        self.assertEqual(wrap_degrees(-190), 170)

    def test_manifest_supplies_articulation_contract(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "asset-manifest.json").write_text(
                json.dumps(
                    {
                        "defaults": {
                            "MobileRobot": {
                                "asset": "robot.usda",
                                "articulationAsset": "robot_articulation.usda",
                                "massKg": 4.2,
                                "wheelRadiusM": 0.08,
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            config = load_robot_asset_config(str(root))

            self.assertEqual(config["articulationAsset"], "robot_articulation.usda")
            self.assertEqual(config["massKg"], 4.2)
            self.assertEqual(config["wheelRadiusM"], 0.08)
            self.assertTrue(math.isfinite(config["wheelSeparationM"]))

    def test_manifest_supplies_kinematic_drone_contract(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "asset-manifest.json").write_text(
                json.dumps({
                    "defaults": {
                        "InspectionDrone": {
                            "asset": "inspection_drone.usda",
                            "massKg": 2.0,
                            "bodyMode": "kinematic",
                        }
                    }
                }),
                encoding="utf-8",
            )

            config = load_drone_asset_config(str(root))
            self.assertEqual(config["asset"], "inspection_drone.usda")
            self.assertEqual(config["massKg"], 2.0)
            self.assertEqual(config["bodyMode"], "kinematic")


if __name__ == "__main__":
    unittest.main()
