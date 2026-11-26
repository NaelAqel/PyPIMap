"""Hub-cluster Galaxy layout on a mild oval for post-ETL map tiles.
"""

from __future__ import annotations

import math
import random

OVAL_ASPECT = 1.35
LAYOUT_ROUNDS = 12
LAYOUT_FORCE_MAX_NODES = 2500
HUB_COUNT_CAP = 96


def _sunflower_slot(
    slot: int, c: float, jitter: float = 0.02
) -> tuple[float, float]:
    golden = math.pi * (3 - math.sqrt(5))
    radius = c * math.sqrt(slot + 1)
    theta = slot * golden + random.uniform(-jitter, jitter)
    return radius * math.cos(theta), radius * math.sin(theta)


def galaxy_layout(
    nodes: list[str],
    edges: list[tuple[str, str]],
    dependent_count: dict[str, int],
    rounds: int = LAYOUT_ROUNDS,
    force_max_nodes: int = LAYOUT_FORCE_MAX_NODES,
    oval_aspect: float = OVAL_ASPECT,
    hub_cap: int = HUB_COUNT_CAP,
) -> dict[str, tuple[float, float]]:
    """Hub-cluster layout on a mild oval (locality for pin arrows).

    1) Pick top Used-by hubs
    2) Multi-source BFS assigns each package to a hub (core edges, undirected)
    3) Place hubs on a sunflower, members in a small sunflower around their hub
    4) Optional weak within-cluster collision (skips full O(n²) at large N)
    5) Stretch X by oval_aspect, then center
    """
    random.seed(42)
    n = max(len(nodes), 1)
    name_set = set(nodes)

    adj: dict[str, list[str]] = {name: [] for name in nodes}
    for a, b in edges:
        if a in name_set and b in name_set and a != b:
            adj[a].append(b)
            adj[b].append(a)

    hub_n = max(8, min(hub_cap, int(math.sqrt(n) * 2.5) + 8))
    hubs = sorted(
        nodes,
        key=lambda name: (-dependent_count.get(name, 0), name),
    )[:hub_n]
    hub_set = set(hubs)

    cluster_of: dict[str, str] = {h: h for h in hubs}
    queue = list(hubs)
    qi = 0
    while qi < len(queue):
        cur = queue[qi]
        qi += 1
        owner = cluster_of[cur]
        for nb in adj[cur]:
            if nb in cluster_of:
                continue
            cluster_of[nb] = owner
            queue.append(nb)

    for name in nodes:
        if name not in cluster_of:
            cluster_of[name] = name
            hub_set.add(name)

    hubs = sorted(
        hub_set,
        key=lambda name: (-dependent_count.get(name, 0), name),
    )
    members: dict[str, list[str]] = {h: [] for h in hubs}
    for name in nodes:
        members[cluster_of[name]].append(name)

    hub_c = 90.0
    hub_pos: dict[str, tuple[float, float]] = {}
    for i, h in enumerate(hubs):
        slot = (i * 2654435761) % max(len(hubs), 1)
        hub_pos[h] = _sunflower_slot(slot, hub_c, jitter=0.01)

    pos: dict[str, tuple[float, float]] = {}
    for h in hubs:
        group = sorted(
            members[h],
            key=lambda name: (-dependent_count.get(name, 0), name),
        )
        hx, hy = hub_pos[h]
        if len(group) == 1:
            pos[group[0]] = (hx, hy)
            continue
        local_c = 14.0 + math.log1p(len(group)) * 3.5
        for j, name in enumerate(group):
            if name == h:
                pos[name] = (hx, hy)
                continue
            lx, ly = _sunflower_slot(j, local_c, jitter=0.03)
            pos[name] = (hx + lx, hy + ly)

    do_polish = rounds > 0 and n <= force_max_nodes * 4

    def coll_r(name: str) -> float:
        return 5.0 + math.log1p(dependent_count.get(name, 0)) * 2.2

    if do_polish:
        temperature = 8.0
        for _ in range(rounds):
            disp = {name: [0.0, 0.0] for name in nodes}
            for h in hubs:
                group = members[h]
                if len(group) < 2:
                    continue
                for i, v in enumerate(group):
                    xv, yv = pos[v]
                    rv = coll_r(v)
                    for u in group[i + 1 :]:
                        dx = xv - pos[u][0]
                        dy = yv - pos[u][1]
                        dist = math.hypot(dx, dy) + 1e-6
                        min_dist = rv + coll_r(u)
                        if dist >= min_dist:
                            continue
                        force = (min_dist - dist) * 1.2
                        fx, fy = force * dx / dist, force * dy / dist
                        disp[v][0] += fx
                        disp[v][1] += fy
                        disp[u][0] -= fx
                        disp[u][1] -= fy
            for v in nodes:
                dx, dy = disp[v]
                mag = math.hypot(dx, dy) + 1e-6
                step = min(temperature, mag) / mag
                pos[v] = (pos[v][0] + dx * step, pos[v][1] + dy * step)
            temperature *= 0.94

    aspect = max(oval_aspect, 0.5)
    xs = [p[0] for p in pos.values()]
    ys = [p[1] for p in pos.values()]
    cx, cy = sum(xs) / n, sum(ys) / n
    return {
        name: ((x - cx) * aspect, y - cy) for name, (x, y) in pos.items()
    }
