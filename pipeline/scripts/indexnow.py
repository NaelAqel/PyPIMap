import logging
import os

import httpx

logger = logging.getLogger(__name__)

INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
SITE_HOST = "pypimap.com"
SITE_URL = f"https://{SITE_HOST}"
INDEXNOW_KEY = os.environ.get("INDEXNOW_KEY", "90e41cf4643c4427a27760a868da4bdd")


def submit_to_indexnow(package_names: list[str]) -> None:
    if not INDEXNOW_KEY or not package_names:
        return

    urls = [f"{SITE_URL}/package/{name}" for name in package_names]

    for start in range(0, len(urls), 100):
        batch = urls[start : start + 100]

        try:
            response = httpx.post(
                INDEXNOW_ENDPOINT,
                json={
                    "host": SITE_HOST,
                    "key": INDEXNOW_KEY,
                    "keyLocation": f"{SITE_URL}/{INDEXNOW_KEY}.txt",
                    "urlList": batch,
                },
                timeout=30,
            )
            response.raise_for_status()

            logger.info("IndexNow submitted %d URLs", len(batch))

        except Exception:
            logger.exception("IndexNow submission failed")
