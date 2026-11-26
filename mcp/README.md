# PyPIMap MCP

Read-only [Model Context Protocol](https://modelcontextprotocol.io/) server over the public PyPIMap API.

Product docs (connect URL, tools, limits): [pypimap.com/mcp](https://pypimap.com/mcp) - same page as frontend route `/mcp`.

Does **not** talk to Postgres. Tools call `https://api.pypimap.com` (override with `PYPIMAP_API_BASE`).

## Tools

| Tool | API | Notes |
| --- | --- | --- |
| `search_packages` | `GET /search` | Package name or author substring |
| `package_info` | `GET /package/api/{name}` | Metadata + counts + `importance_score` |
| `package_depends_on` | `GET /graph/{name}/depends-on` | What the package needs |
| `package_used_by` | `GET /graph/{name}/used-by` | Who needs the package |
| `last_update` | `GET /last_update` | Pipeline freshness |

Glossary matches the site: **Depends on** / **Used by**, **optional**, **active_version**.

**importance_score** = `used_by_core_counts + 0.3 * used_by_optional_counts`  
(higher = more packages depend on this one; optional Used by counts at 30%).

Bulk offline data: [Kaggle dataset](https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data) · DOI [10.34740/kaggle/ds/10945692](https://doi.org/10.34740/kaggle/ds/10945692).

## Connect

### Hosted URL (ChatGPT and other remote MCP clients)

Public streamable HTTP:

```text
https://mcp.pypimap.com/mcp
```

If your client (for example ChatGPT custom GPT / MCP connector, or another app that accepts a remote MCP URL) asks for a server URL, paste that. Use **streamable HTTP**, not stdio.

OpenAI / ChatGPT UI changes over time. If your account has no MCP connector setting yet, use the public API or wait until remote MCP is available for your plan.

### Stdio (Cursor / Claude Desktop)

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
