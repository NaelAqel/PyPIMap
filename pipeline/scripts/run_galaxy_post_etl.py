"""Post-ETL Galaxy positions + map tiles - FAIL-OPEN wrapper.

Contract
--------
- Package ETL (etl.py → fill_pg) MUST succeed even if this job fails.
- On failure: keep yesterday's artifacts if present; write status JSON; exit 0
  when fail_open=True (default).
- On success: refresh pipeline/artifacts/galaxy/.
- Production default: rebuild from live Postgres (full active catalog).

Never raise into the package ETL path when called with fail_open=True.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

_SCRIPTS = Path(__file__).resolve().parent
_PIPELINE = _SCRIPTS.parent
if str(_PIPELINE.parent) not in sys.path:
    sys.path.insert(0, str(_PIPELINE.parent))

from pipeline.scripts.build_galaxy_from_pg import run_from_pg
from pipeline.scripts.build_galaxy_positions import (
    _load_from_galaxy_json,
    _synthetic,
)
from pipeline.scripts.build_galaxy_positions import (
    build as build_positions,
)
from pipeline.scripts.build_map_tiles import build as build_tiles
from pipeline.scripts.galaxy_layout import OVAL_ASPECT

logger = logging.getLogger(__name__)

DEFAULT_OUT = _PIPELINE / "artifacts" / "galaxy"


def pg_kwargs_from_url(db_url: str) -> dict[str, str | int]:
    """Parse a postgresql:// URL into run_from_pg connection kwargs."""
    u = urlparse(db_url)
    if not u.hostname or not u.path or len(u.path) < 2:
        raise ValueError(f"invalid Postgres URL for Galaxy rebuild: {db_url!r}")
    return {
        "host": u.hostname,
        "port": int(u.port or 5432),
        "dbname": u.path.lstrip("/"),
        "user": unquote(u.username or "user_write"),
        "password": unquote(u.password or ""),
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fail-open Galaxy post-ETL job")
    src = p.add_mutually_exclusive_group()
    src.add_argument(
        "--from-postgres",
        action="store_true",
        help="Rebuild from live Postgres (default when --db-url is set)",
    )
    src.add_argument("--from-galaxy-json", type=Path)
    src.add_argument("--synthetic", type=int, default=None)
    p.add_argument(
        "--db-url",
        default="",
        help="postgresql:// URL (required for Postgres rebuild via CLI)",
    )
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    p.add_argument("--grid", type=int, default=32)
    p.add_argument("--overview", type=int, default=20000)
    p.add_argument("--oval-aspect", type=float, default=OVAL_ASPECT)
    p.add_argument(
        "--layout-rounds",
        type=int,
        default=0,
        help="0 for full catalog (collision polish is too heavy)",
    )
    p.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero on failure (default is fail-open / exit 0)",
    )
    return p.parse_args()


def main(
    *,
    fail_open: bool = True,
    db_url: str | None = None,
    host: str | None = None,
    port: int | None = None,
    dbname: str | None = None,
    user: str | None = None,
    password: str | None = None,
    from_galaxy_json: Path | None = None,
    synthetic: int | None = None,
    out_dir: Path = DEFAULT_OUT,
    grid: int = 32,
    overview: int = 20000,
    oval_aspect: float = OVAL_ASPECT,
    layout_rounds: int = 0,
) -> int:
    """Rebuild Galaxy artifacts. Returns 0 on success or fail-open failure."""
    status_path = out_dir / "galaxy_job_status.json"
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        if from_galaxy_json is not None:
            nodes, edges = _load_from_galaxy_json(from_galaxy_json)
            source_label = str(from_galaxy_json)
            pos_meta = build_positions(
                nodes,
                edges,
                out_dir=out_dir,
                oval_aspect=oval_aspect,
                layout_rounds=layout_rounds,
                source_label=source_label,
            )
            tile_meta = build_tiles(
                out_dir / "galaxy_graph.json",
                out_dir / "tiles",
                grid=grid,
                overview_cap=overview,
                pin_cap=16,
            )
            status = {
                "ok": True,
                "fail_open": fail_open,
                "finished_at": stamp,
                "source": source_label,
                "positions": pos_meta,
                "tiles": {
                    "total_nodes": tile_meta.get("total_nodes"),
                    "tile_count": tile_meta.get("tile_count"),
                    "overview_nodes": tile_meta.get("overview_nodes"),
                },
                "artifact_root": str(out_dir),
            }
        elif synthetic is not None:
            nodes, edges = _synthetic(synthetic)
            source_label = f"synthetic:{synthetic}"
            pos_meta = build_positions(
                nodes,
                edges,
                out_dir=out_dir,
                oval_aspect=oval_aspect,
                layout_rounds=layout_rounds,
                source_label=source_label,
            )
            tile_meta = build_tiles(
                out_dir / "galaxy_graph.json",
                out_dir / "tiles",
                grid=grid,
                overview_cap=overview,
                pin_cap=16,
            )
            status = {
                "ok": True,
                "fail_open": fail_open,
                "finished_at": stamp,
                "source": source_label,
                "positions": pos_meta,
                "tiles": {
                    "total_nodes": tile_meta.get("total_nodes"),
                    "tile_count": tile_meta.get("tile_count"),
                    "overview_nodes": tile_meta.get("overview_nodes"),
                },
                "artifact_root": str(out_dir),
            }
        else:
            if db_url:
                conn = pg_kwargs_from_url(db_url)
            elif host and dbname and user is not None:
                conn = {
                    "host": host,
                    "port": int(port or 5432),
                    "dbname": dbname,
                    "user": user,
                    "password": password or "",
                }
            else:
                raise ValueError(
                    "Postgres Galaxy rebuild needs db_url or host/dbname/user"
                )
            status = run_from_pg(
                host=str(conn["host"]),
                port=int(conn["port"]),
                dbname=str(conn["dbname"]),
                user=str(conn["user"]),
                password=str(conn["password"]),
                out_dir=out_dir,
                grid=grid,
                overview=overview,
                oval_aspect=oval_aspect,
                layout_rounds=layout_rounds,
                pin_cap=16,
            )
            status["fail_open"] = fail_open
            status["finished_at"] = stamp

        out_dir.mkdir(parents=True, exist_ok=True)
        status_path.write_text(json.dumps(status, indent=2), encoding="utf-8")
        logger.info("Galaxy post-ETL OK -> %s", out_dir)
        return 0
    except Exception as exc:  # noqa: BLE001 - fail-open must swallow any build error
        err = {
            "ok": False,
            "fail_open": fail_open,
            "finished_at": stamp,
            "error": str(exc),
            "traceback": traceback.format_exc(),
            "note": (
                "Package ETL must continue. Keep previous artifacts if present. "
                "Do not block fill_pg / etl.py."
            ),
            "artifact_root": str(out_dir),
        }
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
            status_path.write_text(json.dumps(err, indent=2), encoding="utf-8")
        except OSError:
            pass
        logger.warning("Galaxy post-ETL FAILED (fail-open=%s): %s", fail_open, exc)
        if fail_open:
            return 0
        return 1


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - [%(levelname)s] - %(message)s",
    )
    args = parse_args()
    code = main(
        fail_open=not args.strict,
        db_url=args.db_url or None,
        from_galaxy_json=args.from_galaxy_json,
        synthetic=args.synthetic,
        out_dir=args.out_dir,
        grid=args.grid,
        overview=args.overview,
        oval_aspect=args.oval_aspect,
        layout_rounds=args.layout_rounds,
    )
    raise SystemExit(code)
