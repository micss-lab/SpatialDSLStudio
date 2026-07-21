"""Isaac Sim bridge for the warehouse navigation simulation.

This is the simulator side of the MAS architecture: it builds the USD scene with
physics and drives the robots, but contains NO planning logic. Each frame it
reads each robot's Target from the brain (OPC UA) and writes back the robot's
Location, mirroring how Visual Components exchanges variables with WarehouseMAS.

Run the brain first (separate process / terminal):
  python3 warehouse_brain.py --layout warehouse_layout.json
Then run this inside Isaac Sim's Python environment:
  /isaac-sim/python.sh run_warehouse_sim.py --layout warehouse_layout.json \
      --asset-root <repo>/examples/omniverse-assets

Requires: asyncua (pip install asyncua). Tested against the Isaac Sim 4.5 / 5.x
standalone API (from isaacsim import SimulationApp); NVIDIA shifts module paths
between major releases.
"""

import argparse
import math
import os
import time

from layout import load_layout, scene_bounds

ROBOT_ASSET = "cc0-mini-vehicle-kit/demo_forklift.usda"
ROBOT_MAX_SPEED = 1.4
SIM_HZ = 30.0
NAMESPACE = "urn:warehouse:mas"


def parse_args():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Isaac Sim warehouse bridge (OPC UA client).")
    parser.add_argument("--layout", default=os.path.join(here, "warehouse_layout.json"))
    parser.add_argument("--asset-root", default=os.path.abspath(os.path.join(here, "..")))
    parser.add_argument("--endpoint", default="opc.tcp://127.0.0.1:4840/warehouse/mas")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--max-seconds", type=float, default=0.0)
    return parser.parse_args()


def safe_name(name):
    cleaned = "".join(c if c.isalnum() else "_" for c in name).strip("_")
    return cleaned or "Prim"


