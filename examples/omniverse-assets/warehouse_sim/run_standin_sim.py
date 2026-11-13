"""Simulator stand-in for the twin loop: no Isaac Sim, GPU, or OPC UA.

The MAS brain drives the robots kinematically, exactly as the Isaac Sim bridge
does in its default control mode, and the run is recorded in the same
observation log (see observe.py). Everything the brain does not drive stays at
its authored pose unless a disturbance moves it, which is what a physics engine
does when something pushes an object or an asset does not rest where it was
placed.

  python run_standin_sim.py --layout warehouse_layout.json \
      --authored authored.jsonl --observe-out observations.jsonl \
      --disturb "Storage Rack #2:-1.2,0@20"

`--authored` is the output of `observe.py snapshot` for the generated scene.
`--disturb NAME:DX,DY[,DZ[,DYAW]]@T` displaces the named element by metres and
degrees at simulation time T (repeatable). T = 0 means the element never sits
at its authored pose.
"""

import argparse
import math
import os

from layout import load_layout
from observe import ObservationRecorder, file_sha256, read_log
from warehouse_brain import WarehouseMAS

CONTROL_DT = 0.1


def parse_disturbance(text):
    try:
        target, at = text.rsplit("@", 1)
        name, deltas = target.rsplit(":", 1)
        values = [float(value) for value in deltas.split(",")]
        if not 2 <= len(values) <= 4:
            raise ValueError
        values += [0.0] * (4 - len(values))
        return {"name": name, "dx": values[0], "dy": values[1], "dz": values[2], "dyaw": values[3], "t": float(at)}
    except ValueError:
        raise argparse.ArgumentTypeError("expected NAME:DX,DY[,DZ[,DYAW]]@T, got %r" % text)


def parse_args():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Kinematic stand-in for the Isaac Sim bridge.")
    parser.add_argument("--layout", default=os.path.join(here, "warehouse_layout.json"))
    parser.add_argument("--authored", required=True, help="authored poses from `observe.py snapshot`")
    parser.add_argument("--observe-out", required=True)
    parser.add_argument("--observe-hz", type=float, default=2.0)
    parser.add_argument("--seconds", type=float, default=60.0)
    parser.add_argument("--disturb", type=parse_disturbance, action="append", default=[])
    return parser.parse_args()


def run(layout_path, authored_path, out_path, *, seconds=60.0, observe_hz=2.0, disturbances=()):
    layout = load_layout(layout_path)
    _, authored_samples = read_log(authored_path)
    poses = {element_id: dict(record) for element_id, record in authored_samples[0][1].items()}
    for pose in poses.values():
        pose.pop("t", None)

    names = {}
    for group in ("robots", "obstacles", "pickups", "dropoffs", "chargers", "drones"):
        for record in layout[group]:
            if "id" not in record:
                raise SystemExit("Layout records carry no element id; regenerate warehouse_layout.json.")
            names[record["name"]] = record["id"]
    missing = sorted(name for name, element_id in names.items() if element_id not in poses)
    if missing:
        raise SystemExit("Authored poses are missing layout elements: " + ", ".join(missing))
    for disturbance in disturbances:
        if disturbance["name"] not in names:
            raise SystemExit("Cannot disturb unknown element " + disturbance["name"])

    mas = WarehouseMAS(layout, control_dt=CONTROL_DT)
    robot_ids = {robot.name: names[robot.name] for robot in mas.robots}
    reported = {
        robot.name: (poses[robot_ids[robot.name]]["x"], poses[robot_ids[robot.name]]["y"],
                     poses[robot_ids[robot.name]]["yaw"])
        for robot in mas.robots
    }

    recorder = ObservationRecorder(
        out_path, source="standin", layout_sha256=file_sha256(layout_path),
        scene=os.path.basename(authored_path), controlled=robot_ids.values(),
    )
    pending = sorted(disturbances, key=lambda item: item["t"])
    steps = int(round(seconds / CONTROL_DT))
    sample_every = max(1, int(round(1.0 / (observe_hz * CONTROL_DT))))
    for step in range(steps + 1):
        t = step * CONTROL_DT
        while pending and pending[0]["t"] <= t + 1e-9:
            disturbance = pending.pop(0)
            pose = poses[names[disturbance["name"]]]
            pose["x"] += disturbance["dx"]
            pose["y"] += disturbance["dy"]
            pose["z"] += disturbance["dz"]
            pose["yaw"] += disturbance["dyaw"]
        for name, (x, y, heading) in reported.items():
            poses[robot_ids[name]].update({"x": x, "y": y, "yaw": heading})
        if step % sample_every == 0:
            recorder.sample(t, [poses[element_id] for element_id in sorted(poses)])
        outputs = mas.update(reported)
        for robot in mas.robots:
            tx, ty, speed = outputs[robot.name]["target"]
            x, y, heading = reported[robot.name]
            dx, dy = tx - x, ty - y
            distance = math.hypot(dx, dy)
            if distance > 1e-6 and speed > 1e-6:
                move = min(distance, min(speed, robot.max_speed) * CONTROL_DT)
                x += dx / distance * move
                y += dy / distance * move
                heading = math.degrees(math.atan2(dy, dx))
            reported[robot.name] = (x, y, heading)
    recorder.close()
    return recorder.samples


def main():
    args = parse_args()
    samples = run(args.layout, args.authored, args.observe_out, seconds=args.seconds,
                  observe_hz=args.observe_hz, disturbances=args.disturb)
    print("[standin] %d samples over %.1f s written to %s" % (samples, args.seconds, args.observe_out))


if __name__ == "__main__":
    main()
