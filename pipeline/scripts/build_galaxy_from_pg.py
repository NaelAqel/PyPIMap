"""Build full-catalog Galaxy positions + tiles from an existing Postgres DB.

NO ETL. Reads current `pypi.metadata` + `pypi.package_connections` only.

Usage:
  PYTHONPATH=. python -m pipeline.scripts.build_galaxy_from_pg \\
    --host postgres_db --port 5432 --dbname pg_db --user user_write --password '...'
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
_PIPELINE = _SCRIPTS.parent
if str(_PIPELINE.parent) not in sys.path:
    sys.path.insert(0, str(_PIPELINE.parent))

from pipeline.scripts import build_map_tiles as tiles
from pipeline.scripts.galaxy_layout import OVAL_ASPECT, galaxy_layout

DEFAULT_OUT = _PIPELINE / "artifacts" / "galaxy"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Galaxy artifacts from live Postgres (no ETL)")
    p.add_argument("--host", default="postgres_db")
    p.add_argument("--port", type=int, default=5432)
    p.add_argument("--dbname", default="pg_db")
    p.add_argument("--user", default="user_write")
    p.add_argument("--password", default="")
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    p.add_argument("--grid", type=int, default=32, help="Tile grid (NxN). 32 suits ~1M.")
    p.add_argument("--overview", type=int, default=20000)
    p.add_argument("--oval-aspect", type=float, default=OVAL_ASPECT)
    p.add_argument(
        "--layout-rounds",
        type=int,
        default=0,
        help="Collision polish rounds (0 at full catalog - too large for polish)",
    )
    p.add_argument("--pin-cap", type=int, default=16)
    return p.parse_args()


def _connect(
    *,
    host: str,
    port: int,
    dbname: str,
    user: str,
    password: str,
):
    try:
        import psycopg
    except ImportError:
        import psycopg2 as psycopg  # type: ignore

    return psycopg.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password or None,
    )


def load_from_pg(conn) -> tuple[list[dict], list[dict], dict]:
    """Active packages + core Depends-on edges (A depends on B → source=A, target=B)."""
    t0 = time.time()
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              m.id,
              m.normalized_name,
              m.package_name,
              coalesce(pc.used_by_core_counts, 0) as used_by_core,
              coalesce(pc.depends_on_core_counts, 0) as depends_on_core,
              coalesce(
                m.importance_score,
                coalesce(pc.used_by_core_counts, 0)
                  + 0.3 * coalesce(pc.used_by_optional_counts, 0)
              ) as importance_score,
              coalesce(pc.depends_on_core_ids, '{}') as dep_ids
            from pypi.metadata m
            left join pypi.package_connections pc on pc.id = m.id
            where m.is_active_package
            order by m.id
            """
        )
        rows = cur.fetchall()

    id_to_name: dict[int, str] = {}
    nodes: list[dict] = []
    edges: list[dict] = []
    for row in rows:
        pid, norm, pname, used_by, depends_on, imp, dep_ids = row
        nid = str(norm)
        id_to_name[int(pid)] = nid
        nodes.append(
            {
                "id": nid,
                "name": pname or nid,
                "dependent_count": int(used_by or 0),
                "dependency_count": int(depends_on or 0),
                "importance_score": float(imp or 0),
            }
        )

    name_set = {n["id"] for n in nodes}
    for row in rows:
        pid, norm, _pname, _u, _d, _imp, dep_ids = row
        src = str(norm)
        if not dep_ids:
            continue
        for tid in dep_ids:
            tgt = id_to_name.get(int(tid))
            if tgt and tgt in name_set and tgt != src:
                edges.append({"source": src, "target": tgt, "is_core": True})

    stats = {
        "active_packages": len(nodes),
        "core_edges": len(edges),
        "load_seconds": round(time.time() - t0, 2),
    }
    print(
        f"loaded from PG: packages={stats['active_packages']} "
        f"core_edges={stats['core_edges']} in {stats['load_seconds']}s"
    )
    return nodes, edges, stats


