from fastapi import FastAPI, HTTPException, Query, status, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, HTMLResponse, FileResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import psycopg
import os

app = FastAPI()

SITEMAP_CHUNK_SIZE = 45000

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.mount("/assets", StaticFiles(directory="/app/frontend_dist/assets"), name="assets")

CACHEABLE_PATH_PREFIXES = (
    "/package/",
    "/graph/",
    "/sitemap",
    "/robots.txt",
    "/ai.txt",
    "/llms.txt",
    "/last_update",
)


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


@app.get("/")
def redirect_to_random_package():
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                    select normalized_name from pypi.metadata
                    where importance_score >= 10 and is_active_package
                    order by random()
                    limit 1
                """
            )
            result = cur.fetchone()

    return RedirectResponse(
        url=f"/package/{result[0]}", status_code=status.HTTP_302_FOUND
    )


@app.get("/last_update")
def get_meta():
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("select max(last_upload_date) from pypi.metadata;")
            result = cur.fetchone()
    return {"last_updated_date": result[0]}


@app.get("/search")
@limiter.limit("60/minute")
def search_packages(
    request: Request, q: str = None, limit: int = Query(10, ge=1, le=50)
):
    if not q:
        raise HTTPException(status_code=400, detail="query to search `q` is required")

    sql = """select normalized_name, package_name, author 
             from pypi.metadata
             where (package_name ilike %s or (author ilike %s and author != 'Your Name')) 
                and is_active_package
             order by package_name = %s desc, importance_score desc
             limit %s;"""

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (f"%{q}%", f"%{q}%", f"{q}", limit))
            rows = cur.fetchall()

    return [{"name": r[0], "package_name": r[1], "author": r[2]} for r in rows]


@app.get("/package/{name}", response_class=HTMLResponse)
def get_package_info(name: str):
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select normalized_name, seo_header 
                from pypi.seo_cache
                where normalized_name = %s
            """,
                (name,),
            )
            row = cur.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail="Package not found")
    seo_header = row[1]

    with open('/app/frontend_dist/index.html') as f:
        frontend_html = f.read()

    # Insert SEO tags right after the opening <head> tag of the real built file
    head_tag_end = frontend_html.index('<head>') + len('<head>')
    full_html = frontend_html[:head_tag_end] + seo_header + frontend_html[head_tag_end:]

    return HTMLResponse(content=full_html, status_code=200)


@app.get("/package/api/{name}")
@limiter.limit("60/minute")
def get_package_info(request: Request, name: str):
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select 
                    m.normalized_name
                    ,m.package_name
                    ,coalesce(m.author, 'Not Available')         author  
                    ,coalesce(m.home_page, 'Not Available')      home_page     
                    ,m.first_upload_date
                    ,m.last_upload_date
                    ,m.last_version
                    ,m.releases_count
                    ,p.parent_core_counts
                    ,p.parent_non_core_counts
                    ,p.children_core_counts
                    ,p.children_non_core_counts
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
        "last_version": row[6],
        "releases_count": row[7],
        "parent_core_counts": row[8],
        "parent_non_core_counts": row[9],
        "children_core_counts": row[10],
        "children_non_core_counts": row[11],
        "importance_score": row[12],
    }


