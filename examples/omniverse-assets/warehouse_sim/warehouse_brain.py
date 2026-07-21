"""Warehouse brain: an external multi-agent controller for the robots.

This is the Isaac Sim counterpart of the Visual Components WarehouseMAS. It runs
as a separate process from the simulator and talks to it over OPC UA, mirroring
the WarehouseMAS node layout:

  ns=<idx>;s=Robot{n}/Location      Double[3] [x, y, headingDeg]  (simulator writes)
  ns=<idx>;s=Robot{n}/Target        Double[3] [x, y, speed]       (brain writes)
  ns=<idx>;s=Robot{n}/State         String     to_pickup/to_dropoff/to_charge/charging
  ns=<idx>;s=Robot{n}/HasProduct    Boolean    carrying a product (brain writes)
  ns=<idx>;s=Robot{n}/BatteryLevel  Double     percent 0..capacity (brain writes)

The brain hosts the OPC UA server (as WarehouseMAS does); the simulator is the
client. Global planning and collision avoidance live in nav.py; this module adds
task coordination, battery management (drain while moving, recharge at charging
stations), and the transport.

Run:
  python3 warehouse_brain.py --layout warehouse_layout.json
Requires: asyncua  (pip install asyncua) for the OPC UA server only. The MAS
logic (WarehouseMAS) has no OPC UA dependency and is unit-tested standalone.
"""

import argparse
import math
import os
import time

import nav
from layout import load_layout, scene_bounds

DRAIN_PER_M = 0.06          # battery percent consumed per metre travelled
DEFAULT_CAPACITY = 100.0
DEFAULT_LOW = 20.0
DEFAULT_CHARGE_RATE = 10.0  # percent per second while charging
RESUME_FRACTION = 0.95      # leave the charger once battery reaches this fraction


class WarehouseMAS:
    """Task- and battery-coordinating controller. No transport concerns.

    update(reported) takes the simulator's ground-truth poses and returns, per
    robot, the next target plus status (state, HasProduct, BatteryLevel). Robots
    ferry between pickups and drop-offs, and divert to a charging station when
    the battery falls below the robot's low-battery threshold.
    """

    def __init__(self, layout, *, bounds=None, cell=0.5, radius=0.7, max_speed=1.4,
                 control_dt=0.1, lookahead=0.7, goal_tol=1.0, drain_per_m=DRAIN_PER_M):
        if bounds is None:
            bounds = scene_bounds(layout)
        obstacles = [(o["x"], o["y"], o["length"] / 2.0, o["width"] / 2.0) for o in layout["obstacles"]]
        self.grid = nav.OccupancyGrid(bounds[0], bounds[1], bounds[2], bounds[3], cell, obstacles, inflate=radius)
        self.robots = [nav.Robot(r["name"], r["x"], r["y"], radius=radius, max_speed=max_speed)
                       for r in layout["robots"]]
        self.controller = nav.NavController(self.grid, self.robots, goal_tol=goal_tol)
        self.pickups = [(p["x"], p["y"]) for p in layout["pickups"]] or [(bounds[0] + 1, bounds[1] + 1)]
        self.dropoffs = [(d["x"], d["y"]) for d in layout["dropoffs"]] or [(bounds[2] - 1, bounds[3] - 1)]
        self.chargers = [(c["x"], c["y"]) for c in layout.get("chargers", [])]
        self.control_dt = control_dt
        self.lookahead = lookahead
        self.drain_per_m = drain_per_m

        self.state = {}
        self.batt = {}
        self.cap = {}
        self.low = {}
        self.crate = {}
        self.prev = {}
        for index, (robot, spec) in enumerate(zip(self.robots, layout["robots"])):
            self.state[robot.name] = {"phase": "to_pickup", "pickup": index % len(self.pickups)}
            self.cap[robot.name] = float(spec.get("batteryLevel", DEFAULT_CAPACITY) or DEFAULT_CAPACITY)
            self.batt[robot.name] = self.cap[robot.name]
            self.low[robot.name] = float(spec.get("lowBattery", DEFAULT_LOW) or DEFAULT_LOW)
            self.crate[robot.name] = float(spec.get("chargeRate", DEFAULT_CHARGE_RATE) or DEFAULT_CHARGE_RATE)
            self.prev[robot.name] = (robot.x, robot.y)
            self.controller.set_goal(robot, self.pickups[index % len(self.pickups)])

    def opc_names(self):
        """Robot{n} identifiers, matching the WarehouseMAS 1-indexed scheme."""
        return {r.name: "Robot%d" % (i + 1) for i, r in enumerate(self.robots)}

    def _nearest_charger(self, robot):
        return min(self.chargers, key=lambda c: math.hypot(robot.x - c[0], robot.y - c[1]))

    def _advance(self, robot):
        st = self.state[robot.name]
        if st["phase"] == "to_charge":
            st["phase"] = "charging"  # stay put; recharge handled in update()
        elif st["phase"] == "to_pickup":
            st["phase"] = "to_dropoff"
            self.controller.set_goal(robot, self.dropoffs[st["pickup"] % len(self.dropoffs)])
        elif st["phase"] == "to_dropoff":
            st["phase"] = "to_pickup"
            st["pickup"] = (st["pickup"] + 1) % len(self.pickups)
            self.controller.set_goal(robot, self.pickups[st["pickup"]])

    def update(self, reported):
        """reported: {name: (x, y, headingDeg)}. Returns {name: {target,state,has_product,battery}}."""
        for robot in self.robots:
            moved = 0.0
            if robot.name in reported:
                nx, ny, nh = reported[robot.name]
                moved = math.hypot(nx - self.prev[robot.name][0], ny - self.prev[robot.name][1])
                robot.x, robot.y, robot.heading = nx, ny, nh
            self.prev[robot.name] = (robot.x, robot.y)
            if self.state[robot.name]["phase"] != "charging":
                self.batt[robot.name] = max(0.0, self.batt[robot.name] - moved * self.drain_per_m)

        for robot in self.robots:
            st = self.state[robot.name]
            if st["phase"] == "charging":
                self.batt[robot.name] = min(self.cap[robot.name],
                                            self.batt[robot.name] + self.crate[robot.name] * self.control_dt)
                if self.batt[robot.name] >= self.cap[robot.name] * RESUME_FRACTION:
                    st["phase"] = "to_pickup"
                    self.controller.set_goal(robot, self.pickups[st["pickup"]])
            elif st["phase"] != "to_charge" and self.chargers and self.batt[robot.name] <= self.low[robot.name]:
                st["phase"] = "to_charge"
                self.controller.set_goal(robot, self._nearest_charger(robot))

        velocities = self.controller.plan_velocities(self.control_dt)
        result = {}
        for robot in self.robots:
            st = self.state[robot.name]
            vx, vy = (0.0, 0.0) if st["phase"] == "charging" else velocities[robot.name]
            speed = math.hypot(vx, vy)
            target = (robot.x + vx * self.lookahead, robot.y + vy * self.lookahead, speed)
            result[robot.name] = {
                "target": target,
                "state": st["phase"],
                "has_product": st["phase"] == "to_dropoff",
                "battery": self.batt[robot.name],
            }
            if robot.arrived and st["phase"] in ("to_pickup", "to_dropoff", "to_charge"):
                self._advance(robot)
        return result


