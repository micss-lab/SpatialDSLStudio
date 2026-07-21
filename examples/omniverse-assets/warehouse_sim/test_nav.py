"""Standalone unit tests for nav.py (run: python3 -m unittest, no Isaac Sim needed)."""

import math
import unittest

import nav


class AStarTests(unittest.TestCase):
    def test_routes_around_a_wall(self):
        # Vertical wall at x=5 spanning y in [1, 9], with a gap only at the top/bottom.
        grid = nav.OccupancyGrid(0, 0, 10, 10, 0.5, [(5, 5, 0.6, 4.0)], inflate=0.3)
        path = nav.astar(grid, (1, 5), (9, 5))
        self.assertIsNotNone(path)
        # Straight line would cross x=5 at y=5 (blocked), so the route must detour.
        self.assertGreater(len(path), 2)
        for (x, y) in path[:-1]:
            self.assertTrue(grid.is_free(*grid.world_to_cell(x, y)))
        # Path is longer than the straight-line distance because it goes around.
        length = sum(nav._dist(*path[i], *path[i + 1]) for i in range(len(path) - 1))
        self.assertGreater(length, nav._dist(1, 5, 9, 5))

    def test_returns_none_when_fully_walled_off(self):
        grid = nav.OccupancyGrid(0, 0, 10, 10, 0.5, [(5, 5, 0.6, 6.0)], inflate=0.3)
        self.assertIsNone(nav.astar(grid, (1, 5), (9, 5)))


class AvoidanceTests(unittest.TestCase):
    def _run(self, robots, controller, steps=800, dt=0.1):
        min_sep = 1e9
        for _ in range(steps):
            controller.step(dt)
            for i in range(len(robots)):
                for j in range(i + 1, len(robots)):
                    a, b = robots[i], robots[j]
                    sep = nav._dist(a.x, a.y, b.x, b.y) - (a.radius + b.radius)
                    min_sep = min(min_sep, sep)
            if all(r.arrived for r in robots):
                break
        return min_sep

    def test_two_robots_head_on_do_not_collide(self):
        grid = nav.OccupancyGrid(-2, -8, 22, 8, 0.5, [], 0.0)
        a = nav.Robot("A", 0, 0)
        b = nav.Robot("B", 20, 0)
        ctrl = nav.NavController(grid, [a, b])
        ctrl.set_goal(a, (20, 0))
        ctrl.set_goal(b, (0, 0))
        min_sep = self._run([a, b], ctrl)
        self.assertGreater(min_sep, 0.0)          # never overlap
        self.assertTrue(a.arrived and b.arrived)  # both still reach their goals

    def test_four_robots_crossing_do_not_collide(self):
        grid = nav.OccupancyGrid(-12, -12, 12, 12, 0.5, [], 0.0)
        robots = [
            nav.Robot("N", 0, 10), nav.Robot("S", 0, -10),
            nav.Robot("E", 10, 0), nav.Robot("W", -10, 0),
        ]
        ctrl = nav.NavController(grid, robots)
        ctrl.set_goal(robots[0], (0, -10))
        ctrl.set_goal(robots[1], (0, 10))
        ctrl.set_goal(robots[2], (-10, 0))
        ctrl.set_goal(robots[3], (10, 0))
        min_sep = self._run(robots, ctrl, steps=1200)
        self.assertGreater(min_sep, 0.0)
        self.assertTrue(all(r.arrived for r in robots))

    def test_robot_reaches_goal_around_obstacle(self):
        grid = nav.OccupancyGrid(-2, -6, 22, 6, 0.5, [(10, 0, 1.0, 3.0)], inflate=0.6)
        r = nav.Robot("R", 0, 0)
        ctrl = nav.NavController(grid, [r])
        ctrl.set_goal(r, (20, 0))
        for _ in range(800):
            if ctrl.step(0.1):
                break
            # never drive into the static obstacle
            self.assertTrue(grid.is_free(*grid.world_to_cell(r.x, r.y)))
        self.assertTrue(r.arrived)


if __name__ == "__main__":
    unittest.main()
