"""Tests for the observation log and the simulator stand-in (no Isaac Sim needed).

The snapshot test reads a USD stage and is skipped when pxr is not installed.
"""

import json
import os
import tempfile
import unittest

import observe
import run_standin_sim

try:
    from pxr import Usd  # noqa: F401
    HAVE_PXR = True
except ImportError:
    HAVE_PXR = False

LAYOUT = {
    "units": "m",
    "robots": [
        {"id": "robot-a", "name": "Robot A", "x": -18.0, "y": -8.0, "z": 0.0},
        {"id": "robot-b", "name": "Robot B", "x": 12.0, "y": -8.0, "z": 0.0},
    ],
    "obstacles": [{"id": "rack", "name": "Rack", "x": 0.0, "y": 0.0, "z": 0.0, "length": 3.0, "width": 6.0, "height": 2.5}],
    "pickups": [
        {"id": "conv-a", "name": "Conv A", "x": -18.0, "y": -9.0, "z": 0.0, "length": 6.0, "width": 2.0, "height": 3.0},
        {"id": "conv-b", "name": "Conv B", "x": 12.0, "y": -8.0, "z": 0.0, "length": 6.0, "width": 2.0, "height": 3.0},
    ],
    "dropoffs": [{"id": "output", "name": "Output", "x": 0.0, "y": 8.0, "z": 0.0, "length": 3.0, "width": 3.0, "height": 0.5}],
    "chargers": [],
    "drones": [],
}

STAMPED_SCENE = """#usda 1.0
(
    defaultPrim = "World"
    metersPerUnit = 1
    upAxis = "Z"
)

def Xform "World"
{
    def Xform "Rack_0"
    {
        custom string spatialDsl:elementId = "rack"
        double3 xformOp:translate = (10, 12, 1.25)
        float xformOp:rotateZ = 30
        double3 xformOp:scale = (2, 1, 2.5)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateZ", "xformOp:scale"]
    }

    def Xform "Unstamped"
    {
    }
}
"""


class ObservationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.layout_path = self.path("warehouse_layout.json")
        with open(self.layout_path, "w", encoding="utf-8") as handle:
            json.dump(LAYOUT, handle)
        self.authored_path = self.path("authored.jsonl")
        recorder = observe.ObservationRecorder(self.authored_path, source="usd-authored")
        recorder.sample(0.0, [
            {"elementId": record["id"], "prim": "/World/" + record["id"], "layer": "warehouse_layout.usda",
             "x": record["x"], "y": record["y"], "z": record["z"] + record.get("height", 0.0) / 2.0, "yaw": 0.0}
            for group in ("robots", "obstacles", "pickups", "dropoffs") for record in LAYOUT[group]
        ])
        recorder.close()

    def path(self, name):
        return os.path.join(self.directory.name, name)

    def run_standin(self, **options):
        out = self.path("observations.jsonl")
        run_standin_sim.run(self.layout_path, self.authored_path, out, seconds=10.0, **options)
        return observe.read_log(out)

    def test_log_starts_with_a_header_and_groups_samples_by_time(self):
        header, samples = observe.read_log(self.authored_path)
        self.assertEqual(header["schema"], observe.SCHEMA)
        self.assertEqual(header["units"], {"length": "m", "angle": "deg"})
        self.assertEqual(len(samples), 1)
        self.assertEqual(samples[0][1]["rack"]["z"], 1.25)

    def test_standin_moves_only_the_robots_and_binds_the_log_to_the_layout(self):
        header, samples = self.run_standin()
        self.assertEqual(header["controlledElementIds"], ["robot-a", "robot-b"])
        self.assertEqual(header["layoutSha256"], observe.file_sha256(self.layout_path))
        self.assertEqual(len(samples), 21)  # 2 Hz over 10 s, both ends included
        first, last = samples[0][1], samples[-1][1]
        self.assertEqual((first["rack"]["x"], first["rack"]["y"]), (last["rack"]["x"], last["rack"]["y"]))
        self.assertNotEqual((first["robot-a"]["x"], first["robot-a"]["y"]),
                            (last["robot-a"]["x"], last["robot-a"]["y"]))

    def test_disturbance_displaces_the_element_from_its_time_on(self):
        disturbance = run_standin_sim.parse_disturbance("Rack:-1.2,0.5,0,15@4")
        _, samples = self.run_standin(disturbances=[disturbance])
        by_time = dict(samples)
        self.assertEqual(by_time[3.5]["rack"]["x"], 0.0)
        self.assertAlmostEqual(by_time[4.0]["rack"]["x"], -1.2)
        self.assertAlmostEqual(by_time[10.0]["rack"]["y"], 0.5)
        self.assertAlmostEqual(by_time[10.0]["rack"]["yaw"], 15.0)

    @unittest.skipUnless(HAVE_PXR, "pxr (usd-core) is not installed")
    def test_snapshot_reads_the_stamp_pose_and_authoring_layer(self):
        scene = self.path("scene.usda")
        with open(scene, "w", encoding="utf-8") as handle:
            handle.write(STAMPED_SCENE)
        out = self.path("snapshot.jsonl")
        self.assertEqual(observe.snapshot(scene, out), 1)
        header, samples = observe.read_log(out)
        record = samples[0][1]["rack"]
        self.assertEqual(header["source"], "usd-authored")
        self.assertEqual((record["prim"], record["layer"]), ("/World/Rack_0", "scene.usda"))
        self.assertEqual((record["x"], record["y"], record["z"]), (10.0, 12.0, 1.25))
        self.assertAlmostEqual(record["yaw"], 30.0, places=4)


if __name__ == "__main__":
    unittest.main()