def main():
    args = parse_args()
    layout = load_layout(args.layout)
    asset_root = os.path.abspath(os.path.expanduser(args.asset_root))

    from isaacsim import SimulationApp
    simulation_app = SimulationApp({"headless": args.headless})

    import omni.usd
    from pxr import UsdGeom, UsdLux, Gf
    from asyncua.sync import Client
    from asyncua import ua

    stage = omni.usd.get_context().get_stage()
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    world = UsdGeom.Xform.Define(stage, "/World")
    stage.SetDefaultPrim(world.GetPrim())

    def add_collider(prim):
        try:
            from pxr import UsdPhysics
            UsdPhysics.CollisionAPI.Apply(prim)
        except Exception as exc:
            print("[sim] collider skipped: " + str(exc))

    def add_prop(group, record):
        prim = stage.DefinePrim("/World/" + group + "/" + safe_name(record["name"]), "Xform")
        asset = os.path.join(asset_root, record.get("asset", ""))
        if record.get("asset") and os.path.isfile(asset):
            prim.GetReferences().AddReference(asset)
        length = max(record.get("length", 1.0), 0.01)
        width = max(record.get("width", 1.0), 0.01)
        height = max(record.get("height", 1.0), 0.01)
        xf = UsdGeom.Xformable(prim)
        xf.AddTranslateOp().Set(Gf.Vec3d(record["x"], record["y"], height / 2.0))
        xf.AddScaleOp().Set(Gf.Vec3f(length, width, height))
        add_collider(prim)

    min_x, min_y, max_x, max_y = scene_bounds(layout)

    ground = UsdGeom.Cube.Define(stage, "/World/Ground")
    ground.CreateSizeAttr(1.0)
    ground.CreateDisplayColorAttr([Gf.Vec3f(0.18, 0.20, 0.22)])
    gxf = UsdGeom.Xformable(ground.GetPrim())
    gxf.AddTranslateOp().Set(Gf.Vec3d((min_x + max_x) / 2.0, (min_y + max_y) / 2.0, -0.05))
    gxf.AddScaleOp().Set(Gf.Vec3f(max_x - min_x, max_y - min_y, 0.1))
    add_collider(ground.GetPrim())

    sun = UsdLux.DistantLight.Define(stage, "/World/Sun")
    sun.CreateIntensityAttr(1500.0)
    UsdGeom.Xformable(sun.GetPrim()).AddRotateXYZOp().Set(Gf.Vec3f(-55.0, 0.0, 35.0))

    try:
        from pxr import UsdPhysics
        physics = UsdPhysics.Scene.Define(stage, "/World/PhysicsScene")
        physics.CreateGravityDirectionAttr(Gf.Vec3f(0.0, 0.0, -1.0))
        physics.CreateGravityMagnitudeAttr(9.81)
    except Exception as exc:
        print("[sim] physics scene unavailable, running visual-only: " + str(exc))

    for record in layout["obstacles"]:
        add_prop("Obstacles", record)
    for record in layout["pickups"]:
        add_prop("Pickups", record)
    for record in layout["dropoffs"]:
        add_prop("Dropoffs", record)
    for record in layout.get("chargers", []):
        add_prop("Chargers", record)

    robots = []
    for index, record in enumerate(layout["robots"]):
        prim = stage.DefinePrim("/World/Robots/" + safe_name(record["name"]), "Xform")
        robot_asset = os.path.join(asset_root, ROBOT_ASSET)
        if os.path.isfile(robot_asset):
            prim.GetReferences().AddReference(robot_asset)
        xf = UsdGeom.Xformable(prim)
        t_op = xf.AddTranslateOp()
        rz_op = xf.AddRotateZOp()
        xf.AddRotateXOp().Set(90.0)   # forklift asset is authored Y-up
        xf.AddScaleOp().Set(Gf.Vec3f(0.01, 0.01, 0.01))
        t_op.Set(Gf.Vec3d(record["x"], record["y"], 0.0))
        robots.append({
            "name": record["name"], "opc": "Robot%d" % (index + 1),
            "x": record["x"], "y": record["y"], "heading": 0.0,
            "t_op": t_op, "rz_op": rz_op,
        })

    client = Client(args.endpoint)
    client.connect()
    print("[sim] connected to brain at " + args.endpoint)
    idx = client.get_namespace_index(NAMESPACE)
    loc_nodes, tgt_nodes = {}, {}
    for r in robots:
        loc_nodes[r["name"]] = client.get_node(ua.NodeId(r["opc"] + "/Location", idx))
        tgt_nodes[r["name"]] = client.get_node(ua.NodeId(r["opc"] + "/Target", idx))
        loc_nodes[r["name"]].set_value(ua.DataValue(ua.Variant([r["x"], r["y"], r["heading"]], ua.VariantType.Double)))

    dt = 1.0 / SIM_HZ
    sim_time = 0.0
    try:
        while simulation_app.is_running():
            for r in robots:
                try:
                    tx, ty, speed = tgt_nodes[r["name"]].get_value()
                except Exception:
                    tx, ty, speed = r["x"], r["y"], 0.0
                dx, dy = tx - r["x"], ty - r["y"]
                dist = math.hypot(dx, dy)
                if dist > 1e-6:
                    step = min(dist, min(float(speed), ROBOT_MAX_SPEED) * dt)
                    r["x"] += dx / dist * step
                    r["y"] += dy / dist * step
                    r["heading"] = math.degrees(math.atan2(dy, dx))
                r["t_op"].Set(Gf.Vec3d(r["x"], r["y"], 0.0))
                r["rz_op"].Set(float(r["heading"]))
                loc_nodes[r["name"]].set_value(
                    ua.DataValue(ua.Variant([r["x"], r["y"], r["heading"]], ua.VariantType.Double)))
            simulation_app.update()
            sim_time += dt
            if args.max_seconds > 0.0 and sim_time >= args.max_seconds:
                break
    finally:
        client.disconnect()
        simulation_app.close()


if __name__ == "__main__":
    main()
