"""Generation fidelity check for the Smart Warehouse example.

Runs the Node generator (fidelity-generate.ts), which applies K seeded pose
edits to the bundled model and regenerates the layered OpenUSD bundle and the
Visual Components location files after each edit. This script then opens every
generated USD stage with pxr and parses the JSON outputs, compares each
element's pose with the model (millimetres to metres for USD), validates the
composed stage with UsdValidation, and reports the determinism result.

    cd benchmarks && npm run fidelity        # or: .venv/bin/python fidelity.py [K] [seed]

Writes results/fidelity.json and results/fidelity.md.
"""

import importlib.metadata
import json
import platform
import struct
import subprocess
import sys
import time
from pathlib import Path

from pxr import Usd, UsdGeom, UsdValidation

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
OUT = RESULTS / "fidelity"
TOLERANCE = 1e-6
SCALED_CLASSES = {"Conveyor", "OutputLocation", "ChargingStation", "PathwayArea", "StorageRack", "Dock"}
UNSCALED_CLASSES = {"MobileRobot", "InspectionDrone"}
VC_FILES = {
    "PathwayAreaLocation.json": "PathwayArea",
    "RobotLocation.json": "MobileRobot",
    "ConveyorLocation.json": "Conveyor",
    "OutputLocation.json": "OutputLocation",
    "ChargingStationLocation.json": "ChargingStation",
}
LAYOUT_JSON_GROUPS = {
    "robots": {"MobileRobot"},
    "obstacles": {"StorageRack", "Dock"},
    "pickups": {"Conveyor"},
    "dropoffs": {"OutputLocation"},
    "chargers": {"ChargingStation"},
    "drones": {"InspectionDrone"},
}
# warehouse_layout.json gives a yaw only for drones; the other groups are axis-aligned
# footprints for the simulator. Every element's yaw is still compared in the USD stage
# (xformOp:rotateZ) and the Visual Components files (Rz).
LAYOUT_JSON_YAW_GROUPS = {"drones"}


def float32(value):
    """Round to single precision, the declared type of xformOp:rotateZ."""
    return struct.unpack("f", struct.pack("f", float(value)))[0]


class Tally:
    def __init__(self):
        self.checked = 0
        self.mismatches = []

    def compare(self, target, edit, element, field, actual, expected, tolerance=TOLERANCE):
        self.checked += 1
        if actual is None or abs(float(actual) - float(expected)) > tolerance:
            self.mismatches.append({
                "target": target, "edit": edit, "element": element, "field": field,
                "actual": actual, "expected": expected,
            })

    def missing(self, target, edit, element):
        self.checked += 1
        self.mismatches.append({"target": target, "edit": edit, "element": element, "field": "missing"})


def check_usd(edit_dir, edit, expected, tally):
    stage = Usd.Stage.Open(str(edit_dir / "warehouse_simulation.usda"))
    prims = {}
    for prim in stage.Traverse():
        attribute = prim.GetAttribute("spatialDsl:sourceName")
        if attribute and attribute.HasAuthoredValue():
            prims[attribute.Get()] = prim
    xform_cache = UsdGeom.XformCache()
    for element in expected:
        name, class_name = element["name"], element["className"]
        if class_name not in SCALED_CLASSES | UNSCALED_CLASSES:
            continue
        prim = prims.get(name)
        if prim is None:
            tally.missing("usd", edit, name)
            continue
        x_m, y_m = element["x"] / 1000, element["y"] / 1000
        if class_name in SCALED_CLASSES:
            z_m = (element["z"] + element["depthMm"] / 2) / 1000
        else:
            z_m = element["z"] / 1000
        translate = prim.GetAttribute("xformOp:translate").Get()
        for axis, value in zip("xyz", (x_m, y_m, z_m)):
            tally.compare("usd", edit, name, f"translate.{axis}", translate["xyz".index(axis)] if translate else None, value)
        # The composed world transform must agree with the layout opinion.
        world = xform_cache.GetLocalToWorldTransform(prim).ExtractTranslation()
        for axis, value in zip("xyz", (x_m, y_m, z_m)):
            tally.compare("usd", edit, name, f"world.{axis}", world["xyz".index(axis)], value)
        tally.compare("usd", edit, name, "rotateZ", prim.GetAttribute("xformOp:rotateZ").Get(), float32(element["rotationZ"]))
        tally.compare("usd", edit, name, "spatialDsl:baseElevationMm", prim.GetAttribute("spatialDsl:baseElevationMm").Get(), element["z"])
        class_attr = prim.GetAttribute("spatialDsl:className").Get()
        tally.checked += 1
        if class_attr != class_name:
            tally.mismatches.append({"target": "usd", "edit": edit, "element": name, "field": "className", "actual": class_attr, "expected": class_name})
        if class_name in SCALED_CLASSES:
            scale = prim.GetAttribute("xformOp:scale").Get()
            for axis, value in zip("xyz", (element["widthMm"], element["heightMm"], element["depthMm"])):
                tally.compare("usd", edit, name, f"scale.{axis}", scale["xyz".index(axis)] if scale else None, value / 1000)
    return stage


