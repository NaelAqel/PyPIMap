"""Stdio MCP server — five tools mirroring the public PyPIMap API."""

from __future__ import annotations

import json
from typing import Any

from mcp.server.fastmcp import FastMCP

from pypimap_mcp.client import dataset_blurb, get_json

mcp = FastMCP(
    "pypimap",
    instructions=(
        "Read-only PyPIMap tools for the Python package dependency ecosystem. "
        "Glossary: Depends on / Used by, optional, active_version. " + dataset_blurb()
    ),
)


def _dump(data: Any) -> str:
    return json.dumps(data, default=str)


@mcp.tool()
def search_packages(q: str, limit: int = 10) -> str:
    """Search active packages by substring of package name or author (GET /search)."""
    limit = max(1, min(limit, 50))
    return _dump(get_json("/search", {"q": q, "limit": limit}))


@mcp.tool()
def package_info(name: str) -> str:
    """Package metadata and metrics (GET /package/api/{name}).

    Fields include active_version, depends_on_* / used_by_* counts (core and optional),
    importance_score, author, home_page, release and upload dates.
    """
    return _dump(get_json(f"/package/api/{name}"))


@mcp.tool()
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
def last_update() -> str:
    """Latest data freshness from the pipeline (GET /last_update)."""
    return _dump(get_json("/last_update"))


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
