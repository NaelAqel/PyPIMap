# PyPIMap MCP

Read-only [Model Context Protocol](https://modelcontextprotocol.io/) server over the public PyPIMap API.

Product docs (connect URL, tools, limits): [pypimap.com/mcp](https://pypimap.com/mcp) — same page as frontend route `/mcp`.

Does **not** talk to Postgres. Tools call `https://api.pypimap.com` (override with `PYPIMAP_API_BASE`).

## Tools

| Tool | API | Notes |
| --- | --- | --- |
| `search_packages` | `GET /search` | Package name or author substring |
| `package_info` | `GET /package/api/{name}` | Metadata + glossary counts |
| `package_depends_on` | `GET /graph/{name}/depends-on` | What the package needs |
| `package_used_by` | `GET /graph/{name}/used-by` | Who needs the package |
| `last_update` | `GET /last_update` | Pipeline freshness |

Glossary matches the site: **Depends on** / **Used by**, **optional**, **active_version**.

Bulk offline data: [Kaggle dataset](https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data) · DOI [10.34740/kaggle/ds/10945692](https://doi.org/10.34740/kaggle/ds/10945692).

## Install (local)

```bash
cd mcp
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Run

### Stdio (Cursor / Claude Desktop)

```bash
pypimap-mcp
# or: python -m pypimap_mcp
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

### Streamable HTTP (local hosted mode)

```bash
pypimap-mcp --transport streamable-http --host 127.0.0.1 --port 8765
```

- MCP endpoint: `http://127.0.0.1:8765/mcp`
- Health: `http://127.0.0.1:8765/health`
- Short info: `http://127.0.0.1:8765/`

Default rate limits (HTTP only): **60 req/min** and **2000 req/day** per client IP. Override with `--rate-limit-per-min` / `--rate-limit-per-day` or `PYPIMAP_MCP_RATE_PER_MIN` / `PYPIMAP_MCP_RATE_PER_DAY`.

Request + tool logs go to stderr (`PYPIMAP_MCP_LOG_LEVEL`, default `INFO`).