def run_from_pg(
    *,
    host: str,
    port: int,
    dbname: str,
    user: str,
    password: str,
    out_dir: Path,
    grid: int = 32,
    overview: int = 20000,
    oval_aspect: float = OVAL_ASPECT,
    layout_rounds: int = 0,
    pin_cap: int = 16,
) -> dict:
    """Load active catalog from Postgres, layout, write tiles. Returns status dict."""
    print(f"connecting {user}@{host}:{port}/{dbname} …")
    conn = _connect(
        host=host, port=port, dbname=dbname, user=user, password=password
    )
    try:
        nodes, edges, stats = load_from_pg(conn)
    finally:
        conn.close()

    if len(nodes) < 1000:
        raise RuntimeError(
            f"refusing tiny catalog ({len(nodes)} nodes) - check DB filter"
        )

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    graph_path = out_dir / "galaxy_graph.json"

    print(f"layout (hub-cluster, polish rounds={layout_rounds}) ...")
    t1 = time.time()
    dependent_count = {n["id"]: int(n["dependent_count"]) for n in nodes}
    edge_pairs = [(e["source"], e["target"]) for e in edges]
    pos = galaxy_layout(
        [n["id"] for n in nodes],
        edge_pairs,
        dependent_count,
        rounds=layout_rounds,
        oval_aspect=oval_aspect,
    )
    layout_s = time.time() - t1
    print(f"layout done in {layout_s:.1f}s")

    laid_nodes = []
    positions = {}
    for n in nodes:
        nid = n["id"]
        x, y = pos[nid]
        imp = float(n["importance_score"])
        size = round(1.4 + math.log1p(imp) * 0.55, 2)
        positions[nid] = {
            "x": round(x, 3),
            "y": round(y, 3),
            "size": size,
            "importance_score": imp,
        }
        laid_nodes.append(
            {
                "id": nid,
                "name": n["name"],
                "x": round(x, 3),
                "y": round(y, 3),
                "size": size,
                "dependent_count": n["dependent_count"],
                "dependency_count": n["dependency_count"],
                "importance_score": imp,
                "is_seed": False,
            }
        )

    edge_count = len(edges)
    # Edges are only needed for layout. Pin edges at runtime use the live API.
    # Do not persist them - reloading a 300MB+ edges blob OOMs tile build.
    del edges

    print(f"writing {graph_path} (nodes only) ...", flush=True)
    t2 = time.time()
    graph_path.write_text(
        json.dumps({"nodes": laid_nodes}, separators=(",", ":")),
        encoding="utf-8",
    )
    (out_dir / "galaxy_positions.json").write_text(
        json.dumps(positions, separators=(",", ":")), encoding="utf-8"
    )
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pos_meta = {
        "generated_at": stamp,
        "source": f"postgres:{host}/{dbname}",
        "node_count": len(laid_nodes),
        "edge_count": edge_count,
        "oval_aspect": oval_aspect,
        "layout": "hub-cluster mild oval from live PG (no ETL)",
        "layout_seconds": round(layout_s, 2),
        "pg_stats": stats,
        "fail_open": True,
    }
    (out_dir / "galaxy_positions.meta.json").write_text(
        json.dumps(pos_meta, indent=2), encoding="utf-8"
    )
    print(
        f"wrote graph {graph_path.stat().st_size / 1e6:.1f} MB in {time.time() - t2:.1f}s",
        flush=True,
    )

    print("building map tiles ...", flush=True)
    # Pass nodes in-memory - do not re-parse the graph file.
    meta = tiles.build(
        graph_path,
        out_dir / "tiles",
        grid=grid,
        overview_cap=overview,
        pin_cap=pin_cap,
        nodes=laid_nodes,
    )
    # Normalize URLs for the /galaxy mount
    meta["overview_url"] = "tiles/overview.json"
    meta["search_url"] = "tiles/search_index.json"
    meta["neighbors_url"] = "tiles/neighbors.json"
    meta["tile_url_pattern"] = "tiles/g/{tx}_{ty}.json"
    meta["source"] = f"postgres active catalog ({stats['active_packages']} pkgs)"
    meta["fail_open"] = True
    (out_dir / "tiles" / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    status = {
        "ok": True,
        "finished_at": stamp,
        "total_nodes": meta["total_nodes"],
        "overview_nodes": meta["overview_nodes"],
        "tile_count": meta["tile_count"],
        "core_edges": stats["core_edges"],
        "layout_seconds": round(layout_s, 2),
        "source": f"postgres:{host}/{dbname}",
        "artifact_root": str(out_dir),
    }
    (out_dir / "galaxy_job_status.json").write_text(
        json.dumps(status, indent=2) + "\n", encoding="utf-8"
    )
    print("DONE", json.dumps(status))
    return status


def main() -> int:
    args = parse_args()
    run_from_pg(
        host=args.host,
        port=args.port,
        dbname=args.dbname,
        user=args.user,
        password=args.password,
        out_dir=args.out_dir,
        grid=args.grid,
        overview=args.overview,
        oval_aspect=args.oval_aspect,
        layout_rounds=args.layout_rounds,
        pin_cap=args.pin_cap,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
