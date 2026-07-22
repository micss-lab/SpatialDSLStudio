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
import json
import math
import os
import time

from layout import load_layout, scene_bounds

ROBOT_ASSET = "nvidia-f1tenth-amr/f1tenth_amr_collision.usda"
ROBOT_ARTICULATION_ASSET = "nvidia-f1tenth-amr/f1tenth_amr_articulation.usda"
ROBOT_MAX_SPEED = 1.4
ROBOT_MASS_KG = 3.1
WHEEL_RADIUS_M = 0.057
WHEEL_SEPARATION_M = 0.324
SIM_HZ = 30.0
NAMESPACE = "urn:warehouse:mas"


def parse_args():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Isaac Sim warehouse bridge (OPC UA client).")
    parser.add_argument("--layout", default=os.path.join(here, "warehouse_layout.json"))
    parser.add_argument("--asset-root", default=os.path.abspath(os.path.join(here, "..")))
    parser.add_argument("--endpoint", default="opc.tcp://127.0.0.1:4840/warehouse/mas")
    parser.add_argument(
        "--scene",
        help="optional generated warehouse_simulation.usda to open instead of rebuilding layout geometry",
    )
    parser.add_argument(
        "--control-mode",
        choices=("kinematic", "dynamic"),
        default="kinematic",
        help="kinematic transform mover or PhysX rigid-body velocity control",
    )
    parser.add_argument(
        "--articulation",
        action="store_true",
        help="select the manifest articulation asset and command its differential wheel drives",
    )
    parser.add_argument(
        "--save-runtime-layer",
        help="export the non-destructive session-layer physics/control overrides on shutdown",
    )
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--max-seconds", type=float, default=0.0)
    return parser.parse_args()


def safe_name(name):
    cleaned = "".join(c if c.isalnum() else "_" for c in name).strip("_")
    return cleaned or "Prim"


def load_robot_asset_config(asset_root):
    defaults = {
        "asset": ROBOT_ASSET,
        "articulationAsset": ROBOT_ARTICULATION_ASSET,
        "massKg": ROBOT_MASS_KG,
        "wheelRadiusM": WHEEL_RADIUS_M,
        "wheelSeparationM": WHEEL_SEPARATION_M,
        "leftWheelJoint": "Drive/LeftWheelJoint",
        "rightWheelJoint": "Drive/RightWheelJoint",
    }
    manifest_path = os.path.join(asset_root, "asset-manifest.json")
    try:
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        configured = manifest.get("defaults", {}).get("MobileRobot", {})
        if isinstance(configured, dict):
            defaults.update(configured)
    except (OSError, ValueError) as exc:
        print("[sim] asset manifest unavailable; using embedded robot defaults: " + str(exc))
    return defaults


def wrap_degrees(value):
    return (value + 180.0) % 360.0 - 180.0


def differential_wheel_speeds(linear_m_s, angular_deg_s, radius_m, separation_m):
    """Return left/right wheel rates in rad/s for the runtime-neutral drive contract."""
    if radius_m <= 0 or separation_m <= 0:
        raise ValueError("wheel radius and separation must be positive")
    angular_rad_s = math.radians(angular_deg_s)
    return (
        (linear_m_s - angular_rad_s * separation_m / 2.0) / radius_m,
        (linear_m_s + angular_rad_s * separation_m / 2.0) / radius_m,
    )