@app.get("/graph/{name}/parents")
@limiter.limit("30/minute")
def get_graph_parents(
    request: Request,
    name: str = None,
    depth: int = Query(2, ge=1, le=4),
    offset: int = 0,
    node_cap: int = Query(150, ge=10, le=500),
    show_non_core: bool = True,
):
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            # inti values
            req_level, is_cluster_request = None, False

            if name.startswith("cluster_"):
                is_cluster_request = True
                parts = name.split("_")  # ['cluster', 'p', 'numpy', '1']
                if parts[1] != "p":
                    raise HTTPException(status_code=400, detail="Not a parent cluster")
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
                    select id, parent_core_ids, parent_non_core_ids
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
                    parent_ids = (p_core or []) + (p_non or [] if show_non_core else [])

                    core_parent_set = set(p_core or [])

                    # --- UPSTREAM TRUNCATION & AGGREGATOR ---
                    actual_parents = parent_ids[offset : offset + node_cap]
                    parent_cluster_count = max(0, len(parent_ids) - (offset + node_cap))

                    # Separate counts so the frontend can display the right number
                    # depending on the show-non-core toggle, independent of what was fetched.
                    core_only_ids = p_core or []
                    total_ids = (p_core or []) + (p_non or [])
                    remaining_core_count = max(
                        0, len(core_only_ids) - (offset + node_cap)
                    )
                    remaining_total_count = max(0, len(total_ids) - (offset + node_cap))

                    if is_cluster_request and not (
                        level == req_level and row_id == seed_id[0]
                    ):
                        actual_parents = []

                    for pid in actual_parents:
                        pid_name = id_to_name.get(pid, str(pid))
                        if str(pid) not in nodes:
                            if len(nodes) >= node_cap or len(edges) >= (node_cap * 2):
                                is_capped = True
                                continue

                            nodes[pid_name] = {
                                "id": pid_name,
                                "direction": "parent",
                                "level": level,
                                "is_core": pid in core_parent_set,
                                "is_cluster": False,
                            }
                            next_frontier.append(pid)

                        edges.append(
                            {
                                "from": pid_name,
                                "to": row_name,
                                "direction": "parent",
                                "is_core": pid in core_parent_set,
                            }
                        )

                    # Inject pseudo-node for truncated parents
                    if parent_cluster_count > 0:
                        cluster_id = f"cluster_p_{row_name}_{level}"
                        nodes[cluster_id] = {
                            "id": cluster_id,
                            "package_name": [
                                f"+ {parent_cluster_count} other packages"
                            ],
                            "direction": "parent",
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
                                "direction": "parent",
                                "is_core": True,
                            }
                        )

                frontier = next_frontier

            # Filter out real names to look up display names and importance scores
            real_names = [x for x in nodes.keys() if not x.startswith("cluster_")]
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


@app.get("/graph/{name}/children")
@limiter.limit("30/minute")
def get_graph_children(
    request: Request,
    name: str = None,
    depth: int = Query(2, ge=1, le=4),
    offset: int = 0,
    node_cap: int = Query(150, ge=10, le=500),
    show_non_core: bool = True,
):
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            # inti values
            req_level, is_cluster_request = None, False

            if name.startswith("cluster_"):
                is_cluster_request = True
                parts = name.split("_")  # ['cluster', 'c', 'numpy', '1']
                if parts[1] != "c":
                    raise HTTPException(status_code=400, detail="Not a child cluster")
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
                    select id, children_core_ids, children_non_core_ids
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
                    child_ids = (c_core or []) + (c_non or [] if show_non_core else [])

                    core_child_set = set(c_core or [])

                    # --- DOWNSTREAM TRUNCATION & AGGREGATOR ---
                    # Your clean logic
                    actual_children = child_ids[offset : offset + node_cap]
                    child_cluster_count = max(0, len(child_ids) - (offset + node_cap))

                    # Separate counts so the frontend can display the right number
                    # depending on the show-non-core toggle, independent of what was fetched.
                    core_only_ids = c_core or []
                    total_ids = (c_core or []) + (c_non or [])
                    remaining_core_count = max(
                        0, len(core_only_ids) - (offset + node_cap)
                    )
                    remaining_total_count = max(0, len(total_ids) - (offset + node_cap))

                    if is_cluster_request and not (
                        level == req_level and row_id == seed_id[0]
                    ):
                        actual_children = []

                    for cid in actual_children:
                        cid_name = id_to_name.get(cid, str(cid))
                        if cid_name not in nodes:
                            if len(nodes) >= node_cap or len(edges) >= (node_cap * 2):
                                is_capped = True
                                continue

                            nodes[cid_name] = {
                                "id": cid_name,
                                "direction": "child",
                                "level": level,
                                "is_core": cid in core_child_set,
                                "is_cluster": False,
                            }
                            next_frontier.append(cid)

                        edges.append(
                            {
                                "from": row_name,
                                "to": cid_name,
                                "direction": "child",
                                "is_core": cid in core_child_set,
                            }
                        )

                    # Inject pseudo-node for truncated children
                    if child_cluster_count > 0:
                        cluster_id = f"cluster_c_{row_name}_{level}"
                        nodes[cluster_id] = {
                            "id": cluster_id,
                            "package_name": [f"+ {child_cluster_count} other packages"],
                            "direction": "child",
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
                                "direction": "child",
                                "is_core": True,
                            }
                        )

                frontier = next_frontier

            # Filter out real names to look up display names and importance scores
            real_names = [x for x in nodes.keys() if not x.startswith("cluster_")]
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
    content = (
        "User-agent: *\n"
        "Disallow: /api/\n"
        "Disallow: /docs\n"
        "Disallow: /redoc\n"
        "Disallow: /openapi.json\n"
        "Allow: /\n"
        "\n"
        "Sitemap: https://pypimap.com/sitemap.xml\n"
    )
    return Response(content=content, media_type="text/plain")


