/**
 * Galaxy tile client via same-origin `/galaxy/*`
 * (Vite in dev; FastAPI / Caddy in production).
 */

/** Resolve a path under the galaxy mount (meta, overview, tiles, ...). */
export function galaxyUrl(relPath) {
  let clean = String(relPath || "").trim();
  // Absolute URLs from meta (future CDN) pass through.
  if (/^https?:\/\//i.test(clean)) return clean;
  // Normalize relative meta paths like "./tiles/overview.json"
  clean = clean.replace(/^\.\//, "");
  clean = clean.replace(/^out\//, "");
  clean = clean.replace(/^\//, "");
  if (clean.startsWith("galaxy/")) return `/${clean}`;
  return `/galaxy/${clean}`;
}

async function fetchJson(url, signal) {
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) {
    throw new Error(`Galaxy fetch ${res.status}: ${url}`);
  }
  // If the caller left Galaxy mid-download, skip JSON.parse (main-thread freeze).
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return res.json();
}

export async function fetchGalaxyMeta(signal) {
  return fetchJson(galaxyUrl("tiles/meta.json"), signal);
}

export async function fetchGalaxyOverview(meta, signal) {
  const rel = meta?.overview_url || "tiles/overview.json";
  return fetchJson(galaxyUrl(rel), signal);
}

export async function fetchGalaxySearchIndex(meta, signal) {
  const rel = meta?.search_url || "tiles/search_index.json";
  return fetchJson(galaxyUrl(rel), signal);
}

export async function fetchGalaxyNeighbors(meta, signal) {
  const rel = meta?.neighbors_url || "tiles/neighbors.json";
  return fetchJson(galaxyUrl(rel), signal);
}

export async function fetchGalaxyTile(meta, tx, ty, signal) {
  const pattern =
    meta?.tile_url_pattern || "tiles/g/{tx}_{ty}.json";
  const rel = pattern.replace("{tx}", String(tx)).replace("{ty}", String(ty));
  const res = await fetch(
    galaxyUrl(rel),
    signal ? { signal } : undefined,
  );
  if (res.status === 404) return { nodes: [] };
  if (!res.ok) throw new Error(`Tile ${tx}_${ty} failed: ${res.status}`);
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return res.json();
}

/**
 * First paint only: meta + overview (~3MB).
 * Do NOT await search_index (84MB) / neighbors (74MB) here - that froze Galaxy
 * on "Loading…" and made search look dead.
 */
export async function loadGalaxyBoot(signal) {
  const meta = await fetchGalaxyMeta(signal);
  const overview = await fetchGalaxyOverview(meta, signal);
  return {
    meta,
    overviewNodes: overview.nodes || [],
  };
}

/**
 * Single-package map coords without downloading search_index (84MB).
 * Dev: Vite /galaxy/locate. Prod: same path on FastAPI.
 */
export async function locateGalaxyPackage(id, signal) {
  const q = String(id || "").trim();
  if (!q) return null;
  const res = await fetch(
    `/galaxy/locate?id=${encodeURIComponent(q)}`,
    signal ? { signal } : undefined,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Galaxy locate ${res.status}: ${q}`);
  }
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return res.json();
}

/**
 * @deprecated Full search_index / neighbors must not be loaded in the browser.
 * Kept as stubs so old call sites fail soft instead of freezing the tab.
 */
export async function loadGalaxySearchIndexOnly() {
  return [];
}

export async function loadGalaxyNeighborsOnly() {
  return {};
}

export async function loadGalaxyExtras() {
  return { searchIndex: [], neighbors: {} };
}
