"""Pure-Python warehouse navigation.

Two layers, both independent of Isaac Sim / USD so they can be unit-tested
standalone and reused by the generated simulation script:

- Global planning: A* over an inflated occupancy grid (routes around static
  obstacles such as racks and docks).
- Local planning: a dynamic-window / velocity-obstacle style planner that keeps
  robots clear of each other and of static geometry, with a right-hand bias so
  symmetric head-on encounters resolve instead of deadlocking.

All coordinates and sizes are in metres.
"""

import math
import heapq

NEIGHBORS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]


def _dist(ax, ay, bx, by):
    return math.hypot(ax - bx, ay - by)


class OccupancyGrid:
    """Uniform grid marking cells blocked by axis-aligned obstacle rectangles.

    obstacles: list of (center_x, center_y, half_x, half_y). `inflate` grows
    every obstacle by the robot radius so planned paths keep clearance.
    """

    def __init__(self, min_x, min_y, max_x, max_y, cell, obstacles, inflate=0.0):
        self.min_x = min_x
        self.min_y = min_y
        self.cell = cell
        self.nx = max(1, int(math.ceil((max_x - min_x) / cell)))
        self.ny = max(1, int(math.ceil((max_y - min_y) / cell)))
        self.blocked = [[False] * self.ny for _ in range(self.nx)]
        for (ox, oy, hx, hy) in obstacles:
            self._block_rect(ox, oy, hx + inflate, hy + inflate)

    def _block_rect(self, cx, cy, hx, hy):
        i0, j0 = self.world_to_cell(cx - hx, cy - hy)
        i1, j1 = self.world_to_cell(cx + hx, cy + hy)
        for i in range(max(0, i0), min(self.nx, i1 + 1)):
            for j in range(max(0, j0), min(self.ny, j1 + 1)):
                self.blocked[i][j] = True

    def world_to_cell(self, x, y):
        return int((x - self.min_x) / self.cell), int((y - self.min_y) / self.cell)

    def cell_to_world(self, i, j):
        return self.min_x + (i + 0.5) * self.cell, self.min_y + (j + 0.5) * self.cell

    def in_bounds(self, i, j):
        return 0 <= i < self.nx and 0 <= j < self.ny

    def is_free(self, i, j):
        return self.in_bounds(i, j) and not self.blocked[i][j]


def _nearest_free(grid, cell):
    i, j = cell
    i = min(max(i, 0), grid.nx - 1)
    j = min(max(j, 0), grid.ny - 1)
    if grid.is_free(i, j):
        return (i, j)
    for r in range(1, max(grid.nx, grid.ny) + 1):
        for di in range(-r, r + 1):
            for dj in range(-r, r + 1):
                if max(abs(di), abs(dj)) == r and grid.is_free(i + di, j + dj):
                    return (i + di, j + dj)
    return None


def astar(grid, start_xy, goal_xy):
    """8-connected A*. Returns a simplified list of (x, y) waypoints, or None."""
    start = _nearest_free(grid, grid.world_to_cell(*start_xy))
    goal = _nearest_free(grid, grid.world_to_cell(*goal_xy))
    if start is None or goal is None:
        return None

    open_heap = [(0.0, start)]
    came = {}
    g = {start: 0.0}
    while open_heap:
        _, cur = heapq.heappop(open_heap)
        if cur == goal:
            return _reconstruct(grid, came, cur, goal_xy)
        ci, cj = cur
        for di, dj in NEIGHBORS:
            ni, nj = ci + di, cj + dj
            if not grid.is_free(ni, nj):
                continue
            if di != 0 and dj != 0 and not (grid.is_free(ci + di, cj) and grid.is_free(ci, cj + dj)):
                continue  # do not cut through a blocked diagonal corner
            ng = g[cur] + math.hypot(di, dj)
            nxt = (ni, nj)
            if ng < g.get(nxt, float("inf")):
                g[nxt] = ng
                came[nxt] = cur
                h = math.hypot(ni - goal[0], nj - goal[1])
                heapq.heappush(open_heap, (ng + h, nxt))
    return None


def _reconstruct(grid, came, cur, goal_xy):
    cells = [cur]
    while cur in came:
        cur = came[cur]
        cells.append(cur)
    cells.reverse()
    pts = [grid.cell_to_world(i, j) for (i, j) in cells]
    pts.append((goal_xy[0], goal_xy[1]))
    return _simplify(grid, pts)


def _line_clear(grid, a, b):
    steps = int(_dist(a[0], a[1], b[0], b[1]) / (grid.cell * 0.5)) + 1
    for k in range(steps + 1):
        t = k / steps
        x = a[0] + (b[0] - a[0]) * t
        y = a[1] + (b[1] - a[1]) * t
        if not grid.is_free(*grid.world_to_cell(x, y)):
            return False
    return True


