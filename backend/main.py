import os
import pathlib
import re

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from psycopg_pool import ConnectionPool
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from seo.meta import (
    EXPLORE_DESCRIPTION,
    GUIDE_DESCRIPTION,
    GUIDE_TITLE,
    LANDING_DESCRIPTION,
    LANDING_TITLE,
    MCP_DESCRIPTION,
    MCP_TITLE,
    site_json_ld,
)

app = FastAPI()

FRONTEND_DIST = os.environ.get("FRONTEND_DIST", "/app/frontend_dist")
_SEO_DIR = pathlib.Path(__file__).resolve().parent / "seo"
# D-Data contract: /galaxy/* → pipeline/artifacts/galaxy/ (or GALAXY_ARTIFACT_ROOT).
_DEFAULT_GALAXY_ROOTS = (
    os.environ.get("GALAXY_ARTIFACT_ROOT", ""),
    "/app/galaxy",
    str(
        pathlib.Path(__file__).resolve().parents[1]
        / "pipeline"
        / "artifacts"
        / "galaxy"
    ),
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.mount(
    "/assets",
    StaticFiles(directory=f"{FRONTEND_DIST}/assets"),
    name="assets",
)

# Thin static serve for Galaxy artifacts (Wave A stub; Wave B D-Galaxy consumes).
_galaxy_root = next(
    (p for p in _DEFAULT_GALAXY_ROOTS if p and os.path.isdir(p)),
    None,
)
_galaxy_index_cache: bytes | None = None


def _locate_galaxy_package(package_id: str) -> dict | None:
    """Find one search_index hit without loading the full 84MB JSON into Python dicts."""
    global _galaxy_index_cache
    if not _galaxy_root:
        return None
    raw = (package_id or "").strip().lower()
    if not raw or len(raw) > 214:
        return None
    index_path = pathlib.Path(_galaxy_root) / "tiles" / "search_index.json"
    if not index_path.is_file():
        return None
    if _galaxy_index_cache is None:
        _galaxy_index_cache = index_path.read_bytes()
    needle = f'"id":"{raw}"'.encode()
    at = _galaxy_index_cache.find(needle)
    if at < 0:
        return None
    start = _galaxy_index_cache.rfind(b"{", 0, at)
    end = _galaxy_index_cache.find(b"}", at)
    if start < 0 or end < 0 or end <= start:
        return None
    import json as _json

    try:
        return _json.loads(_galaxy_index_cache[start : end + 1])
    except (_json.JSONDecodeError, UnicodeDecodeError, ValueError):
        return None


# Never let browsers pull the 84MB / 74MB galaxy indexes (main-thread freeze).
_GALAXY_MEGA_BASENAMES = frozenset({"search_index.json", "neighbors.json"})


@app.middleware("http")
async def block_galaxy_mega_artifacts(request: Request, call_next):
    path = request.url.path or ""
    if (
        path.startswith("/galaxy/")
        and path.rsplit("/", 1)[-1] in _GALAXY_MEGA_BASENAMES
    ):
        return Response(
            content='{"detail":"Use /galaxy/locate?id=... for pins. Full search_index/neighbors are not served."}',
            status_code=403,
            media_type="application/json",
        )
    return await call_next(request)


if _galaxy_root:

    @app.get("/galaxy/locate")
    def galaxy_locate(id: str = Query(..., min_length=1, max_length=214)):
        hit = _locate_galaxy_package(id)
        if not hit:
            raise HTTPException(status_code=404, detail="Not Found")
        return hit

    app.mount("/galaxy", StaticFiles(directory=_galaxy_root), name="galaxy")

CACHEABLE_PATH_PREFIXES = (
    "/graph/",
    "/sitemap",
    "/robots.txt",
    "/ai.txt",
    "/llms.txt",
    "/last_update",
    "/galaxy/",
)


INDEXNOW_KEY = os.environ.get("INDEXNOW_KEY", "90e41cf4643c4427a27760a868da4bdd")


def _read_seo(name: str) -> str:
    """Load ranking/AEO copy from backend/seo/."""
    return (_SEO_DIR / name).read_text(encoding="utf-8").strip() + "\n"


@app.middleware("http")
async def add_cache_headers(request, call_next):
    response = await call_next(request)
    if request.method == "GET" and request.url.path.startswith(CACHEABLE_PATH_PREFIXES):
        response.headers["Cache-Control"] = "public, max-age=86400"
    return response


allowed_origins = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
)

