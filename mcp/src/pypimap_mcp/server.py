"""PyPIMap MCP — stdio or streamable-HTTP over the public API."""

from __future__ import annotations

import argparse
import json
import os
from typing import Any

import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse

from pypimap_mcp.client import dataset_blurb, get_json
from pypimap_mcp.http_guard import AccessGuardMiddleware, configure_logging, log_tool

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_RATE_PER_MIN = 60
DEFAULT_RATE_PER_DAY = 2000
MCP_PATH = "/mcp"

INSTRUCTIONS = (
    "Read-only PyPIMap tools for the Python package dependency ecosystem. "
    "Glossary: Depends on / Used by, optional, active_version. "
    "Interactive lookup only; respect rate limits. " + dataset_blurb()
)

mcp = FastMCP(
    "pypimap",
    instructions=INSTRUCTIONS,
    host=DEFAULT_HOST,
    port=DEFAULT_PORT,
    streamable_http_path=MCP_PATH,
    # Stateless keeps local multi-client smoke tests simple.
    stateless_http=True,
)


def _dump(data: Any) -> str:
    return json.dumps(data, default=str)


@mcp.custom_route("/health", methods=["GET"])
async def health(_: Request) -> JSONResponse:
    return JSONResponse({"ok": True, "service": "pypimap-mcp", "mcp_path": MCP_PATH})


@mcp.custom_route("/", methods=["GET"])
async def root(_: Request) -> PlainTextResponse:
    return PlainTextResponse(
        "PyPIMap MCP (read-only)\n"
        f"Connect (streamable HTTP): http://<host>:<port>{MCP_PATH}\n"
        "Health: /health\n"
        "Tools: search_packages, package_info, package_depends_on, "
        "package_used_by, last_update\n"
        "Interactive lookup only — bulk data: Kaggle DOI 10.34740/kaggle/ds/10945692\n"
    )


@mcp.tool()
@log_tool("search_packages")
def search_packages(q: str, limit: int = 10) -> str:
    """Search active packages by substring of package name or author (GET /search)."""
    limit = max(1, min(limit, 50))
    return _dump(get_json("/search", {"q": q, "limit": limit}))


@mcp.tool()
@log_tool("package_info")
def package_info(name: str) -> str:
    """Package metadata and metrics (GET /package/api/{name}).

    Fields include active_version, depends_on_* / used_by_* counts (core and optional),
    importance_score, author, home_page, release and upload dates.
    """
    return _dump(get_json(f"/package/api/{name}"))


@mcp.tool()
@log_tool("package_depends_on")
def package_depends_on(
    name: str,
    depth: int = 1,
    node_cap: int = 35,
    show_optional: bool = True,
) -> str:
    """Depends on - packages this one needs (GET /graph/{name}/depends-on).

    depth 1-4; node_cap 10-500; show_optional includes optional edges when true.
    """
    depth = max(1, min(depth, 4))
    node_cap = max(10, min(node_cap, 500))
    return _dump(
        get_json(
            f"/graph/{name}/depends-on",
            {
                "depth": depth,
                "node_cap": node_cap,
                "show_optional": str(show_optional).lower(),
            },
        )
    )


@mcp.tool()
@log_tool("package_used_by")
def package_used_by(
    name: str,
    depth: int = 1,
    node_cap: int = 35,
    show_optional: bool = True,
) -> str:
    """Used by - packages that need this one (GET /graph/{name}/used-by).

    depth 1-4; node_cap 10-500; show_optional includes optional edges when true.
    """
    depth = max(1, min(depth, 4))
    node_cap = max(10, min(node_cap, 500))
    return _dump(
        get_json(
            f"/graph/{name}/used-by",
            {
                "depth": depth,
                "node_cap": node_cap,
                "show_optional": str(show_optional).lower(),
            },
        )
    )


@mcp.tool()
@log_tool("last_update")
def last_update() -> str:
    """Latest data freshness from the pipeline (GET /last_update)."""
    return _dump(get_json("/last_update"))


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="PyPIMap MCP server")
    parser.add_argument(
        "--transport",
        choices=("stdio", "streamable-http"),
        default=os.environ.get("PYPIMAP_MCP_TRANSPORT", "stdio"),
        help="stdio for local IDE install; streamable-http for hosted/local URL",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("PYPIMAP_MCP_HOST", DEFAULT_HOST),
    )
    parser.add_argument(
        "--port",
        type=int,
        default=_env_int("PYPIMAP_MCP_PORT", DEFAULT_PORT),
    )
    parser.add_argument(
        "--rate-limit-per-min",
        type=int,
        default=_env_int("PYPIMAP_MCP_RATE_PER_MIN", DEFAULT_RATE_PER_MIN),
    )
    parser.add_argument(
        "--rate-limit-per-day",
        type=int,
        default=_env_int("PYPIMAP_MCP_RATE_PER_DAY", DEFAULT_RATE_PER_DAY),
    )
    parser.add_argument(
        "--log-level",
        default=os.environ.get("PYPIMAP_MCP_LOG_LEVEL", "INFO"),
    )
    return parser.parse_args(argv)


def run_http(
    *,
    host: str,
    port: int,
    rate_per_min: int,
    rate_per_day: int,
    log_level: str,
) -> None:
    mcp.settings.host = host
    mcp.settings.port = port
    mcp.settings.log_level = log_level.upper()  # type: ignore[assignment]

    app = AccessGuardMiddleware(
        mcp.streamable_http_app(),
        per_minute=rate_per_min,
        per_day=rate_per_day,
        mcp_path=MCP_PATH,
    )
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level=log_level.lower(),
    )
    uvicorn.Server(config).run()


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    configure_logging(args.log_level)

    if args.transport == "stdio":
        mcp.run(transport="stdio")
        return

    run_http(
        host=args.host,
        port=args.port,
        rate_per_min=args.rate_limit_per_min,
        rate_per_day=args.rate_limit_per_day,
        log_level=args.log_level,
    )


if __name__ == "__main__":
    main()
