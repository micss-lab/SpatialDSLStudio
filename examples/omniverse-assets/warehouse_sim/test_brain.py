"""Tests for the WarehouseMAS control logic and the decoupled brain/bridge loop.

No OPC UA needed: we call WarehouseMAS.update() (the brain) and integrate the
returned targets ourselves (playing the role of the Isaac Sim bridge), then feed
the new poses back. This exercises the exact state-out / command-in contract the
OPC UA transport carries, minus the wire.
"""

import math
import unittest

from warehouse_brain import WarehouseMAS


def make_layout(battery=None, chargers=True):
    robots = [
        {"name": "Robot A", "x": -18.0, "y": -8.0},
        {"name": "Robot B", "x": 12.0, "y": -8.0},
    ]
    if battery is not None:
        for r in robots:
            r.update(battery)
    layout = {
        "robots": robots,
        "obstacles": [{"name": "Rack", "x": 0.0, "y": 0.0, "length": 3.0, "width": 6.0, "height": 2.5}],
        "pickups": [
            {"name": "Conv A", "x": -18.0, "y": -9.0, "length": 6.0, "width": 2.0, "height": 3.0},
            {"name": "Conv B", "x": 12.0, "y": -8.0, "length": 6.0, "width": 2.0, "height": 3.0},
        ],
        "dropoffs": [{"name": "Output", "x": 0.0, "y": 8.0, "length": 3.0, "width": 3.0, "height": 0.5}],
        "chargers": [],
    }
    if chargers:
        layout["chargers"] = [{"name": "Charger", "x": -18.0, "y": -6.0, "length": 2.0, "width": 2.0, "height": 2.0}]
    return layout


def bridge_step(mas, poses, outputs, dt):
    """Move each robot toward the brain's target at the commanded speed."""
    max_step = mas.robots[0].max_speed * dt
    new_poses = {}
    for r in mas.robots:
        tx, ty, speed = outputs[r.name]["target"]
        x, y, heading = poses[r.name]
        dx, dy = tx - x, ty - y
        d = math.hypot(dx, dy)
        if d > 1e-6 and speed > 1e-6:
            move = min(d, min(speed, r.max_speed) * dt, max_step)
            x += dx / d * move
            y += dy / d * move
            heading = math.degrees(math.atan2(dy, dx))
        new_poses[r.name] = (x, y, heading)
    return new_poses


class MASControlTests(unittest.TestCase):
    def test_robots_ferry_and_avoid(self):
        mas = WarehouseMAS(make_layout(chargers=False), control_dt=0.1)
        poses = {r.name: (r.x, r.y, r.heading) for r in mas.robots}
        prev_phase = {r.name: mas.state[r.name]["phase"] for r in mas.robots}
        min_sep, handoffs = 1e9, 0
        for _ in range(1500):
            outputs = mas.update(poses)
            for r in mas.robots:
                if outputs[r.name]["state"] != prev_phase[r.name]:
                    handoffs += 1
                    prev_phase[r.name] = outputs[r.name]["state"]
            poses = bridge_step(mas, poses, outputs, 0.1)
            names = list(poses)
            for i in range(len(names)):
                for j in range(i + 1, len(names)):
                    a, b = poses[names[i]], poses[names[j]]
                    min_sep = min(min_sep, math.hypot(a[0] - b[0], a[1] - b[1]))
                    self.assertTrue(mas.grid.is_free(*mas.grid.world_to_cell(a[0], a[1])))
        self.assertGreater(min_sep, 2 * mas.robots[0].radius * 0.6)
        self.assertGreaterEqual(handoffs, 2)

    def test_has_product_tracks_phase(self):
        mas = WarehouseMAS(make_layout(chargers=False), control_dt=0.1)
        poses = {r.name: (r.x, r.y, r.heading) for r in mas.robots}
        # Initially heading to a pickup: not carrying anything.
        first = mas.update(poses)
        self.assertFalse(any(o["has_product"] for o in first.values()))
        carried = False
        for _ in range(1500):
            outputs = mas.update(poses)
            if any(o["has_product"] and o["state"] == "to_dropoff" for o in outputs.values()):
                carried = True
                break
            poses = bridge_step(mas, poses, outputs, 0.1)
        self.assertTrue(carried, "a robot should pick up a product and carry it to drop-off")

    def test_battery_drains_then_recharges_at_a_station(self):
        layout = make_layout(battery={"batteryLevel": 30.0, "lowBattery": 20.0, "chargeRate": 10.0}, chargers=True)
        mas = WarehouseMAS(layout, control_dt=0.1, drain_per_m=1.2)
        poses = {r.name: (r.x, r.y, r.heading) for r in mas.robots}
        target_robot = mas.robots[0].name
        saw_charging = False
        battery_min = 1e9
        battery_after_min = 0.0
        for _ in range(1500):
            outputs = mas.update(poses)
            b = outputs[target_robot]["battery"]
            if outputs[target_robot]["state"] == "charging":
                saw_charging = True
            if b < battery_min:
                battery_min = b
            elif saw_charging:
                battery_after_min = max(battery_after_min, b)
            poses = bridge_step(mas, poses, outputs, 0.1)
        self.assertTrue(saw_charging, "low battery should send a robot to a charging station")
        self.assertLessEqual(battery_min, 20.0)                 # it did run low
        self.assertGreater(battery_after_min, battery_min + 5)  # and recovered while charging

    def test_opc_names_are_one_indexed(self):
        mas = WarehouseMAS(make_layout())
        self.assertEqual(set(mas.opc_names().values()), {"Robot1", "Robot2"})

    def test_update_reports_full_status(self):
        mas = WarehouseMAS(make_layout())
        poses = {r.name: (r.x, r.y, r.heading) for r in mas.robots}
        outputs = mas.update(poses)
        self.assertEqual(set(outputs), {r.name for r in mas.robots})
        for out in outputs.values():
            self.assertEqual(len(out["target"]), 3)
            self.assertIn(out["state"], ("to_pickup", "to_dropoff", "to_charge", "charging"))
            self.assertIsInstance(out["has_product"], bool)
            self.assertGreaterEqual(out["battery"], 0.0)


if __name__ == "__main__":
    unittest.main()