pg_user = os.environ.get("POSTGRES_USER_READ", "user_read")
pg_password = os.environ.get("POSTGRES_PASSWORD_READ", "user_read_password")
pg_host = os.environ.get("POSTGRES_HOST", "postgres_db")
pg_name = os.environ.get("POSTGRES_DB", "pg_db")
pg_port = "5432"
sslmode = os.environ.get("POSTGRES_SSLMODE", "prefer")

DATABASE_URL = f"postgresql://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_name}?sslmode={sslmode}"

pool = ConnectionPool(
    DATABASE_URL,
    min_size=int(os.environ.get("POSTGRES_POOL_MIN_SIZE", "1")),
    max_size=int(os.environ.get("POSTGRES_POOL_MAX_SIZE", "10")),
    open=False,
)


@app.on_event("startup")
def open_database_pool():
    pool.open(wait=True)


@app.on_event("shutdown")
def close_database_pool():
    pool.close()


def _read_spa_index() -> str:
    with open(f"{FRONTEND_DIST}/index.html", encoding="utf-8") as f:
        return f.read()


def _strip_default_head_meta(html: str) -> str:
    """Remove default title / description / OG / Twitter / JSON-LD so page-specific ones win."""
    html = re.sub(
        r"<title>.*?<meta name=\"twitter:image\"[^>]*>",
        "",
        html,
        flags=re.DOTALL,
    )
    return re.sub(
        r'<script type="application/ld\+json">.*?</script>',
        "",
        html,
        flags=re.DOTALL,
    )


def _spa_response(
    *,
    title: str,
    description: str,
    canonical: str,
    robots: str | None = None,
    og_type: str = "website",
    noscript_html: str = "",
    with_json_ld: bool = False,
) -> HTMLResponse:
    html = _read_spa_index()
    html = _strip_default_head_meta(html)
    # Drop built-in landing noscript so Guide / pin deep-link shells don't inherit it.
    html = re.sub(
        r"<noscript>.*?</noscript>",
        "",
        html,
        count=1,
        flags=re.DOTALL,
    )

    robots_tag = f'\n<meta name="robots" content="{robots}" />' if robots else ""
    json_ld_tag = ""
    if with_json_ld:
        json_ld_tag = (
            '\n<script type="application/ld+json">'
            + site_json_ld(
                page_url=canonical,
                page_name=title,
                page_description=description,
            )
            + "</script>"
        )
    head_extra = (
        f"<title>{title}</title>\n"
        f'<meta name="description" content="{description}" />\n'
        f'<link rel="canonical" href="{canonical}" />'
        f"{robots_tag}\n"
        f'<meta property="og:type" content="{og_type}" />\n'
        f'<meta property="og:title" content="{title}" />\n'
        f'<meta property="og:description" content="{description}" />\n'
        f'<meta property="og:url" content="{canonical}" />\n'
        f'<meta property="og:site_name" content="PyPIMap" />\n'
        f'<meta property="og:image" content="https://pypimap.com/assets/og-preview.png" />\n'
        f'<meta name="twitter:card" content="summary_large_image" />\n'
        f'<meta name="twitter:title" content="{title}" />\n'
        f'<meta name="twitter:description" content="{description}" />\n'
        f'<meta name="twitter:image" content="https://pypimap.com/assets/og-preview.png" />'
        f"{json_ld_tag}"
    )

    head_end = html.index("<head>") + len("<head>")
    html = html[:head_end] + head_extra + html[head_end:]

    if noscript_html:
        body_end = html.index("<body>") + len("<body>")
        html = (
            html[:body_end] + f"<noscript>{noscript_html}</noscript>" + html[body_end:]
        )

    return HTMLResponse(content=html, status_code=200)


@app.get("/", response_class=HTMLResponse)
def get_landing_page():
    """Landing / Galaxy shell - rankable; no auto-redirect to a package."""
    return _spa_response(
        title=LANDING_TITLE,
        description=LANDING_DESCRIPTION,
        canonical="https://pypimap.com/",
        noscript_html=_read_seo("landing.noscript.html"),
        with_json_ld=True,
    )


