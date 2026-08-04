"""Load a code-generated warehouse layout and normalise it to metres.

The layout JSON is produced by the "Generate Warehouse Layout" code generation
template from a Smart Warehouse model. Both the brain service and the Isaac Sim
bridge read the same file so they share one source of truth.
"""

import json


def load_layout(path):
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    scale = 0.001 if data.get("units", "mm") == "mm" else 1.0
    size_keys = ("x", "y", "z", "length", "width", "height")

    def conv(rec):
        out = dict(rec)
        for key in size_keys:
            if key in out and isinstance(out[key], (int, float)):
                out[key] = out[key] * scale
        return out

    return {
        "robots": [conv(r) for r in data.get("robots", [])],
        "obstacles": [conv(o) for o in data.get("obstacles", [])],
        "pickups": [conv(p) for p in data.get("pickups", [])],
        "dropoffs": [conv(d) for d in data.get("dropoffs", [])],
        "chargers": [conv(c) for c in data.get("chargers", [])],
        "drones": [conv(d) for d in data.get("drones", [])],
    }


def scene_bounds(layout, margin=5.0):
    pts = []
    for group in ("robots", "obstacles", "pickups", "dropoffs", "chargers", "drones"):
        pts += [(rec["x"], rec["y"]) for rec in layout.get(group, [])]
    if not pts:
        return (-10.0, -10.0, 10.0, 10.0)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin)
