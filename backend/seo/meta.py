"""Rankable page title / description strings and site JSON-LD for SPA shells."""

from __future__ import annotations

import json
from typing import Any

LANDING_TITLE = "PyPIMap | Interactive map of the Python package ecosystem"
LANDING_DESCRIPTION = (
    "PyPIMap is an interactive map of the Python package (PyPI) dependency "
    "ecosystem. Explore what a package Depends on, who it is Used by, and "
    "related metadata - or browse the Galaxy overview of active packages."
)
GUIDE_TITLE = "Guide | PyPIMap - Depends on, Used by, and API"
GUIDE_DESCRIPTION = (
    "Learn how to use PyPIMap: read the dependency graph (Depends on / Used by), "
    "understand core vs optional edges and active_version, and call the public "
    "JSON API or MCP tools."
)
MCP_TITLE = "MCP | PyPIMap - agent tools over the public API"
MCP_DESCRIPTION = (
    "Connect agents to PyPIMap via MCP - search packages, Depends on / Used by "
    "graphs, and freshness over the public API. Hosted at mcp.pypimap.com/mcp."
)
EXPLORE_DESCRIPTION = (
    "PyPIMap Galaxy pin view. Package deep links are app URLs, not "
    "SEO ranking pages - use / and /guide instead."
)

_PERSON_ID = "https://naelaqel.com/#person"
_SITE_ID = "https://pypimap.com/#website"

# Site-level graph carried over from the old seo_cache header (no FAQPage /
# per-package SoftwareSourceCode - those were package-page theater; package
# routes are noindex now).
_PERSON: dict[str, Any] = {
    "@type": "Person",
    "@id": _PERSON_ID,
    "name": "Nael Aqel",
    "url": "https://naelaqel.com",
    "sameAs": [
        "https://www.linkedin.com/in/naelaqel1",
        "https://github.com/naelaqel",
        "https://www.kaggle.com/naelaqel",
        "https://linktr.ee/naelaqel",
        "https://www.reddit.com/user/naelaqel",
        "https://www.quora.com/profile/Naelaqel",
        "https://medium.com/@naelaqel",
        "https://www.upwork.com/freelancers/naelaqel",
        "https://public.tableau.com/app/profile/nael.aqel",
    ],
}

_WEB_APP: dict[str, Any] = {
    "@type": "WebApplication",
    "@id": _SITE_ID,
    "name": "PyPIMap",
    "url": "https://pypimap.com",
    "description": (
        "Interactive map of the Python package (PyPI) dependency ecosystem - "
        "Depends on, Used by, Galaxy overview, public JSON API, and MCP."
    ),
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "All",
    "creator": {"@id": _PERSON_ID},
    "publisher": {"@id": _PERSON_ID},
    "maintainer": {"@id": _PERSON_ID},
    "codeRepository": "https://github.com/naelaqel/pypimap",
    "license": "https://opensource.org/licenses/MIT",
    "isBasedOn": [
        {
            "@type": "Dataset",
            "name": "PyPI Simple API Registry Metadata",
            "description": (
                "Upstream package dependency metadata extracted via the "
                "official Python Packaging Authority (PyPA) Simple API."
            ),
            "url": "https://pypi.org/simple/",
        },
        {
            "@type": "Dataset",
            "name": "PyPI Stats Download Metrics",
            "description": (
                "Aggregate download statistics and package usage logs "
                "sourced from PyPI Stats."
            ),
            "url": "https://pypistats.org/",
        },
    ],
    "hasPart": {
        "@type": "Dataset",
        "name": "PyPI Daily Package Profiles & Analytics Graph",
        "description": (
            "Pre-vectorized pipeline node snapshots for dependency analysis."
        ),
        "url": "https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data",
        "identifier": "https://doi.org/10.34740/kaggle/ds/10945692",
        "license": "https://creativecommons.org/licenses/by/4.0/",
        "creator": {"@id": _PERSON_ID},
    },
}


def site_json_ld(*, page_url: str, page_name: str, page_description: str) -> str:
    """Serialize site Person + WebApplication + this WebPage as JSON-LD."""
    page: dict[str, Any] = {
        "@type": "WebPage",
        "@id": page_url,
        "url": page_url,
        "name": page_name,
        "description": page_description,
        "isPartOf": {"@id": _SITE_ID},
        "about": {"@id": _SITE_ID},
        "author": {"@id": _PERSON_ID},
    }
    payload = {
        "@context": "https://schema.org",
        "@graph": [_PERSON, _WEB_APP, page],
    }
    # Avoid accidental </script> breakouts if a string ever contains that sequence.
    return json.dumps(payload, separators=(",", ":")).replace("<", "\\u003c")
