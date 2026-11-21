# PyPIMap MCP (draft)

Read-only [Model Context Protocol](https://modelcontextprotocol.io/) server over the public PyPIMap API.

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

## Install (local review)

```bash
cd mcp
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Run (stdio — used by Cursor / Claude Desktop):

```bash
pypimap-mcp
# or: python -m pypimap_mcp
```

### Cursor example (`mcp.json`)

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

Use an absolute path to the venv binary if `pypimap-mcp` is not on `PATH`.