@app.get("/guide", response_class=HTMLResponse)
def get_guide_page():
    """Guide - rankable crawl surface with real copy in noscript for non-JS agents."""
    return _spa_response(
        title=GUIDE_TITLE,
        description=GUIDE_DESCRIPTION,
        canonical="https://pypimap.com/guide",
        noscript_html=_read_seo("guide.noscript.html"),
        with_json_ld=True,
    )


@app.get("/mcp", response_class=HTMLResponse)
def get_mcp_page():
    """MCP docs - agent-facing connect URL, tools, limits (also in llms.txt)."""
    return _spa_response(
        title=MCP_TITLE,
        description=MCP_DESCRIPTION,
        canonical="https://pypimap.com/mcp",
        noscript_html=_read_seo("mcp.noscript.html"),
        with_json_ld=True,
    )


def _explore_spa_shell(name: str | None = None) -> HTMLResponse:
    """
    Deep-link SPA shell for Galaxy pin URLs. Not a ranking surface:
    noindex + omitted from sitemap; does not read pypi.seo_cache.
    """
    if name:
        title = f"{name} · Galaxy | PyPIMap"
        canonical = f"https://pypimap.com/explore/{name}"
    else:
        title = "Galaxy | PyPIMap"
        canonical = "https://pypimap.com/explore"
    return _spa_response(
        title=title,
        description=EXPLORE_DESCRIPTION,
        canonical=canonical,
        robots="noindex, nofollow",
    )


@app.get("/explore", response_class=HTMLResponse)
def get_explore_shell():
    return _explore_spa_shell()


@app.get("/explore/{name}", response_class=HTMLResponse)
def get_explore_package_shell(name: str):
    return _explore_spa_shell(name)


@app.get("/package/{name}", response_class=HTMLResponse)
def get_legacy_package_spa_shell(name: str):
    """Legacy /package/{name} deep link - same noindex SPA shell (no seo_cache)."""
    return _explore_spa_shell(name)


@app.get("/last_update")
def get_meta():
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("select max(last_upload_date) from pypi.metadata;")
        result = cur.fetchone()
    return {"last_updated_date": result[0]}


@app.get(f"/{INDEXNOW_KEY}.txt", response_class=PlainTextResponse)
def indexnow_key():
    return INDEXNOW_KEY


@app.get("/search")
@limiter.limit("60/minute")
def search_packages(
    request: Request, q: str | None = None, limit: int = Query(10, ge=1, le=50)
):
    if not q:
        raise HTTPException(status_code=400, detail="query to search `q` is required")

    sql = """select normalized_name, package_name, author
             from pypi.metadata
             where (package_name ilike %s or (author ilike %s and author != 'Your Name'))
                and is_active_package
             order by package_name = %s desc, importance_score desc
             limit %s;"""

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, (f"%{q}%", f"%{q}%", f"{q}", limit))
        rows = cur.fetchall()

    return [{"name": r[0], "package_name": r[1], "author": r[2]} for r in rows]


