FROM docker.io/library/python:3.11-slim

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src

RUN pip install --no-cache-dir .

ENV PYPIMAP_MCP_TRANSPORT=streamable-http \
    PYPIMAP_MCP_HOST=0.0.0.0 \
    PYPIMAP_MCP_PORT=8765 \
    PYPIMAP_API_BASE=http://backend:8000

EXPOSE 8765

CMD ["pypimap-mcp", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8765"]