def _simplify(grid, pts):
    """Drop waypoints that are line-of-sight reachable, giving smoother paths."""
    if len(pts) <= 2:
        return pts
    out = [pts[0]]
    i = 0
    while i < len(pts) - 1:
        j = len(pts) - 1
        while j > i + 1 and not _line_clear(grid, pts[i], pts[j]):
            j -= 1
        out.append(pts[j])
        i = j
    return out


class Robot:
    def __init__(self, name, x, y, radius=0.6, max_speed=1.2):
        self.name = name
        self.x = x
        self.y = y
        self.radius = radius
        self.max_speed = max_speed
        self.vx = 0.0
        self.vy = 0.0
        self.heading = 0.0
        self.path = []
        self.wp = 0
        self.goal = None
        self.arrived = False


class NavController:
    """Advances a set of robots toward their goals while avoiding collisions."""

    def __init__(self, grid, robots, goal_tol=0.6, horizon=2.5):
        self.grid = grid
        self.robots = robots
        self.goal_tol = goal_tol
        self.horizon = horizon

    def set_goal(self, robot, goal_xy):
        robot.goal = goal_xy
        robot.path = astar(self.grid, (robot.x, robot.y), goal_xy) or [goal_xy]
        robot.wp = 0
        robot.arrived = False

    def _preferred(self, r):
        while r.wp < len(r.path) - 1 and _dist(r.x, r.y, *r.path[r.wp]) < max(r.radius, self.grid.cell):
            r.wp += 1
        tx, ty = r.path[min(r.wp, len(r.path) - 1)]
        dx, dy = tx - r.x, ty - r.y
        d = math.hypot(dx, dy)
        if d < 1e-6:
            return (0.0, 0.0)
        speed = min(r.max_speed, d / 0.3)  # ease in near the target
        return (dx / d * speed, dy / d * speed)

    def _min_clearance(self, r, vx, vy, others, dt):
        steps = max(1, int(self.horizon / dt))
        min_clear = 1e9
        for k in range(1, steps + 1):
            t = k * dt
            rx, ry = r.x + vx * t, r.y + vy * t
            if not self.grid.is_free(*self.grid.world_to_cell(rx, ry)):
                return -1.0
            for o in others:
                ox, oy = o.x + o.vx * t, o.y + o.vy * t
                clear = _dist(rx, ry, ox, oy) - (r.radius + o.radius)
                if clear < min_clear:
                    min_clear = clear
        return min_clear

    def _avoid(self, r, pref, dt):
        pvx, pvy = pref
        pspeed = math.hypot(pvx, pvy)
        if pspeed < 1e-6:
            return (0.0, 0.0)
        pref_ang = math.atan2(pvy, pvx)
        others = [o for o in self.robots if o is not r]
        best = None
        best_score = -1e18
        best_clear = -1e18
        safest = (0.0, 0.0)
        for dang in (0, -12, 12, -25, 25, -40, 40, -60, 60, -85, 85, -110, 110):
            for sfrac in (1.0, 0.7, 0.4):
                ang = pref_ang + math.radians(dang)
                spd = pspeed * sfrac
                vx, vy = math.cos(ang) * spd, math.sin(ang) * spd
                clear = self._min_clearance(r, vx, vy, others, dt)
                if clear > best_clear:
                    best_clear = clear
                    safest = (vx, vy)
                if clear < 0.05:
                    continue
                progress = vx * math.cos(pref_ang) + vy * math.sin(pref_ang)
                score = progress + 0.4 * min(clear, 1.0) - 0.01 * abs(dang)
                score += 0.25 if dang < 0 else 0.0  # right-hand rule breaks symmetry
                if score > best_score:
                    best_score = score
                    best = (vx, vy)
        return best if best is not None else safest

    def plan_velocities(self, dt):
        """Compute a collision-free velocity per robot from current state.

        Does not move the robots. The caller integrates (standalone use) or ships
        the velocities to a simulator that owns ground-truth pose (decoupled MAS).
        Sets each robot's `arrived` flag and caches the velocity on the robot so
        the next cycle's avoidance can predict neighbours.
        """
        prefs = {r.name: self._preferred(r) for r in self.robots}
        result = {}
        for r in self.robots:
            if r.goal is not None and _dist(r.x, r.y, *r.goal) < self.goal_tol:
                r.arrived = True
                result[r.name] = (0.0, 0.0)
            else:
                r.arrived = False
                result[r.name] = self._avoid(r, prefs[r.name], dt)
        for r in self.robots:
            r.vx, r.vy = result[r.name]
        return result

    def step(self, dt):
        """Plan and integrate in-process (standalone / testing use)."""
        velocities = self.plan_velocities(dt)
        for r in self.robots:
            r.vx, r.vy = velocities[r.name]
            r.x += r.vx * dt
            r.y += r.vy * dt
            if abs(r.vx) + abs(r.vy) > 1e-4:
                r.heading = math.degrees(math.atan2(r.vy, r.vx))
        return all(r.arrived or r.goal is None for r in self.robots)