def serve(mas, endpoint, hz):
    """Host the OPC UA server and run the control loop. Requires asyncua."""
    from asyncua.sync import Server
    from asyncua import ua

    server = Server()
    server.set_endpoint(endpoint)
    server.set_server_name("WarehouseMAS")
    idx = server.register_namespace("urn:warehouse:mas")
    objects = server.nodes.objects

    opc = mas.opc_names()
    loc, tgt, state, product, battery = {}, {}, {}, {}, {}
    for robot in mas.robots:
        rid = opc[robot.name]
        loc[robot.name] = objects.add_variable(
            ua.NodeId("%s/Location" % rid, idx), "%s/Location" % rid,
            [robot.x, robot.y, robot.heading], ua.VariantType.Double)
        loc[robot.name].set_writable()  # the simulator writes Location
        tgt[robot.name] = objects.add_variable(
            ua.NodeId("%s/Target" % rid, idx), "%s/Target" % rid,
            [robot.x, robot.y, 0.0], ua.VariantType.Double)
        tgt[robot.name].set_writable()
        state[robot.name] = objects.add_variable(
            ua.NodeId("%s/State" % rid, idx), "%s/State" % rid, "idle")
        product[robot.name] = objects.add_variable(
            ua.NodeId("%s/HasProduct" % rid, idx), "%s/HasProduct" % rid, False)
        battery[robot.name] = objects.add_variable(
            ua.NodeId("%s/BatteryLevel" % rid, idx), "%s/BatteryLevel" % rid,
            mas.cap[robot.name], ua.VariantType.Double)

    server.start()
    print("[brain] WarehouseMAS OPC UA server on %s (ns=%d, urn:warehouse:mas)" % (endpoint, idx))
    period = 1.0 / hz
    try:
        while True:
            reported = {}
            for robot in mas.robots:
                value = loc[robot.name].get_value()
                if value and len(value) >= 3:
                    reported[robot.name] = (float(value[0]), float(value[1]), float(value[2]))
            outputs = mas.update(reported)
            for robot in mas.robots:
                out = outputs[robot.name]
                tx, ty, speed = out["target"]
                tgt[robot.name].set_value([tx, ty, speed], ua.VariantType.Double)
                state[robot.name].set_value(out["state"])
                product[robot.name].set_value(bool(out["has_product"]))
                battery[robot.name].set_value(float(out["battery"]), ua.VariantType.Double)
            time.sleep(period)
    except KeyboardInterrupt:
        pass
    finally:
        server.stop()
        print("[brain] server stopped")


def parse_args():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Warehouse MAS brain (OPC UA server).")
    parser.add_argument("--layout", default=os.path.join(here, "warehouse_layout.json"))
    parser.add_argument("--endpoint", default="opc.tcp://0.0.0.0:4840/warehouse/mas")
    parser.add_argument("--hz", type=float, default=10.0)
    return parser.parse_args()


def main():
    args = parse_args()
    layout = load_layout(args.layout)
    mas = WarehouseMAS(layout)
    print("[brain] %d robots, %d obstacles, %d pickups, %d dropoffs, %d chargers"
          % (len(mas.robots), len(layout["obstacles"]), len(mas.pickups), len(mas.dropoffs), len(mas.chargers)))
    serve(mas, args.endpoint, args.hz)


if __name__ == "__main__":
    main()
