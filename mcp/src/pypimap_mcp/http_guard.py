"""HTTP access log + per-IP rate limit for the streamable-HTTP MCP app."""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from functools import wraps
from typing import Callable

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("pypimap_mcp.http")

BULK_HINT = (
    "Rate limit exceeded. This MCP is for interactive lookup only — "
    "for bulk offline use, download the PyPIMap Kaggle dataset "
    "(DOI 10.34740/kaggle/ds/10945692)."
)


class SlidingWindowLimiter:
    """In-memory sliding windows: per-minute and optional per-day caps by client key."""

    def __init__(self, per_minute: int, per_day: int) -> None:
        self.per_minute = max(1, per_minute)
        self.per_day = max(1, per_day)
        self._minute: dict[str, deque[float]] = defaultdict(deque)
        self._day: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> tuple[bool, str | None]:
        now = time.time() if now is None else now
        minute_q = self._minute[key]
        day_q = self._day[key]
        self._prune(minute_q, now - 60.0)
        self._prune(day_q, now - 86400.0)
        if len(minute_q) >= self.per_minute:
            return False, "per_minute"
        if len(day_q) >= self.per_day:
            return False, "per_day"
        minute_q.append(now)
        day_q.append(now)
        return True, None

    @staticmethod
    def _prune(q: deque[float], cutoff: float) -> None:
        while q and q[0] < cutoff:
            q.popleft()


def client_ip(scope: Scope) -> str:
    headers = {
        k.decode("latin-1").lower(): v.decode("latin-1")
        for k, v in scope.get("headers") or []
    }
    forwarded = headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    client = scope.get("client")
    if client and client[0]:
        return str(client[0])
    return "unknown"


class AccessGuardMiddleware:
    """ASGI middleware: rate-limit /mcp, log every HTTP request."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        per_minute: int = 60,
        per_day: int = 2000,
        mcp_path: str = "/mcp",
        skip_paths: frozenset[str] | None = None,
    ) -> None:
        self.app = app
        self.limiter = SlidingWindowLimiter(per_minute, per_day)
        self.mcp_path = mcp_path.rstrip("/") or "/mcp"
        self.skip_paths = skip_paths or frozenset({"/health", "/"})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path") or "/"
        method = scope.get("method") or "GET"
        ip = client_ip(scope)
        started = time.perf_counter()
        status_holder = {"code": 0}

        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                status_holder["code"] = int(message["status"])
            await send(message)

        limited_path = path.rstrip("/") == self.mcp_path or path.startswith(
            self.mcp_path + "/"
        )
        if limited_path and path not in self.skip_paths:
            ok, reason = self.limiter.allow(ip)
            if not ok:
                duration_ms = (time.perf_counter() - started) * 1000
                logger.warning(
                    "ip=%s method=%s path=%s status=429 reason=%s duration_ms=%.1f",
                    ip,
                    method,
                    path,
                    reason,
                    duration_ms,
                )
                response = JSONResponse(
                    {
                        "error": "rate_limit_exceeded",
                        "reason": reason,
                        "detail": BULK_HINT,
                    },
                    status_code=429,
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send_wrapper)
        duration_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "ip=%s method=%s path=%s status=%s duration_ms=%.1f",
            ip,
            method,
            path,
            status_holder["code"] or "-",
            duration_ms,
        )


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger("pypimap_mcp")
    if root.handlers:
        root.setLevel(level.upper())
        return
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    root.addHandler(handler)
    root.setLevel(level.upper())
    root.propagate = False


def log_tool(name: str) -> Callable:
    """Decorator: log tool name, outcome, and duration (stdio + HTTP)."""

    tool_logger = logging.getLogger("pypimap_mcp.tools")

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            started = time.perf_counter()
            try:
                result = fn(*args, **kwargs)
                tool_logger.info(
                    "tool=%s status=ok duration_ms=%.1f",
                    name,
                    (time.perf_counter() - started) * 1000,
                )
                return result
            except Exception as exc:
                tool_logger.exception(
                    "tool=%s status=error duration_ms=%.1f error=%s",
                    name,
                    (time.perf_counter() - started) * 1000,
                    type(exc).__name__,
                )
                raise

        return wrapper

    return decorator