def main():
    args = parse_args()
    layout = load_layout(args.layout)
    asset_root = os.path.abspath(os.path.expanduser(args.asset_root))

    from isaacsim import SimulationApp
    simulation_app = SimulationApp({"headless": args.headless})

    import omni.usd
    from pxr import Gf, Sdf, Usd, UsdGeom, UsdLux, UsdPhysics
    from asyncua.sync import Client
    from asyncua import ua

    context = omni.usd.get_context()
    if args.scene:
        scene_path = os.path.abspath(os.path.expanduser(args.scene))
        if not os.path.isfile(scene_path):
            raise SystemExit("Generated layered scene not found: " + scene_path)
        if not context.open_stage(scene_path):
            raise SystemExit("Isaac Sim could not open layered scene: " + scene_path)
    stage = context.get_stage()
    stage.SetEditTarget(Usd.EditTarget(stage.GetSessionLayer()))
    if not args.scene:
        UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
        UsdGeom.SetStageMetersPerUnit(stage, 1.0)
        world = UsdGeom.Xform.Define(stage, "/World")
        stage.SetDefaultPrim(world.GetPrim())

    robot_asset_config = load_robot_asset_config(asset_root)

    def add_collider(prim):
        try:
            UsdPhysics.CollisionAPI.Apply(prim)
        except Exception as exc:
            print("[sim] collider skipped: " + str(exc))

    def configure_robot_body(prim):
        body = UsdPhysics.RigidBodyAPI.Apply(prim)
        body.CreateRigidBodyEnabledAttr(True)
        body.CreateKinematicEnabledAttr(args.control_mode == "kinematic" and not args.articulation)
        mass = UsdPhysics.MassAPI.Apply(prim)
        mass.CreateMassAttr(float(robot_asset_config.get("massKg", ROBOT_MASS_KG)))
        prim.CreateAttribute("spatialDsl:controlMode", Sdf.ValueTypeNames.String).Set(
            "articulation" if args.articulation else args.control_mode
        )
        return body

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
        proxy = UsdGeom.Cube.Define(stage, prim.GetPath().AppendChild("PhysicsProxy"))
        proxy.CreateSizeAttr(1.0)
        proxy.CreateVisibilityAttr(UsdGeom.Tokens.invisible)
        proxy.CreatePurposeAttr(UsdGeom.Tokens.guide)
        add_collider(proxy.GetPrim())

    if not args.scene:
        min_x, min_y, max_x, max_y = scene_bounds(layout)
        ground = UsdGeom.Cube.Define(stage, "/World/Ground")
        ground.CreateSizeAttr(1.0)
        ground.CreateDisplayColorAttr([Gf.Vec3f(0.18, 0.20, 0.22)])
        gxf = UsdGeom.Xformable(ground.GetPrim())
        gxf.AddTranslateOp().Set(
            Gf.Vec3d((min_x + max_x) / 2.0, (min_y + max_y) / 2.0, -0.05)
        )
        gxf.AddScaleOp().Set(Gf.Vec3f(max_x - min_x, max_y - min_y, 0.1))
        add_collider(ground.GetPrim())

        sun = UsdLux.DistantLight.Define(stage, "/World/Sun")
        sun.CreateIntensityAttr(1500.0)
        UsdGeom.Xformable(sun.GetPrim()).AddRotateXYZOp().Set(Gf.Vec3f(-55.0, 0.0, 35.0))

    try:
        physics = UsdPhysics.Scene.Define(stage, "/World/PhysicsScene")
        physics.CreateGravityDirectionAttr(Gf.Vec3f(0.0, 0.0, -1.0))
        physics.CreateGravityMagnitudeAttr(9.81)
    except Exception as exc:
        print("[sim] physics scene unavailable, running visual-only: " + str(exc))

    if not args.scene:
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
        if args.scene:
            prim_path = "/World/MobileRobot/%s_%d" % (safe_name(record["name"]), index)
            prim = stage.GetPrimAtPath(prim_path)
            if not prim.IsValid():
                raise RuntimeError("Layered scene is missing modeled robot prim " + prim_path)
        else:
            prim_path = "/World/Robots/" + safe_name(record["name"])
            prim = stage.DefinePrim(prim_path, "Xform")
        asset_key = "articulationAsset" if args.articulation else "asset"
        robot_asset = os.path.join(asset_root, robot_asset_config.get(asset_key, ROBOT_ASSET))
        if os.path.isfile(robot_asset):
            if args.scene or args.articulation:
                prim.GetReferences().SetReferences([Sdf.Reference(robot_asset)])
            else:
                prim.GetReferences().AddReference(robot_asset)
        else:
            print("[sim] robot asset missing; retaining generated fallback: " + robot_asset)
        xf = UsdGeom.Xformable(prim)
        t_attr = prim.GetAttribute("xformOp:translate")
        if not t_attr.IsValid():
            t_attr = xf.AddTranslateOp().GetAttr()
        rz_attr = prim.GetAttribute("xformOp:rotateZ")
        if not rz_attr.IsValid():
            rz_attr = xf.AddRotateZOp().GetAttr()
        t_attr.Set(Gf.Vec3d(record["x"], record["y"], 0.0))
        body = configure_robot_body(prim)
        left_joint = stage.GetPrimAtPath(
            prim.GetPath().AppendPath(
                Sdf.Path(robot_asset_config.get("leftWheelJoint", "Drive/LeftWheelJoint"))
            )
        )
        right_joint = stage.GetPrimAtPath(
            prim.GetPath().AppendPath(
                Sdf.Path(robot_asset_config.get("rightWheelJoint", "Drive/RightWheelJoint"))
            )
        )
        robots.append({
            "name": record["name"], "opc": "Robot%d" % (index + 1),
            "x": record["x"], "y": record["y"], "heading": 0.0,
            "prim": prim, "body": body, "t_attr": t_attr, "rz_attr": rz_attr,
            "left_joint": left_joint, "right_joint": right_joint,
        })

    client = Client(args.endpoint)
    client.connect()
    mode_label = "articulation" if args.articulation else args.control_mode
    print("[sim] connected to brain at %s (control=%s)" % (args.endpoint, mode_label))
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
                if args.control_mode == "dynamic" or args.articulation:
                    try:
                        world_matrix = UsdGeom.Xformable(r["prim"]).ComputeLocalToWorldTransform(
                            Usd.TimeCode.Default()
                        )
                        position = world_matrix.ExtractTranslation()
                        r["x"], r["y"] = float(position[0]), float(position[1])
                        r["heading"] = float(
                            world_matrix.ExtractRotation().Decompose(Gf.Vec3d(0.0, 0.0, 1.0))
                        )
                    except Exception:
                        # Keep the previous reported pose if a runtime has not
                        # populated the dynamic transform on its first frame.
                        pass
                try:
                    tx, ty, speed = tgt_nodes[r["name"]].get_value()
                except Exception:
                    tx, ty, speed = r["x"], r["y"], 0.0
                dx, dy = tx - r["x"], ty - r["y"]
                dist = math.hypot(dx, dy)
                commanded_speed = min(max(float(speed), 0.0), ROBOT_MAX_SPEED)
                target_heading = (
                    math.degrees(math.atan2(dy, dx)) if dist > 1e-6 else r["heading"]
                )
                heading_error = wrap_degrees(target_heading - r["heading"])
                angular_deg_s = max(-120.0, min(120.0, heading_error * 3.0))

                if args.articulation:
                    radius = float(robot_asset_config.get("wheelRadiusM", WHEEL_RADIUS_M))
                    separation = float(
                        robot_asset_config.get("wheelSeparationM", WHEEL_SEPARATION_M)
                    )
                    left_rad_s, right_rad_s = differential_wheel_speeds(
                        commanded_speed, angular_deg_s, radius, separation
                    )
                    for joint, wheel_speed in (
                        (r["left_joint"], left_rad_s),
                        (r["right_joint"], right_rad_s),
                    ):
                        if joint.IsValid():
                            joint.GetAttribute("physics:drive:angular:targetVelocity").Set(
                                math.degrees(wheel_speed)
                            )
                elif args.control_mode == "dynamic":
                    velocity = Gf.Vec3f(0.0, 0.0, 0.0)
                    if dist > 1e-6:
                        velocity = Gf.Vec3f(
                            dx / dist * commanded_speed,
                            dy / dist * commanded_speed,
                            0.0,
                        )
                    r["body"].CreateVelocityAttr().Set(velocity)
                    r["body"].CreateAngularVelocityAttr().Set(
                        Gf.Vec3f(0.0, 0.0, angular_deg_s)
                    )
                else:
                    if dist > 1e-6:
                        step = min(dist, commanded_speed * dt)
                        r["x"] += dx / dist * step
                        r["y"] += dy / dist * step
                        r["heading"] = target_heading
                    r["t_attr"].Set(Gf.Vec3d(r["x"], r["y"], 0.0))
                    r["rz_attr"].Set(float(r["heading"]))
                loc_nodes[r["name"]].set_value(
                    ua.DataValue(ua.Variant([r["x"], r["y"], r["heading"]], ua.VariantType.Double)))
            simulation_app.update()
            sim_time += dt
            if args.max_seconds > 0.0 and sim_time >= args.max_seconds:
                break
    finally:
        if args.save_runtime_layer:
            runtime_path = os.path.abspath(os.path.expanduser(args.save_runtime_layer))
            stage.GetSessionLayer().Export(runtime_path)
            print("[sim] exported runtime override layer: " + runtime_path)
        client.disconnect()
        simulation_app.close()


if __name__ == "__main__":
    main()