@app.get("/package/api/{name}")
@limiter.limit("60/minute")
def get_package_api(request: Request, name: str):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select
                m.normalized_name
                ,m.package_name
                ,coalesce(m.author, 'Not Available')         author
                ,coalesce(m.home_page, 'Not Available')      home_page
                ,m.first_upload_date
                ,m.last_upload_date
                ,m.active_version
                ,m.releases_count
                ,p.depends_on_core_counts
                ,p.depends_on_optional_counts
                ,p.used_by_core_counts
                ,p.used_by_optional_counts
                ,m.importance_score
            from pypi.metadata m
            join pypi.package_connections p using(id)
            where m.normalized_name = %s and m.is_active_package
        """,
            (name,),
        )
        row = cur.fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="Package not found")

    return {
        "name": row[0],
        "package_name": row[1],
        "author": row[2],
        "home_page": row[3],
        "first_upload_date": row[4],
        "last_upload_date": row[5],
        "active_version": row[6],
        "releases_count": row[7],
        "depends_on_core_counts": row[8],
        "depends_on_optional_counts": row[9],
        "used_by_core_counts": row[10],
        "used_by_optional_counts": row[11],
        "importance_score": row[12],
    }


@app.get("/graph/{name}/depends-on")
@limiter.limit("30/minute")
def get_graph_depends_on(
    request: Request,
    name: str | None = None,
    depth: int = Query(2, ge=1, le=4),
    offset: int = 0,
    node_cap: int = Query(150, ge=10, le=500),
    show_optional: bool = True,
):
    with pool.connection() as conn, conn.cursor() as cur:
        # init values
        req_level, is_cluster_request = None, False

        if name.startswith("cluster_"):
            is_cluster_request = True
            parts = name.split("_")  # ['cluster', 'd'|'u', 'numpy', '1']
            if parts[1] != "d":
                raise HTTPException(status_code=400, detail="Not a depends-on cluster")
            root_normalized_name = parts[2]
            cur.execute(
                "select id from pypi.metadata where normalized_name = %s and is_active_package",
                (root_normalized_name,),
            )
            res = cur.fetchone()
            if res is None:
                raise HTTPException(
                    status_code=404, detail="Cluster root package not found"
                )
            seed_id = [res[0]]
            req_level = int(parts[3])
        else:
            cur.execute(
                "select id, normalized_name from pypi.metadata where normalized_name = %s and is_active_package",
                (name,),
            )
            res = cur.fetchone()
            if res is None:
                raise HTTPException(status_code=404, detail="Package not found")
            root_normalized_name = res[1]
            seed_id = [res[0]]

        edges = []
        is_capped = False

        nodes = {}
        if not is_cluster_request:
            nodes[root_normalized_name] = {
                "id": root_normalized_name,
                "direction": "root",
                "is_core": True,
                "level": 0,
                "is_cluster": False,
            }

        # Track maps to convert loop integers to string labels
        id_to_name = {seed_id[0]: root_normalized_name}

        frontier = seed_id
        for level in range(1, depth + 1):
            if not frontier or is_capped:
                break

            cur.execute(
                """
                select id, depends_on_core_ids, depends_on_optional_ids
                from pypi.package_connections where id = any(%s)
            """,
                (frontier,),
            )
            rows = cur.fetchall()

            # Pre-fetch names for all connected items in this tier to maintain consistency
            all_tier_ids = []
            for r in rows:
                all_tier_ids.extend((r[1] or []) + (r[2] or []))
            if all_tier_ids:
                cur.execute(
                    "select id, normalized_name from pypi.metadata where id = any(%s) and is_active_package",
                    (list(set(all_tier_ids)),),
                )
                id_to_name.update(cur.fetchall())

            next_frontier = []

            for row_id, p_core, p_non in rows:
                row_name = id_to_name.get(row_id, str(row_id))
                depends_on_ids = (p_core or []) + (p_non or [] if show_optional else [])

                core_depends_on_set = set(p_core or [])

                # --- DEPENDS-ON TRUNCATION & AGGREGATOR ---
                actual_depends_on = depends_on_ids[offset : offset + node_cap]
                depends_on_cluster_count = max(
                    0, len(depends_on_ids) - (offset + node_cap)
                )

                # Separate counts so the frontend can display the right number
                # depending on the show-optional toggle, independent of what was fetched.
                core_only_ids = p_core or []
                total_ids = (p_core or []) + (p_non or [])
                remaining_core_count = max(0, len(core_only_ids) - (offset + node_cap))
                remaining_total_count = max(0, len(total_ids) - (offset + node_cap))

                if is_cluster_request and not (
                    level == req_level and row_id == seed_id[0]
                ):
                    actual_depends_on = []

                for dep_id in actual_depends_on:
                    dep_name = id_to_name.get(dep_id, str(dep_id))
                    if dep_name not in nodes:
                        if len(nodes) >= node_cap or len(edges) >= (node_cap * 2):
                            is_capped = True
                            continue

                        nodes[dep_name] = {
                            "id": dep_name,
                            "direction": "depends_on",
                            "level": level,
                            "is_core": dep_id in core_depends_on_set,
                            "is_cluster": False,
                        }
                        next_frontier.append(dep_id)

                    edges.append(
                        {
                            "from": dep_name,
                            "to": row_name,
                            "direction": "depends_on",
                            "is_core": dep_id in core_depends_on_set,
                        }
                    )

                # Inject pseudo-node for truncated depends-on
                if depends_on_cluster_count > 0:
                    cluster_id = f"cluster_d_{row_name}_{level}"
                    nodes[cluster_id] = {
                        "id": cluster_id,
                        "package_name": [
                            f"+ {depends_on_cluster_count} other packages"
                        ],
                        "direction": "depends_on",
                        "level": level,
                        "is_core": True,
                        "is_cluster": True,
                        "remaining_core_count": remaining_core_count,
                        "remaining_total_count": remaining_total_count,
                    }

                    edges.append(
                        {
                            "from": cluster_id,
                            "to": row_name,
                            "direction": "depends_on",
                            "is_core": True,
                        }
                    )

            frontier = next_frontier

        # Filter out real names to look up display names and importance scores
        real_names = [x for x in nodes if not x.startswith("cluster_")]
        cur.execute(
            "select normalized_name, package_name, importance_score from pypi.metadata where normalized_name = any(%s) and is_active_package",
            (real_names,),
        )
        name_map = {row[0]: row[1:] for row in cur.fetchall()}

    return {
        "nodes": [
            {
                **n,
                "package_name": name_map.get(
                    n["id"], n.get("package_name", ["Unknown"])
                )[0],
                "importance_score": name_map.get(
                    n["id"], n.get("importance_score", [0, 0])
                )[1],
            }
            for n in nodes.values()
        ],
        "edges": edges,
        "is_capped": is_capped,
        "root_normalized_name": root_normalized_name,
    }


@app.get("/graph/{name}/used-by")
@limiter.limit("30/minute")
def get_graph_used_by(
    request: Request,
    name: str | None = None,
    depth: int = Query(2, ge=1, le=4),
    offset: int = 0,
    node_cap: int = Query(150, ge=10, le=500),
    show_optional: bool = True,
):
    with pool.connection() as conn, conn.cursor() as cur:
        # init values
        req_level, is_cluster_request = None, False

        if name.startswith("cluster_"):
            is_cluster_request = True
            parts = name.split("_")  # ['cluster', 'c', 'numpy', '1']
            if parts[1] != "u":
                raise HTTPException(status_code=400, detail="Not a used-by cluster")
            root_normalized_name = parts[2]
            cur.execute(
                "select id from pypi.metadata where normalized_name = %s and is_active_package",
                (root_normalized_name,),
            )
            res = cur.fetchone()
            if res is None:
                raise HTTPException(
                    status_code=404, detail="Cluster root package not found"
                )
            seed_id = [res[0]]
            req_level = int(parts[3])
        else:
            cur.execute(
                "select id, normalized_name from pypi.metadata where normalized_name = %s and is_active_package",
                (name,),
            )
            res = cur.fetchone()
            if res is None:
                raise HTTPException(status_code=404, detail="Package not found")
            root_normalized_name = res[1]
            seed_id = [res[0]]

        edges = []
        is_capped = False

        nodes = {}
        if not is_cluster_request:
            nodes[root_normalized_name] = {
                "id": root_normalized_name,
                "direction": "root",
                "is_core": True,
                "level": 0,
                "is_cluster": False,
            }

        # Track maps to convert loop integers to string labels
        id_to_name = {seed_id[0]: root_normalized_name}

        frontier = seed_id
        for level in range(1, depth + 1):
            if not frontier or is_capped:
                break

            cur.execute(
                """
                select id, used_by_core_ids, used_by_optional_ids
                from pypi.package_connections where id = any(%s)
            """,
                (frontier,),
            )
            rows = cur.fetchall()

            # Pre-fetch names for all connected items in this tier to maintain consistency
            all_tier_ids = []
            for r in rows:
                all_tier_ids.extend((r[1] or []) + (r[2] or []))
            if all_tier_ids:
                cur.execute(
                    "select id, normalized_name from pypi.metadata where id = any(%s) and is_active_package",
                    (list(set(all_tier_ids)),),
                )
                id_to_name.update(cur.fetchall())

            next_frontier = []

            for row_id, c_core, c_non in rows:
                row_name = id_to_name.get(row_id, str(row_id))
                used_by_ids = (c_core or []) + (c_non or [] if show_optional else [])

                core_used_by_set = set(c_core or [])

                # --- USED-BY TRUNCATION & AGGREGATOR ---
                actual_used_by = used_by_ids[offset : offset + node_cap]
                used_by_cluster_count = max(0, len(used_by_ids) - (offset + node_cap))

                # Separate counts so the frontend can display the right number
                # depending on the show-optional toggle, independent of what was fetched.
                core_only_ids = c_core or []
                total_ids = (c_core or []) + (c_non or [])
                remaining_core_count = max(0, len(core_only_ids) - (offset + node_cap))
                remaining_total_count = max(0, len(total_ids) - (offset + node_cap))

                if is_cluster_request and not (
                    level == req_level and row_id == seed_id[0]
                ):
                    actual_used_by = []

                for cid in actual_used_by:
                    cid_name = id_to_name.get(cid, str(cid))
                    if cid_name not in nodes:
                        if len(nodes) >= node_cap or len(edges) >= (node_cap * 2):
                            is_capped = True
                            continue

                        nodes[cid_name] = {
                            "id": cid_name,
                            "direction": "used_by",
                            "level": level,
                            "is_core": cid in core_used_by_set,
                            "is_cluster": False,
                        }
                        next_frontier.append(cid)

                    edges.append(
                        {
                            "from": row_name,
                            "to": cid_name,
                            "direction": "used_by",
                            "is_core": cid in core_used_by_set,
                        }
                    )

                # Inject pseudo-node for truncated used-by
                if used_by_cluster_count > 0:
                    cluster_id = f"cluster_u_{row_name}_{level}"
                    nodes[cluster_id] = {
                        "id": cluster_id,
                        "package_name": [f"+ {used_by_cluster_count} other packages"],
                        "direction": "used_by",
                        "level": level,
                        "is_core": True,
                        "is_cluster": True,
                        "remaining_core_count": remaining_core_count,
                        "remaining_total_count": remaining_total_count,
                    }
                    edges.append(
                        {
                            "from": row_name,
                            "to": cluster_id,
                            "direction": "used_by",
                            "is_core": True,
                        }
                    )

            frontier = next_frontier

        # Filter out real names to look up display names and importance scores
        real_names = [x for x in nodes if not x.startswith("cluster_")]
        cur.execute(
            "select normalized_name, package_name, importance_score from pypi.metadata where normalized_name = any(%s) and is_active_package",
            (real_names,),
        )
        name_map = {row[0]: row[1:] for row in cur.fetchall()}

    return {
        "nodes": [
            {
                **n,
                "package_name": name_map.get(
                    n["id"], n.get("package_name", ["Unknown"])
                )[0],
                "importance_score": name_map.get(
                    n["id"], n.get("importance_score", [0, 0])
                )[1],
            }
            for n in nodes.values()
        ],
        "edges": edges,
        "is_capped": is_capped,
        "root_normalized_name": root_normalized_name,
    }


@app.get("/robots.txt", response_class=Response)
def get_robots_txt():
    return Response(content=_read_seo("robots.txt"), media_type="text/plain")


@app.get("/ai.txt", response_class=Response)
def get_ai_txt():
    return Response(content=_read_seo("ai.txt"), media_type="text/plain")


@app.get("/llms.txt", response_class=Response)
def get_llms_txt():
    return Response(content=_read_seo("llms.txt"), media_type="text/markdown")


@app.get("/sitemap.xml", response_class=Response)
def get_sitemap():
    """Small honest sitemap: Landing + Guide + MCP docs. No package URL chunks."""
    static_pages = [
        ("https://pypimap.com/", "1.0", "weekly"),
        ("https://pypimap.com/guide", "0.9", "monthly"),
        ("https://pypimap.com/mcp", "0.6", "monthly"),
    ]

    body = "\n".join(
        [
            f"  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <changefreq>{changefreq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            f"  </url>"
            for loc, priority, changefreq in static_pages
        ]
    )

    xml = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        f"</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


@app.get("/site.webmanifest")
def get_manifest():
    return FileResponse(f"{FRONTEND_DIST}/site.webmanifest")


@app.get("/favicon.ico")
def get_favicon():
    return FileResponse(f"{FRONTEND_DIST}/favicon.ico")


@app.get("/favicon-32x32.png")
def get_favicon_32():
    return FileResponse(f"{FRONTEND_DIST}/favicon-32x32.png")


@app.get("/favicon-16x16.png")
def get_favicon_16():
    return FileResponse(f"{FRONTEND_DIST}/favicon-16x16.png")


@app.get("/apple-touch-icon.png")
def get_apple_icon():
    return FileResponse(f"{FRONTEND_DIST}/apple-touch-icon.png")


@app.get("/android-chrome-192x192.png")
def get_android_192():
    return FileResponse(f"{FRONTEND_DIST}/android-chrome-192x192.png")


@app.get("/android-chrome-512x512.png")
def get_android_512():
    return FileResponse(f"{FRONTEND_DIST}/android-chrome-512x512.png")
