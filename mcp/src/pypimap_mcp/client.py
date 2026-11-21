"""Minimal HTTP client for api.pypimap.com."""

from __future__ import annotations

import os
from typing import Any

import httpx

DEFAULT_API_BASE = "https://api.pypimap.com"
DOI = "10.34740/kaggle/ds/10945692"
KAGGLE_URL = (
    "https://www.kaggle.com/datasets/naelaqel/"
    "pypi-daily-metadata-and-analytics-base-dataset/data"
)


def api_base() -> str:
    return os.environ.get("PYPIMAP_API_BASE", DEFAULT_API_BASE).rstrip("/")


def get_json(path: str, params: dict[str, Any] | None = None) -> Any:
    url = f"{api_base()}{path}"
    with httpx.Client(timeout=30.0) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.json()


def dataset_blurb() -> str:
    return (
        "For bulk offline use, download the PyPIMap daily dataset on Kaggle "
        f"({KAGGLE_URL}) — DOI {DOI}. "
        "This MCP is for interactive package lookup only, not a full catalog dump."
    )