def check_visual_components(edit_dir, edit, expected, tally):
    for filename, class_name in VC_FILES.items():
        rows = {row["Name"]: row for row in json.loads((edit_dir / "visual-components" / filename).read_text())}
        for element in (e for e in expected if e["className"] == class_name):
            row = rows.get(element["name"])
            if row is None:
                tally.missing("visual-components", edit, element["name"])
                continue
            tally.compare("visual-components", edit, element["name"], "X", row["X"], element["x"])
            tally.compare("visual-components", edit, element["name"], "Y", row["Y"], element["y"])
            tally.compare("visual-components", edit, element["name"], "Rz", row["Rz"], element["rotationZ"])
            if class_name == "PathwayArea":
                tally.compare("visual-components", edit, element["name"], "AreaLength", row["AreaLength"], element["widthMm"])
                tally.compare("visual-components", edit, element["name"], "AreaWidth", row["AreaWidth"], element["heightMm"])


def check_layout_json(edit_dir, edit, expected, tally):
    layout = json.loads((edit_dir / "warehouse_layout.json").read_text())
    for group, classes in LAYOUT_JSON_GROUPS.items():
        rows = {row["name"]: row for row in layout[group]}
        for element in (e for e in expected if e["className"] in classes):
            row = rows.get(element["name"])
            if row is None:
                tally.missing("omniverse-layout-json", edit, element["name"])
                continue
            for field, key in (("x", "x"), ("y", "y"), ("z", "z")):
                tally.compare("omniverse-layout-json", edit, element["name"], field, row[key], element[key])
            if "length" in row:
                tally.compare("omniverse-layout-json", edit, element["name"], "length", row["length"], element["widthMm"])
                tally.compare("omniverse-layout-json", edit, element["name"], "width", row["width"], element["heightMm"])
                tally.compare("omniverse-layout-json", edit, element["name"], "height", row["height"], element["depthMm"])
            if group in LAYOUT_JSON_YAW_GROUPS:
                tally.compare("omniverse-layout-json", edit, element["name"], "yaw", row.get("yaw"), element["rotationZ"])


def compliance(path):
    """Run the UsdValidation framework on the composed stage.

    Every registered validator runs except the usdz package validators, which
    only apply to .usdz archives.
    """
    registry = UsdValidation.ValidationRegistry()
    names = [meta.name for meta in registry.GetAllValidatorMetadata()
             if not meta.isSuite and "UsdzValidators" not in meta.GetKeywords()]
    context = UsdValidation.ValidationContext(registry.GetOrLoadValidatorsByName(names))
    findings = context.Validate(Usd.Stage.Open(str(path)))
    def describe(finding):
        return f"{finding.GetValidator().GetMetadata().name}: {finding.GetMessage()}"
    by_type = lambda kind: [describe(f) for f in findings if f.GetType() == kind]
    return {
        "layer": path.name,
        "validators": len(names),
        "errors": by_type(UsdValidation.ValidationErrorType.Error),
        "failedChecks": [],
        "warnings": by_type(UsdValidation.ValidationErrorType.Warn),
        "info": by_type(UsdValidation.ValidationErrorType.Info),
    }


