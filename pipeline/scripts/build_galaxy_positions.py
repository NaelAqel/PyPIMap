"""Build post-ETL Galaxy positions for map tiles.

Outputs (under pipeline/artifacts/galaxy/ by default):
  galaxy_positions.json       # id → {x,y,size,importance_score}
  galaxy_positions.meta.json
  galaxy_graph.json           # nodes with x,y (input for map tiles)

Call via run_galaxy_post_etl.py so package ETL stays fail-open.

Usage:
  python -m pipeline.scripts.build_galaxy_positions \\
    --from-galaxy-json path/to/galaxy.json

  # Tiny synthetic smoke (no external data):
  python -m pipeline.scripts.build_galaxy_positions --synthetic 200
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Allow `python scripts/build_galaxy_positions.py` from pipeline/
_SCRIPTS = Path(__file__).resolve().parent
_PIPELINE = _SCRIPTS.parent
if str(_PIPELINE.parent) not in sys.path:
    sys.path.insert(0, str(_PIPELINE.parent))

from pipeline.scripts.galaxy_layout import OVAL_ASPECT, galaxy_layout

DEFAULT_OUT_DIR = _PIPELINE / "artifacts" / "galaxy"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build Galaxy positions (post-ETL)")
    src = p.add_mutually_exclusive_group()
    src.add_argument(
        "--from-galaxy-json",
        type=Path,
        help="Galaxy JSON with nodes and edges",
    )
    src.add_argument(
        "--synthetic",
        type=int,
        metavar="N",
        help="Build N synthetic packages for smoke/scaffold (no DB)",
    )
    p.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help=f"Artifact directory (default: {DEFAULT_OUT_DIR})",
    )
    p.add_argument("--oval-aspect", type=float, default=OVAL_ASPECT)
    p.add_argument("--layout-rounds", type=int, default=12)
    return p.parse_args()


def _load_from_galaxy_json(src: Path) -> tuple[list[dict], list[dict]]:
    payload = json.loads(src.read_text(encoding="utf-8"))
    return list(payload.get("nodes") or []), list(payload.get("edges") or [])


def _synthetic(n: int) -> tuple[list[dict], list[dict]]:
    """Small hub-and-spoke graph for local smoke tests."""
    nodes = []
    edges = []
    hubs = max(4, int(math.sqrt(n)))
    for i in range(n):
        nid = f"pkg-{i:05d}"
        dep_count = max(0, hubs - (i % hubs)) if i < hubs else 1
        nodes.append(
            {
                "id": nid,
                "name": nid,
                "dependent_count": dep_count * 10 if i < hubs else dep_count,
                "dependency_count": 0 if i < hubs else 1,
                "importance_score": float(dep_count * 10 if i < hubs else dep_count),
            }
        )
        if i >= hubs:
            hub = f"pkg-{(i % hubs):05d}"
            edges.append({"source": nid, "target": hub, "is_core": True})
            nodes[i]["dependency_count"] = 1
    return nodes, edges


def build(
    nodes: list[dict],
    edges_raw: list[dict],
    *,
    out_dir: Path,
    oval_aspect: float,
    layout_rounds: int,
    source_label: str,
) -> dict:
    t0 = time.time()
    names = [n["id"] for n in nodes]
    dependent_count = {
        n["id"]: int(n.get("dependent_count") or n.get("importance_score") or 0)
        for n in nodes
    }
    edges = [(e["source"], e["target"]) for e in edges_raw]

    pos = galaxy_layout(
        names,
        edges,
        dependent_count,
        rounds=layout_rounds,
        oval_aspect=oval_aspect,
    )
    layout_s = time.time() - t0

    positions: dict[str, dict] = {}
    laid_nodes: list[dict] = []
    for n in nodes:
        nid = n["id"]
        imp = float(
            n.get("importance_score")
            if n.get("importance_score") is not None
            else dependent_count.get(nid, 0)
        )
        x, y = pos[nid]
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
                "name": n.get("name") or nid,
                "x": round(x, 3),
                "y": round(y, 3),
                "size": size,
                "dependent_count": int(n.get("dependent_count") or 0),
                "dependency_count": int(n.get("dependency_count") or 0),
                "importance_score": imp,
                "is_seed": bool(n.get("is_seed")),
            }
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    pos_path = out_dir / "galaxy_positions.json"
    graph_path = out_dir / "galaxy_graph.json"
    meta_path = out_dir / "galaxy_positions.meta.json"

    pos_path.write_text(json.dumps(positions, separators=(",", ":")), encoding="utf-8")
    graph_path.write_text(
        json.dumps(
            {"nodes": laid_nodes, "edges": edges_raw},
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {
        "generated_at": stamp,
        "source": source_label,
        "node_count": len(positions),
        "edge_count": len(edges_raw),
        "oval_aspect": oval_aspect,
        "layout": "hub-cluster mild oval",
        "layout_seconds": round(layout_s, 2),
        "bytes": pos_path.stat().st_size,
        "artifacts": {
            "positions": str(pos_path.name),
            "graph_for_tiles": str(graph_path.name),
            "meta": str(meta_path.name),
        },
        "fail_open": True,
        "notes": [
            "Post-ETL job; must not block package ETL (see run_galaxy_post_etl.py).",
            "Artifacts are served from pipeline/artifacts/galaxy/.",
        ],
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    dated = out_dir / f"galaxy_positions_{stamp[:10]}.json"
    dated.write_text(pos_path.read_text(encoding="utf-8"), encoding="utf-8")

    print(
        f"wrote {pos_path} ({pos_path.stat().st_size / 1024:.1f} KB) "
        f"nodes={len(positions)} layout_s={layout_s:.1f}"
    )
    print(f"wrote {graph_path}")
    print(f"wrote {meta_path}")
    return meta


def main() -> None:
    args = parse_args()
    if args.from_galaxy_json:
        src = args.from_galaxy_json
        if not src.is_file():
            raise SystemExit(f"Missing {src}")
        nodes, edges = _load_from_galaxy_json(src)
        source_label = str(src)
    elif args.synthetic is not None:
        if args.synthetic < 2:
            raise SystemExit("--synthetic needs N >= 2")
        nodes, edges = _synthetic(args.synthetic)
        source_label = f"synthetic:{args.synthetic}"
    else:
        raise SystemExit(
            "Provide --from-galaxy-json PATH or --synthetic N\n"
            "Example: python -m pipeline.scripts.build_galaxy_positions --synthetic 200"
        )

    build(
        nodes,
        edges,
        out_dir=args.out_dir,
        oval_aspect=args.oval_aspect,
        layout_rounds=args.layout_rounds,
        source_label=source_label,
    )


if __name__ == "__main__":
    main()