@app.get("/ai.txt", response_class=Response)
def get_ai_txt():
    # Signals your explicit terms directly to AI dataset curators
    content = (
        "User-agent: *\n"
        "Permissions: crawl, cite\n"
        "Training: deny\n"
        "Commercial-Use: allow\n"
    )
    return Response(content=content, media_type="text/plain")


@app.get("/llms.txt", response_class=Response)
def get_llms_txt():
    markdown = (
        "# PyPiMap\n\n"
        "> Interactive python package dependency and ecosystem maps.\n\n"
        "## Core Resources\n"
        "- [/package/{name}](https://pypimap.com/package/{name}): Comprehensive dependency metadata and relationship metrics.\n"
        "- [/search?q={query}](https://pypimap.com/search): Trigram exact and author search for active PyPI releases.\n"
    )
    return Response(content=markdown, media_type="text/markdown")


@app.get("/sitemap.xml", response_class=Response)
def get_sitemap_index():
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("select count(*) from pypi.metadata where is_active_package;")
            total = cur.fetchone()[0]
    num_chunks = (total // SITEMAP_CHUNK_SIZE) + (
        1 if total % SITEMAP_CHUNK_SIZE else 0
    )

    body = "\n".join(
        [
            f"  <sitemap>\n    <loc>https://pypimap.com/sitemap-static.xml</loc>\n  </sitemap>"
        ]
        + [
            f"  <sitemap>\n    <loc>https://pypimap.com/sitemap-{i}.xml</loc>\n  </sitemap>"
            for i in range(1, num_chunks + 1)
        ]
    )

    index_xml = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        f"</sitemapindex>"
    )

    return Response(content=index_xml, media_type="application/xml")


@app.get("/sitemap-static.xml", response_class=Response)
def get_static_sitemap():
    static_pages = [
        ("https://pypimap.com/", "1.0", "always"),
        ("https://pypimap.com/guide", "0.6", "monthly"),
    ]

    body = "\n".join(
        [
            f"  <url>\n    <loc>{loc}</loc>\n    <changefreq>{changefreq}</changefreq>\n    <priority>{priority}</priority>\n  </url>"
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


@app.get("/sitemap-{chunk_num}.xml", response_class=Response)
def get_sitemap_chunk(chunk_num: int):
    if chunk_num < 1:
        raise HTTPException(status_code=404, detail="Invalid sitemap chunk")
    offset = (chunk_num - 1) * SITEMAP_CHUNK_SIZE

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select normalized_name from pypi.metadata
                where is_active_package
                order by importance_score desc, first_upload_date
                limit %s offset %s
                """,
                (SITEMAP_CHUNK_SIZE, offset),
            )
            packages = [row[0] for row in cur.fetchall()]

    if not packages:
        raise HTTPException(status_code=404, detail="Sitemap chunk not found")

    xml_body = "\n".join(
        [
            f"  <url>\n    <loc>https://pypimap.com/package/{pkg}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>"
            for pkg in packages
        ]
    )

    sitemap_xml = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{xml_body}\n"
        f"</urlset>"
    )
    return Response(content=sitemap_xml, media_type="application/xml")


@app.get("/site.webmanifest")
def get_manifest():
    return FileResponse("/app/frontend_dist/site.webmanifest")


@app.get("/favicon.ico")
def get_favicon():
    return FileResponse("/app/frontend_dist/favicon.ico")


@app.get("/favicon-32x32.png")
def get_favicon_32():
    return FileResponse("/app/frontend_dist/favicon-32x32.png")


@app.get("/favicon-16x16.png")
def get_favicon_16():
    return FileResponse("/app/frontend_dist/favicon-16x16.png")


@app.get("/apple-touch-icon.png")
def get_apple_icon():
    return FileResponse("/app/frontend_dist/apple-touch-icon.png")


@app.get("/android-chrome-192x192.png")
def get_android_192():
    return FileResponse("/app/frontend_dist/android-chrome-192x192.png")


@app.get("/android-chrome-512x512.png")
def get_android_512():
    return FileResponse("/app/frontend_dist/android-chrome-512x512.png")
