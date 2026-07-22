import json
import tempfile
import unittest
from pathlib import Path

from validate_asset_manifest import validate_manifest


class AssetManifestPathTests(unittest.TestCase):
    def test_committed_manifest_and_all_local_usd_dependencies_resolve(self):
        here = Path(__file__).resolve().parent

        result = validate_manifest(here / "asset-manifest.json")

        self.assertTrue(result.valid, result.errors)
        self.assertIn(
            "nvidia-f1tenth-amr/f1tenth_amr_collision.usda",
            result.resolved,
        )
        self.assertIn(
            "nvidia-f1tenth-amr/layers/collision.usda",
            result.resolved,
        )
        self.assertIn(
            "nvidia-f1tenth-amr/f1tenth_amr_articulation.usda",
            result.resolved,
        )

    def test_missing_manifest_asset_is_an_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            manifest = root / "asset-manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "version": 2,
                        "defaults": {"MobileRobot": {"asset": "missing/robot.usda"}},
                        "overrides": {},
                    }
                ),
                encoding="utf-8",
            )

            result = validate_manifest(manifest)

            self.assertFalse(result.valid)
            self.assertEqual(
                result.errors,
                ["defaults.MobileRobot.asset is missing: missing/robot.usda"],
            )

    def test_missing_nested_usd_dependency_is_an_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "robot.usda").write_text(
                '#usda 1.0\n(subLayers = [@layers/missing.usda@])\n',
                encoding="utf-8",
            )
            manifest = root / "asset-manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "version": 2,
                        "defaults": {"MobileRobot": {"asset": "robot.usda"}},
                    }
                ),
                encoding="utf-8",
            )

            result = validate_manifest(manifest)

            self.assertFalse(result.valid)
            self.assertIn(
                "robot.usda -> layers/missing.usda: dependency is missing",
                result.errors,
            )

    def test_traversal_asset_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            manifest = root / "asset-manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "version": 2,
                        "defaults": {"MobileRobot": {"asset": "../robot.usda"}},
                    }
                ),
                encoding="utf-8",
            )

            result = validate_manifest(manifest)

            self.assertFalse(result.valid)
            self.assertIn("not a safe relative POSIX path", result.errors[0])


if __name__ == "__main__":
    unittest.main()
