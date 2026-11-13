"""Record what a running scene does, keyed by the model element behind each prim.

The code generator stamps every generated prim with `spatialDsl:elementId`, the
ID of the model element it was generated from. This module reads that stamp
back, so a pose observed in the simulator can be attributed to a model element
without matching names or paths.

The observation log is JSON Lines and simulator-neutral: the Isaac Sim bridge
(run_warehouse_sim.py --observe-out) and the stand-in (run_standin_sim.py)
write the same records.

  line 1   {"schema": "spatialdsl.observations/1", "source": ..., "units": ...,
            "layoutSha256": ..., "scene": ..., "controlledElementIds": [...]}
  line 2+  {"t": seconds, "elementId": ..., "prim": ..., "layer": ...,
            "x": m, "y": m, "z": m, "yaw": deg}

`layoutSha256` binds the log to the generated bundle it was recorded against.
`controlledElementIds` lists the elements the simulator drives (the robots);
every other element is expected to stay where the model put it.

Authored poses of a generated scene, with no simulator (needs pxr / usd-core):
  python observe.py snapshot --scene warehouse_simulation.usda --out authored.jsonl
"""

import argparse
import hashlib
import json
import math
import os

SCHEMA = "spatialdsl.observations/1"
ELEMENT_ID_ATTRIBUTE = "spatialDsl:elementId"


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


class ObservationRecorder:
    """Append-only writer for one observation log."""

    def __init__(self, path, *, source, layout_sha256=None, scene=None, controlled=()):
        self.path = path
        self.samples = 0
        self._handle = open(path, "w", encoding="utf-8")
        self._write({
            "schema": SCHEMA,
            "source": source,
            "units": {"length": "m", "angle": "deg"},
            "frame": "world, right-handed, Z up",
            "layoutSha256": layout_sha256,
            "scene": scene,
            "controlledElementIds": sorted(controlled),
        })

    def _write(self, record):
        self._handle.write(json.dumps(record, sort_keys=True) + "\n")

    def sample(self, t, poses):
        """poses: records with elementId, prim, x, y, z, yaw (and optionally layer)."""
        for pose in poses:
            self._write({"t": round(float(t), 6), **pose})
        self.samples += 1

    def close(self):
        self._handle.close()


def traced_prims(stage):
    """Every prim that carries a generated element ID, in stage traversal order."""
    traced = []
    for prim in stage.Traverse():
        attribute = prim.GetAttribute(ELEMENT_ID_ATTRIBUTE)
        if not attribute or not attribute.HasAuthoredValue():
            continue
        # The layer that authors the stamp is the generated file the prim came from.
        stack = attribute.GetPropertyStack()
        traced.append({
            "elementId": attribute.Get(),
            "prim": str(prim.GetPath()),
            "layer": os.path.basename(stack[0].layer.identifier) if stack else None,
            "handle": prim,
        })
    return traced


def world_pose(prim):
    """World position in stage units and yaw in degrees of a prim, read from the stage."""
    from pxr import Usd, UsdGeom

    matrix = UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(Usd.TimeCode.Default())
    position = matrix.ExtractTranslation()
    # Row 0 is the image of the local X axis, so this yaw is unaffected by scale.
    yaw = math.degrees(math.atan2(matrix[0][1], matrix[0][0]))
    return float(position[0]), float(position[1]), float(position[2]), yaw


def sample_stage(traced):
    """One pose record per traced prim, as currently held by the stage."""
    poses = []
    for item in traced:
        x, y, z, yaw = world_pose(item["handle"])
        poses.append({
            "elementId": item["elementId"], "prim": item["prim"], "layer": item["layer"],
            "x": x, "y": y, "z": z, "yaw": yaw,
        })
    return poses


def read_log(path):
    """Return (header, samples); samples is a list of (t, {elementId: record}) in time order."""
    with open(path, "r", encoding="utf-8") as handle:
        lines = [json.loads(line) for line in handle if line.strip()]
    if not lines or lines[0].get("schema") != SCHEMA:
        raise ValueError("%s is not a %s log" % (path, SCHEMA))
    samples = []
    for record in lines[1:]:
        if not samples or samples[-1][0] != record["t"]:
            samples.append((record["t"], {}))
        samples[-1][1][record["elementId"]] = record
    return lines[0], samples


def snapshot(scene_path, out_path):
    """Write the authored (pre-simulation) pose of every traced prim as one sample."""
    from pxr import Usd

    stage = Usd.Stage.Open(scene_path)
    if stage is None:
        raise SystemExit("Could not open USD stage: " + scene_path)
    traced = traced_prims(stage)
    if not traced:
        raise SystemExit(
            "No prim in %s carries %s; regenerate the bundle with the current templates."
            % (scene_path, ELEMENT_ID_ATTRIBUTE)
        )
    recorder = ObservationRecorder(out_path, source="usd-authored", scene=os.path.basename(scene_path))
    recorder.sample(0.0, sample_stage(traced))
    recorder.close()
    return len(traced)


def main():
    parser = argparse.ArgumentParser(description="Observation log utilities.")
    commands = parser.add_subparsers(dest="command", required=True)
    snap = commands.add_parser("snapshot", help="write the authored poses of a generated scene")
    snap.add_argument("--scene", required=True)
    snap.add_argument("--out", required=True)
    args = parser.parse_args()
    count = snapshot(os.path.abspath(args.scene), os.path.abspath(args.out))
    print("[observe] %d traced prims written to %s" % (count, args.out))


if __name__ == "__main__":
    main()
