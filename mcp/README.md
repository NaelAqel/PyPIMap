# PyPIMap MCP

Read-only [Model Context Protocol](https://modelcontextprotocol.io/) server over the public PyPIMap API.

Product docs: [pypimap.com/mcp](https://pypimap.com/mcp) (same as frontend `/mcp`).

Does **not** talk to Postgres. Tools call `https://api.pypimap.com` (override with `PYPIMAP_API_BASE`).

## Start here - pick A or B

| Plug | What you do | When |
| --- | --- | --- |
| **A. Hosted URL** | Paste `https://mcp.pypimap.com/mcp` | The AI product has "add remote MCP" / "server URL" (streamable HTTP) |
| **B. Local (stdio)** | Install this package and point the app at `pypimap-mcp` | The product only supports a **local** MCP server |

No MCP in the product -> use the [public JSON API](https://api.pypimap.com/docs). That is the client's limit, not "MCP is down."

Examples (UI labels change; not guarantees):

- **ChatGPT** (when remote MCP exists) → A
- **Cursor / Claude Desktop** → B (Claude often rejects the hosted URL)
- **Gemini / Grok / DeepSeek / others** → A if URL field, B if local only, else API

## Tools

| Tool | API | Notes |
| --- | --- | --- |
| `search_packages` | `GET /search` | Package name or author substring |
| `package_info` | `GET /package/api/{name}` | Metadata + counts + `importance_score` |
| `package_depends_on` | `GET /graph/{name}/depends-on` | What the package needs (dependencies, requires, imports) |
| `package_used_by` | `GET /graph/{name}/used-by` | Who needs it (dependents, reverse deps, who uses) |
| `last_update` | `GET /last_update` | Pipeline freshness |

## Glossary

- **Depends on** - packages this one needs (also: dependencies, requires, needs, imports)
- **Used by** - packages that need this one (also: dependents, reverse deps, who uses)
- **Core / optional** - required vs extras edges
- **active_version** - PEP 440 active release (prefer final), not last upload time
- **importance_score** = `used_by_core_counts + 0.3 * used_by_optional_counts`
- **parent / child** - ambiguous; prefer Depends on / Used by

## Short answer shape

After `package_info`, prefer a compact card:

```text
**{package_name}** is an active PyPI package (version {active_version}).
Author: {author}.
Depends on: {depends_on_core_counts} core / {depends_on_optional_counts} optional.
Used by: {used_by_core_counts} core / {used_by_optional_counts} optional.
Importance: {importance_score} (used_by_core + 0.3 x used_by_optional; higher = more packages depend on this one).
Home: {home_page}
PyPIMap: https://pypimap.com/ (pin "{package_name}")
API: https://api.pypimap.com/package/api/{name}
```


Add a short Depends on / Used by list when the question asked for that direction.

Bulk offline data: [Kaggle dataset](https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data) · DOI [10.34740/kaggle/ds/10945692](https://doi.org/10.34740/kaggle/ds/10945692).

## Connect details

### A. Hosted URL

```text
https://mcp.pypimap.com/mcp
```

Use **streamable HTTP**, not stdio. There is no separate PyPIMap plugin per vendor.

### B. Stdio (Cursor / Claude Desktop)

```bash
cd mcp
python -m venv .venv
source .venv/bin/activate
pip install -e .
pypimap-mcp
```

Cursor example (`mcp.json`):

```json
{
  "mcpServers": {
    "pypimap": {
      "command": "pypimap-mcp",
      "env": {
        "PYPIMAP_API_BASE": "https://api.pypimap.com"
      }
    }
  }
}
```

Claude Desktop uses the same idea: run `pypimap-mcp` over stdio in its MCP config.

### Local HTTP (for testing)

```bash
pypimap-mcp --transport streamable-http --host 127.0.0.1 --port 8765
```

- MCP: `http://127.0.0.1:8765/mcp`
- Health: `http://127.0.0.1:8765/health`

Default rate limits (HTTP only): **60 req/min** and **2000 req/day** per client IP. Override with `--rate-limit-per-min` / `--rate-limit-per-day` or `PYPIMAP_MCP_RATE_PER_MIN` / `PYPIMAP_MCP_RATE_PER_DAY`.

Logs go to stderr (`PYPIMAP_MCP_LOG_LEVEL`, default `INFO`).

## Ops note

Hosted MCP is already live (`mcp.pypimap.com` → Caddy → Docker `mcp`). Docs-only changes need a frontend/backend rebuild for `/mcp` and `llms.txt`; rebuild the `mcp` image when this package’s `INSTRUCTIONS` / tool text change. After deploy, purge Cloudflare for `/mcp` and `/llms.txt` if the edge still serves an old body.
