"""Build Galaxy map tiles (overview + spatial grid) - sandbox Wave A.

Feel reference: demos/galaxy-dummy/build_map_tiles.py (1M load pattern).

Expects a laid-out graph JSON (nodes with x,y + edges), typically
pipeline/artifacts/galaxy/galaxy_graph.json from build_galaxy_positions.

Outputs under --out-dir/tiles/ (default: pipeline/artifacts/galaxy/tiles/):
  meta.json
  overview.json
  search_index.json
  neighbors.json          # capped pin neighbors (demo convenience)
  g/{tx}_{ty}.json

Usage:
  python -m pipeline.scripts.build_map_tiles
  python -m pipeline.scripts.build_map_tiles --from path/to/galaxy_graph.json --grid 16
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
import time
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
_PIPELINE = _SCRIPTS.parent
if str(_PIPELINE.parent) not in sys.path:
    sys.path.insert(0, str(_PIPELINE.parent))

DEFAULT_GRAPH = _PIPELINE / "artifacts" / "galaxy" / "galaxy_graph.json"
DEFAULT_TILES = _PIPELINE / "artifacts" / "galaxy" / "tiles"
PIN_CAP = 16


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build Galaxy map tiles")
    p.add_argument(
        "--from",
        dest="src",
        type=Path,
        default=DEFAULT_GRAPH,
        help="Laid-out graph JSON (nodes with x,y + edges)",
    )
    p.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_TILES,
        help=f"Tiles output directory (default: {DEFAULT_TILES})",
    )
    p.add_argument("--grid", type=int, default=16, help="Tiles per axis (grid×grid)")
    p.add_argument(
        "--overview",
        type=int,
        default=12000,
        help="Max packages in overview layer (far zoom)",
    )
    p.add_argument("--pin-cap", type=int, default=PIN_CAP)
    return p.parse_args()


def node_imp(n: dict) -> float:
    if n.get("importance_score") is not None:
        return float(n["importance_score"])
    return float(n.get("dependent_count") or 0)


def compact_node(n: dict) -> dict:
    if n.get("x") is None or n.get("y") is None:
        raise SystemExit(
            f"Node {n.get('id')!r} missing x/y - run build_galaxy_positions first"
        )
    imp = node_imp(n)
    return {
        "id": n["id"],
        "name": n.get("name") or n["id"],
        "x": n["x"],
        "y": n["y"],
        "dependent_count": int(n.get("dependent_count") or 0),
        "dependency_count": int(n.get("dependency_count") or 0),
        "importance_score": imp,
        "size": n.get("size")
        if n.get("size") is not None
        else round(1.4 + math.log1p(imp) * 0.55, 2),
        "is_seed": bool(n.get("is_seed")),
    }


def build(
    src: Path,
    out_dir: Path,
    *,
    grid: int,
    overview_cap: int,
    pin_cap: int,
) -> dict:
    t0 = time.time()
    if not src.is_file():
        raise SystemExit(
            f"Missing {src} - run build_galaxy_positions first "
            f"(or pass --from PATH)"
        )

    print(f"reading {src} …")
    payload = json.loads(src.read_text(encoding="utf-8"))
    nodes = [compact_node(n) for n in payload["nodes"]]
    edges = payload.get("edges") or []
    n = len(nodes)
    if n == 0:
        raise SystemExit("no nodes")

    xs = [p["x"] for p in nodes]
    ys = [p["y"] for p in nodes]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    pad_x = max((max_x - min_x) * 0.01, 1.0)
    pad_y = max((max_y - min_y) * 0.01, 1.0)
    min_x -= pad_x
    max_x += pad_x
    min_y -= pad_y
    max_y += pad_y
    span_x = max(max_x - min_x, 1e-6)
    span_y = max(max_y - min_y, 1e-6)
    grid = max(2, grid)

    def tile_xy(x: float, y: float) -> tuple[int, int]:
        tx = int((x - min_x) / span_x * grid)
        ty = int((y - min_y) / span_y * grid)
        return min(grid - 1, max(0, tx)), min(grid - 1, max(0, ty))

    buckets: dict[tuple[int, int], list] = {}
    search_index = []
    for node in nodes:
        tx, ty = tile_xy(node["x"], node["y"])
        buckets.setdefault((tx, ty), []).append(node)
        search_index.append(
            {
                "id": node["id"],
                "name": node["name"],
                "x": node["x"],
                "y": node["y"],
                "tx": tx,
                "ty": ty,
                "imp": node["importance_score"],
            }
        )

    ranked = sorted(nodes, key=lambda p: -p["importance_score"])
    overview = ranked[: min(overview_cap, n)]

    deg_depends: dict[str, list] = {p["id"]: [] for p in nodes}
    deg_used: dict[str, list] = {p["id"]: [] for p in nodes}
    imp_of = {p["id"]: p["importance_score"] for p in nodes}
    for e in edges:
        s, t = e["source"], e["target"]
        if s not in imp_of or t not in imp_of:
            continue
        is_core = e.get("is_core", True) is not False
        deg_depends[s].append((t, is_core))
        deg_used[t].append((s, is_core))

    neighbors = {}
    for pid in imp_of:
        deps = sorted(deg_depends[pid], key=lambda x: -imp_of.get(x[0], 0))[:pin_cap]
        used = sorted(deg_used[pid], key=lambda x: -imp_of.get(x[0], 0))[:pin_cap]
        if deps or used:
            neighbors[pid] = {
                "depends_on": [[a, c] for a, c in deps],
                "used_by": [[a, c] for a, c in used],
            }

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    (out_dir / "g").mkdir()

    for (tx, ty), bucket in buckets.items():
        path = out_dir / "g" / f"{tx}_{ty}.json"
        path.write_text(
            json.dumps({"tx": tx, "ty": ty, "nodes": bucket}, separators=(",", ":")),
            encoding="utf-8",
        )

    overview_path = out_dir / "overview.json"
    overview_path.write_text(
        json.dumps({"nodes": overview, "count": len(overview)}, separators=(",", ":")),
        encoding="utf-8",
    )

    search_path = out_dir / "search_index.json"
    search_path.write_text(
        json.dumps(search_index, separators=(",", ":")), encoding="utf-8"
    )

    neighbors_path = out_dir / "neighbors.json"
    neighbors_path.write_text(
        json.dumps(neighbors, separators=(",", ":")), encoding="utf-8"
    )

    # URLs relative to artifact root (pipeline/artifacts/galaxy/) for D-API/CDN
    meta = {
        "mode": "map-tiles",
        "source": str(src.name),
        "total_nodes": n,
        "overview_nodes": len(overview),
        "grid": grid,
        "bounds": {
            "min_x": min_x,
            "max_x": max_x,
            "min_y": min_y,
            "max_y": max_y,
        },
        "tile_count": len(buckets),
        "overview_url": "tiles/overview.json",
        "search_url": "tiles/search_index.json",
        "neighbors_url": "tiles/neighbors.json",
        "tile_url_pattern": "tiles/g/{tx}_{ty}.json",
        "positions_url": "galaxy_positions.json",
        "tile_zoom_ratio": 1.4,
        "fail_open": True,
        "notes": [
            "Overview = far map. Zoom/pan loads only visible tiles.",
            "Same pattern scales toward ~1M with more tiles / LOD levels.",
            "Wave A scaffold - Explorer live API remains source of truth for hubs.",
        ],
    }
    meta_path = out_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    def mb(p: Path) -> float:
        return p.stat().st_size / (1024 * 1024)

    print(
        f"tiles: grid={grid}x{grid} written={len(buckets)} "
        f"overview={len(overview)} total={n}"
    )
    print(
        f"sizes: overview={mb(overview_path):.3f}MB "
        f"search={mb(search_path):.3f}MB neighbors={mb(neighbors_path):.3f}MB "
        f"wall_s={time.time() - t0:.1f}"
    )
    print(f"meta: {meta_path}")
    return meta


def main() -> None:
    args = parse_args()
    build(
        args.src,
        args.out_dir,
        grid=args.grid,
        overview_cap=args.overview,
        pin_cap=args.pin_cap,
    )


if __name__ == "__main__":
    main()