def main():
    edits = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 20261011
    started = time.time()
    ts_node = HERE.parent / "backend" / "node_modules" / ".bin" / "ts-node"
    subprocess.run([str(ts_node), "--transpile-only", "--project", str(HERE.parent / "backend" / "tsconfig.json"),
                    str(HERE / "fidelity-generate.ts"), str(OUT), str(edits), str(seed)], check=True, cwd=HERE)
    generated = time.time()
    manifest = json.loads((OUT / "manifest.json").read_text())

    tally = Tally()
    edit_dirs = sorted(p for p in OUT.iterdir() if p.is_dir() and p.name.startswith("edit-"))
    for edit_dir in edit_dirs:
        edit = int(edit_dir.name.split("-")[1])
        expected = json.loads((edit_dir / "expected.json").read_text())
        check_usd(edit_dir, edit, expected, tally)
        check_visual_components(edit_dir, edit, expected, tally)
        check_layout_json(edit_dir, edit, expected, tally)

    checks = [compliance(edit_dirs[0] / "warehouse_simulation.usda"), compliance(edit_dirs[-1] / "warehouse_simulation.usda")]
    checks[0]["edit"] = edit_dirs[0].name
    checks[1]["edit"] = edit_dirs[-1].name
    by_target = {}
    for item in tally.mismatches:
        by_target[item["target"]] = by_target.get(item["target"], 0) + 1
    kinds = {}
    for item in manifest["editLog"]:
        kinds[item["kind"]] = kinds.get(item["kind"], 0) + 1

    result = {
        "edits": edits,
        "editKinds": kinds,
        "seed": seed,
        "bundles": len(edit_dirs),
        "placedElements": manifest["placedElements"],
        "valuesChecked": tally.checked,
        "mismatches": len(tally.mismatches),
        "mismatchesByTarget": by_target,
        "mismatchSamples": tally.mismatches[:20],
        "tolerance": TOLERANCE,
        "determinism": manifest["determinism"],
        "compliance": checks,
        "usdVersion": importlib.metadata.version("usd-core"),
        "python": platform.python_version(),
        "platform": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "seconds": {"generation": round(generated - started, 1), "checks": round(time.time() - generated, 1)},
    }
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "fidelity.json").write_text(json.dumps(result, indent=2) + "\n")

    def compliance_passed(check):
        return not check["errors"] and not check["failedChecks"] and not check["warnings"]

    def compliance_line(check):
        status = "passed" if compliance_passed(check) else "failed"
        return (f"| {check['edit']}/{check['layer']} | {check['validators']} | {status} | {len(check['errors'])} | "
                f"{len(check['warnings'])} |")

    lines = [
        "# Generation fidelity results",
        "",
        f"{edits} seeded pose edits (seed {seed}; {', '.join(f'{v} {k}' for k, v in sorted(kinds.items()))}) applied one after another to the bundled Smart Warehouse model "
        f"({manifest['placedElements']} placed elements); outputs regenerated after each edit, {len(edit_dirs)} bundles in total.",
        "",
        "| Target | Values compared | Mismatches |",
        "| --- | ---: | ---: |",
        f"| All (tolerance {TOLERANCE}) | {tally.checked} | {len(tally.mismatches)} |",
    ]
    lines += [f"| {target} | | {count} |" for target, count in sorted(by_target.items())]
    lines += [
        "",
        "USD values are read from the composed stage `warehouse_simulation.usda` (layout, asset, and physics layers): "
        "`xformOp:translate` and the composed world translation in metres, `xformOp:rotateZ` (declared `float`, so the expected "
        "yaw is rounded to single precision), `xformOp:scale`, `spatialDsl:baseElevationMm`, and `spatialDsl:className`. "
        "Visual Components location files and the Omniverse `warehouse_layout.json` are compared in millimetres and degrees. "
        "`warehouse_layout.json` gives a yaw only for drones (the other groups are axis-aligned footprints for the simulator), "
        "so the yaw of the other elements is compared in USD and Visual Components only.",
        "",
        "## USD validation",
        "",
        "`UsdUtils.ComplianceChecker` is not available in usd-core 26, so the stages are checked with the `UsdValidation` "
        "framework instead, running every registered validator except the usdz package ones.",
        "",
        "| Stage | Validators | Result | Errors | Warnings |",
        "| --- | ---: | --- | ---: | ---: |",
        *[compliance_line(check) for check in checks],
        "",
        "## Determinism",
        "",
        f"Generating the unedited model twice gives byte-identical outputs: **{manifest['determinism']['byteIdentical']}** "
        f"({manifest['determinism']['files']} files compared).",
        "",
        f"Environment: usd-core {result['usdVersion']}, Python {result['python']}, {result['platform']}. "
        f"Generation {result['seconds']['generation']} s, checks {result['seconds']['checks']} s.",
        "",
    ]
    for check in checks:
        details = check["errors"] + check["warnings"] + check["info"]
        if details:
            lines += [f"Checker messages for {check['edit']}:", "", *[f"- {message}" for message in details], ""]
    (RESULTS / "fidelity.md").write_text("\n".join(lines))
    print("\n".join(lines))
    passed = (not tally.mismatches and manifest["determinism"]["byteIdentical"]
              and all(compliance_passed(check) for check in checks))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
