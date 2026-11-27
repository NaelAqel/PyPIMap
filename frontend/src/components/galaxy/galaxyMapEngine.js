/**
 * Galaxy map engine - Canvas 2D overview + viewport tiles.
 * Smoothness: Full view is the only intentional fit-all; search pin does not refit.
 */

export const GALAXY_PIN_CAP = 16;
/** Pin map edges from live API - include optional; higher than old core-only 16. */
export const PIN_EDGE_CAP = 48;
export const LABEL_CAP = 36;
export const HIT_PAD_PX = 7;
/** Pin zoom used to request ~460 tiles at 2.2× - that froze the map. */
export const PIN_ZOOM_FACTOR = 22;
/** Hard cap on tile fetches per camera move (nearest to center win). */
export const MAX_VISIBLE_TILES = 9;
export const MAX_TILE_INFLIGHT = 3;
/**
 * Horizontal display stretch - layout coords stay as baked; screen X uses
 * scale * GALAXY_X_STRETCH so the cloud reads ~2× wider and covers more area.
 */
export const GALAXY_X_STRETCH = 2;
/** World-space ring for off-map neighbors around the pin (Y radius; X compensated). */
export const ORBIT_RADIUS = 28;
/** Hide ambient dots inside this radius while pinned (makes room for orbit edges). */
export const PIN_CLEAR_RADIUS = 42;
/** Far ambient hubs kept for context while pinned (hide the rest). */
export const PIN_AMBIENT_HUB_MIN = 80;

export function camScaleX(cam) {
  return cam.scale * GALAXY_X_STRETCH;
}

/**
 * Wheel zoom limits and feel (smooth lerp lives in GalaxyView).
 * Absolute floor is only a numerical guard - the real zoom-out floor is
 * tied to overview/fit scale so Full view is always reachable.
 */
/** Numerical guard only - real overview fit can be ~0.002 on large layouts. */
export const ZOOM_FLOOR = 1e-4;
export const ZOOM_MIN = 0.15; // legacy; do not use as overview-relative floor/ceiling
export const ZOOM_MAX = 12; // absolute ceiling; prefer zoomMaxForOverview
/** How far past Full view the user may zoom out (0.85 ≈ slight padding). */
export const ZOOM_OUT_OF_FIT = 0.85;
/**
 * Soft zoom-in cap vs overview fit. Pin uses ~22× overview; leave headroom
 * without allowing thousand-× empty void.
 */
export const ZOOM_IN_OF_FIT = 48;
/** Stronger than 0.001 - overview scales are tiny so soft gain felt syrupy. */
export const ZOOM_WHEEL_GAIN = 0.0018;
/** Cap one wheel event so a single notch cannot leap the whole range. */
export const ZOOM_WHEEL_DY_CAP = 220;
/** Per-frame blend toward target - high so scroll keeps up with the hand. */
export const ZOOM_LERP = 0.78;
export const ZOOM_SNAP_EPS = 0.002;

/** Normalize wheel deltaY across pixel / line / page modes. */
export function normalizeWheelDeltaY(deltaY, deltaMode, pageHeight = 800) {
  const dy = Number(deltaY) || 0;
  let out = dy;
  if (deltaMode === 1) out = dy * 16;
  else if (deltaMode === 2) out = dy * Math.max(1, pageHeight);
  if (out > ZOOM_WHEEL_DY_CAP) return ZOOM_WHEEL_DY_CAP;
  if (out < -ZOOM_WHEEL_DY_CAP) return -ZOOM_WHEEL_DY_CAP;
  return out;
}

/** Zoom-out floor from the fitted overview scale (at or slightly below fit). */
export function zoomMinForOverview(overviewScale) {
  const ov =
    Number.isFinite(overviewScale) && overviewScale > 0
      ? overviewScale
      : ZOOM_FLOOR;
  // Must stay <= overview so wheel can reach Full view / arm zoom-home.
  return Math.max(ZOOM_FLOOR, ov * ZOOM_OUT_OF_FIT);
}

/** Zoom-in ceiling from the fitted overview scale. */
export function zoomMaxForOverview(overviewScale) {
  const ov =
    Number.isFinite(overviewScale) && overviewScale > 0
      ? overviewScale
      : ZOOM_FLOOR;
  const capped = ov * ZOOM_IN_OF_FIT;
  return Math.min(ZOOM_MAX, Math.max(capped, ov * 2));
}

export function clampZoomScale(scale, minScale = ZOOM_MIN, maxScale = ZOOM_MAX) {
  const lo = Number.isFinite(minScale) ? minScale : ZOOM_MIN;
  const hi = Number.isFinite(maxScale) ? maxScale : ZOOM_MAX;
  return Math.min(hi, Math.max(lo, scale));
}

/** Next target scale after one wheel event (does not mutate cam). */
export function scaleAfterWheel(
  scale,
  deltaY,
  deltaMode = 0,
  pageHeight = 800,
  gain = ZOOM_WHEEL_GAIN,
  minScale = ZOOM_MIN,
  maxScale = ZOOM_MAX,
) {
  const dy = normalizeWheelDeltaY(deltaY, deltaMode, pageHeight);
  return clampZoomScale(scale * Math.exp(-dy * gain), minScale, maxScale);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function zoomAlmostDone(scale, target, eps = ZOOM_SNAP_EPS) {
  return Math.abs(scale - target) <= eps;
}

/**
 * Change cam.scale while keeping the world point under screen (sx, sy) fixed.
 * Mutates cam in place.
 */
export function adjustCamForScale(
  cam,
  newScale,
  sx,
  sy,
  canvasW,
  canvasH,
  minScale = ZOOM_FLOOR,
  maxScale = ZOOM_MAX,
) {
  const scale = clampZoomScale(newScale, minScale, maxScale);
  if (!cam || !(canvasW > 0) || !(canvasH > 0)) {
    if (cam) cam.scale = scale;
    return cam;
  }
  const beforeX = (sx - canvasW / 2) / camScaleX(cam) + cam.x;
  const beforeY = (sy - canvasH / 2) / cam.scale + cam.y;
  cam.scale = scale;
  const afterX = (sx - canvasW / 2) / camScaleX(cam) + cam.x;
  const afterY = (sy - canvasH / 2) / cam.scale + cam.y;
  cam.x += beforeX - afterX;
  cam.y += beforeY - afterY;
  return cam;
}

export function applyNeighborsDict(neighbors) {
  const dependsOn = new Map();
  const usedBy = new Map();
  for (const [id, pack] of Object.entries(neighbors || {})) {
    const deps = (pack.depends_on || []).map(([oid, core]) => ({
      id: oid,
      is_core: core !== false,
    }));
    const used = (pack.used_by || []).map(([oid, core]) => ({
      id: oid,
      is_core: core !== false,
    }));
    if (deps.length) dependsOn.set(id, deps);
    if (used.length) usedBy.set(id, used);
  }
  return { dependsOn, usedBy };
}

export function cappedNeighbors(list, focusId, limit = GALAXY_PIN_CAP) {
  let arr = (list || []).filter((x) => x.id !== focusId && x.is_core !== false);
  arr = arr.slice(0, limit);
  return {
    items: arr,
    ids: arr.map((x) => x.id),
    total: (list || []).filter((x) => x.id !== focusId).length,
  };
}

/**
 * Pin edges for map arrows. Core always; optional only when showOptional.
 * Returns { id, is_core } so optional can render dashed.
 */
export function pinEdges(
  list,
  focusId,
  { limit = PIN_EDGE_CAP, showOptional = false } = {},
) {
  const out = [];
  const seen = new Set();
  for (const x of list || []) {
    if (!x?.id || x.id === focusId || seen.has(x.id)) continue;
    const isCore = x.is_core !== false;
    if (!showOptional && !isCore) continue;
    seen.add(x.id);
    out.push({ id: x.id, is_core: isCore });
    if (out.length >= limit) break;
  }
  return out;
}

export function pinEdgeIds(list, focusId, limit = PIN_EDGE_CAP, showOptional = false) {
  return pinEdges(list, focusId, { limit, showOptional }).map((e) => e.id);
}

export function screenRadius(n) {
  const raw = Number.isFinite(n.size)
    ? n.size
    : 1.4 + Math.log1p(n.dependent_count || 0) * 0.55;
  return Math.max(1.15, Math.min(raw, 4.2));
}

export function stubFromSearchHit(hit) {
  const imp = hit.imp || 0;
  return {
    id: hit.id,
    name: hit.name || hit.id,
    x: hit.x,
    y: hit.y,
    dependent_count: imp,
    dependency_count: 0,
    importance_score: imp,
    size: 1.4 + Math.log1p(imp) * 0.55,
    is_seed: false,
  };
}

/**
 * Temporary ring coords around the pin for neighbors not in the Galaxy layout
 * so pin edges can still draw. Cleared when the pin is cleared.
 */
export function placeOrbitNeighbors(focus, missingIds, radius = ORBIT_RADIUS) {
  if (!focus || !Number.isFinite(focus.x) || !Number.isFinite(focus.y)) {
    return [];
  }
  const ids = [...new Set((missingIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const out = [];
  const n = ids.length;
  // Compensate X so the orbit looks round after GALAXY_X_STRETCH.
  const rx = radius / GALAXY_X_STRETCH;
  const ry = radius;
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    const id = ids[i];
    out.push({
      id,
      name: id,
      x: focus.x + Math.cos(ang) * rx,
      y: focus.y + Math.sin(ang) * ry,
      dependent_count: 0,
      dependency_count: 0,
      importance_score: 0,
      size: 1.6,
      is_seed: false,
      is_pin_neighbor: true,
      is_orbit: true,
    });
  }
  return out;
}

/** True if an ambient (non-related) node should stay visible while a pin is active. */
export function keepPinnedAmbient(n, focus) {
  if (!focus || !n) return true;
  // Ellipse matching the stretched display so the clear zone stays round on screen.
  const dx = (n.x - focus.x) * GALAXY_X_STRETCH;
  const dy = n.y - focus.y;
  if (dx * dx + dy * dy < PIN_CLEAR_RADIUS * PIN_CLEAR_RADIUS) return false;
  if (n.is_seed) return true;
  return (n.dependent_count || 0) >= PIN_AMBIENT_HUB_MIN;
}

export function visibleTileKeys(
  cam,
  canvasW,
  canvasH,
  meta,
  limit = MAX_VISIBLE_TILES,
) {
  const grid = meta.grid;
  const b = meta.bounds;
  const halfW = canvasW / 2 / camScaleX(cam);
  const halfH = canvasH / 2 / cam.scale;
  const pad = 0.08;
  const x0 = cam.x - halfW * (1 + pad);
  const x1 = cam.x + halfW * (1 + pad);
  const y0 = cam.y - halfH * (1 + pad);
  const y1 = cam.y + halfH * (1 + pad);
  const spanX = b.max_x - b.min_x;
  const spanY = b.max_y - b.min_y;
  const tx0 = Math.max(0, Math.floor(((x0 - b.min_x) / spanX) * grid));
  const tx1 = Math.min(grid - 1, Math.floor(((x1 - b.min_x) / spanX) * grid));
  const ty0 = Math.max(0, Math.floor(((y0 - b.min_y) / spanY) * grid));
  const ty1 = Math.min(grid - 1, Math.floor(((y1 - b.min_y) / spanY) * grid));
  const keys = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) keys.push(`${tx}_${ty}`);
  }
  if (!limit || keys.length <= limit) return keys;
  // Prefer tiles closest to camera center (pin focus) - drop the far ring.
  const cx = ((cam.x - b.min_x) / spanX) * grid - 0.5;
  const cy = ((cam.y - b.min_y) / spanY) * grid - 0.5;
  return keys
    .map((key) => {
      const [tx, ty] = key.split("_").map(Number);
      const d = (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy);
      return { key, d };
    })
    .sort((a, b2) => a.d - b2.d)
    .slice(0, limit)
    .map((x) => x.key);
}

export function computeFitCamera(nodes, canvasW, canvasH) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const n of nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    any = true;
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  if (!any) return null;
  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  // Fit against stretched X so Full view still frames the wider cloud.
  const sx = (canvasW * 0.9) / (spanX * GALAXY_X_STRETCH);
  const sy = (canvasH * 0.9) / spanY;
  const scale = Math.min(sx, sy) * 0.92;
  return { x, y, scale };
}

/** Gentle pan only (keep scale) so pin enters viewport - no zoom thrash. */
export function ensureNodeInView(cam, node, canvasW, canvasH, margin = 0.18) {
  if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return cam;
  const halfW = (canvasW / 2 / camScaleX(cam)) * (1 - margin);
  const halfH = (canvasH / 2 / cam.scale) * (1 - margin);
  let { x, y, scale } = cam;
  if (node.x < x - halfW) x = node.x + halfW;
  else if (node.x > x + halfW) x = node.x - halfW;
  if (node.y < y - halfH) y = node.y + halfH;
  else if (node.y > y + halfH) y = node.y - halfH;
  return { x, y, scale };
}

/**
 * Search go-to-package: center on node and zoom in tightly.
 * Old default 2.2× still covered hundreds of tiles and froze the tab.
 */
export function focusCameraOnNode(
  cam,
  node,
  overviewScale,
  minZoomFactor = PIN_ZOOM_FACTOR,
) {
  if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return cam;
  const ov = Math.max(overviewScale || cam.scale || 1e-6, 1e-6);
  let scale = cam.scale;
  if (scale <= ov * 1.15) {
    scale = ov * minZoomFactor;
  }
  return { x: node.x, y: node.y, scale };
}

/** Resolve pin id against search index (id or display name, case-insensitive). */
export function resolveSearchHit(searchById, rawId) {
  if (!rawId || !searchById) return null;
  const key = String(rawId);
  if (searchById.has(key)) return searchById.get(key);
  const lower = key.toLowerCase();
  if (searchById.has(lower)) return searchById.get(lower);
  for (const hit of searchById.values()) {
    if (
      String(hit.id).toLowerCase() === lower ||
      String(hit.name || "").toLowerCase() === lower
    ) {
      return hit;
    }
  }
  return null;
}

/**
 * Google Maps-style LOD: far out = major hubs only; zoom in = more dust.
 * Labels use dependent_count as "importance".
 */
function hubLabelThreshold(zoomRatio) {
  if (zoomRatio < 1.6) return Infinity;
  if (zoomRatio < 2.5) return 120;
  if (zoomRatio < 4.0) return 40;
  if (zoomRatio < 7.0) return 12;
  return 3;
}

/** Stable 0..mask sample from package id (deterministic scatter). */
function idHashMask(id, mask) {
  let h = 0;
  const s = id || "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h & mask) === 0;
}

/**
 * Whether an ambient (non-pin) node should draw at this zoom.
 * Always LOD - the old `nodeCount < 25000` bypass kept all 20k overview
 * dots on screen and made pan/zoom feel heavy.
 */
export function keepAmbientDot(n, zoomRatio) {
  if (!n) return false;
  if (n.is_pin_neighbor || n.is_orbit || n.is_seed) return true;
  const deg = n.dependent_count || 0;
  const z = Number.isFinite(zoomRatio) ? zoomRatio : 1;

  // Street level - show everything in the frustum.
  if (z >= 3.2) return true;
  // City - drop only the tiniest dust.
  if (z >= 2.0) {
    if (deg >= 4) return true;
    return idHashMask(n.id, 1); // ~50% of deg < 4
  }
  // Metro / tile threshold - hubs + light sample.
  if (z >= 1.35) {
    if (deg >= 12) return true;
    if (deg >= 3) return idHashMask(n.id, 1);
    return idHashMask(n.id, 7); // ~12.5%
  }
  // Region - strong hubs dominate.
  if (z >= 1.0) {
    if (deg >= 40) return true;
    if (deg >= 10) return idHashMask(n.id, 1);
    if (deg >= 3) return idHashMask(n.id, 7);
    return idHashMask(n.id, 31); // ~3%
  }
  // World / Full view - constellation of major packages only.
  if (deg >= 80) return true;
  if (deg >= 25) return idHashMask(n.id, 1);
  if (deg >= 8) return idHashMask(n.id, 7);
  return idHashMask(n.id, 63); // ~1.5% of the long tail
}

function drawArrow(ctx, x1, y1, r1, x2, y2, r2, color, dashed = false) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const start = r1 + 1.25;
  const end = r2 + 6.25;
  if (dist <= start + end + 2) return;
  const ax1 = x1 + Math.cos(ang) * start;
  const ay1 = y1 + Math.sin(ang) * start;
  const ax2 = x2 - Math.cos(ang) * end;
  const ay2 = y2 - Math.sin(ang) * end;
  ctx.beginPath();
  if (dashed) ctx.setLineDash([5, 4]);
  else ctx.setLineDash([]);
  ctx.moveTo(ax1, ay1);
  ctx.lineTo(ax2, ay2);
  ctx.strokeStyle = color;
  ctx.lineWidth = dashed ? 1.1 : 1.25;
  ctx.stroke();
  ctx.setLineDash([]);
  const ah = 6.5;
  const tipX = ax2 + Math.cos(ang) * 5;
  const tipY = ay2 + Math.sin(ang) * 5;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - ah * Math.cos(ang - 0.42),
    tipY - ah * Math.sin(ang - 0.42),
  );
  ctx.lineTo(
    tipX - ah * Math.cos(ang + 0.42),
    tipY - ah * Math.sin(ang + 0.42),
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {CanvasRenderingContext2D} opts.ctx
 * @param {object} opts.cam
 * @param {number} opts.overviewScale
 * @param {Array} opts.nodes
 * @param {Map} opts.byId
 * @param {Map} opts.dependsOn
 * @param {Map} opts.usedBy
 * @param {object|null} opts.selected
 * @param {object|null} opts.hover
 * @param {boolean} [opts.showOptional]
 * @param {{ paintOrder: any[], paintKey: string, spatial: Map|null, spatialCell: number }} opts.index
 */
export function drawGalaxy(opts) {
  const {
    canvas,
    ctx,
    cam,
    overviewScale,
    nodes,
    byId,
    dependsOn,
    usedBy,
    selected,
    hover,
    showOptional = false,
    index,
  } = opts;

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  ensureIndexes(nodes, index);

  // Edges only for the pinned package - hover had empty neighbor maps → wrong/zero edges
  const focus = selected;
  const related = new Set();
  const optionalRelated = new Set();
  const sxScale = camScaleX(cam);
  const toScreen = (wx, wy) => ({
    x: (wx - cam.x) * sxScale + w / 2,
    y: (wy - cam.y) * cam.scale + h / 2,
  });

  if (focus) {
    related.add(focus.id);
    const depEdges = pinEdges(dependsOn.get(focus.id), focus.id, {
      showOptional,
    });
    const usedEdges = pinEdges(usedBy.get(focus.id), focus.id, {
      showOptional,
    });
    for (const e of depEdges) {
      related.add(e.id);
      if (!e.is_core) optionalRelated.add(e.id);
    }
    for (const e of usedEdges) {
      related.add(e.id);
      if (!e.is_core) optionalRelated.add(e.id);
    }
    for (const e of depEdges) {
      const other = byId.get(e.id);
      if (!other || !Number.isFinite(other.x) || !Number.isFinite(other.y)) {
        continue;
      }
      const a = toScreen(other.x, other.y);
      const b = toScreen(focus.x, focus.y);
      const dashed = !e.is_core;
      drawArrow(
        ctx,
        a.x,
        a.y,
        screenRadius(other),
        b.x,
        b.y,
        screenRadius(focus),
        dashed ? "rgba(110,200,255,0.55)" : "rgba(110,200,255,0.85)",
        dashed,
      );
    }
    for (const e of usedEdges) {
      const other = byId.get(e.id);
      if (!other || !Number.isFinite(other.x) || !Number.isFinite(other.y)) {
        continue;
      }
      const a = toScreen(focus.x, focus.y);
      const b = toScreen(other.x, other.y);
      const dashed = !e.is_core;
      drawArrow(
        ctx,
        a.x,
        a.y,
        screenRadius(focus),
        b.x,
        b.y,
        screenRadius(other),
        dashed ? "rgba(154,215,160,0.55)" : "rgba(154,215,160,0.85)",
        dashed,
      );
    }
  }

  const pad = 40 / cam.scale;
  const halfW = w / (2 * sxScale) + pad;
  const halfH = h / (2 * cam.scale) + pad;
  const minWX = cam.x - halfW;
  const maxWX = cam.x + halfW;
  const minWY = cam.y - halfH;
  const maxWY = cam.y + halfH;
  const zoomRatio = cam.scale / Math.max(overviewScale, 1e-6);
  const degGate = hubLabelThreshold(zoomRatio);
  let labelBudget = LABEL_CAP;
  const labelQueue = [];
  const paintOrder = index.paintOrder;

  for (const n of paintOrder) {
    if (n.x < minWX || n.x > maxWX || n.y < minWY || n.y > maxWY) continue;
    const isFocus = focus && focus.id === n.id;
    const isRelated = related.has(n.id);
    const isHover = hover && hover.id === n.id;
    if (!isFocus && !isRelated && !isHover) {
      if (focus) {
        // Pin mode: clear near-pin ambient for orbit edges; keep only far hubs.
        if (!keepPinnedAmbient(n, focus)) continue;
      } else if (!keepAmbientDot(n, zoomRatio)) {
        continue;
      }
    }
    const p = toScreen(n.x, n.y);
    const r = screenRadius(n);
    const faded = selected && !isRelated;
    if (isFocus) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = selected
        ? "rgba(255,210,122,0.95)"
        : "rgba(180,220,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    let fill;
    if (n.is_seed) fill = isFocus ? "#ffe2a8" : "#ffd27a";
    else if (n.is_orbit) fill = "rgba(220, 200, 140, 0.85)";
    else {
      const t = Math.min(1, Math.log1p(n.dependent_count || 0) / 4);
      fill = isFocus
        ? "rgb(200,230,255)"
        : `rgba(${100 + t * 70}, ${155 + t * 50}, 230, ${0.5 + t * 0.4})`;
    }
    if (faded) ctx.globalAlpha = 0.18;
    ctx.fillStyle = fill;
    ctx.fill();
    if (!faded && n.is_orbit) {
      ctx.strokeStyle = "rgba(255, 220, 140, 0.9)";
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (!faded && optionalRelated.has(n.id)) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.setLineDash([3, 2]);
      ctx.lineWidth = 1.15;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    if (faded) continue;
    const priority =
      isHover || isFocus
        ? 3
        : selected && isRelated
          ? 2
          : (n.dependent_count || 0) >= degGate
            ? 1
            : 0;
    if (priority > 0) {
      labelQueue.push({ n, p, r, priority, isFocus, isHover });
    }
  }

  labelQueue.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.n.dependent_count || 0) - (a.n.dependent_count || 0);
  });
  ctx.font = "11px IBM Plex Sans, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const item of labelQueue) {
    if (item.priority < 2) {
      if (labelBudget <= 0) break;
      labelBudget--;
    }
    ctx.fillStyle =
      item.isFocus || item.isHover ? "#fff" : "rgba(232,238,252,0.88)";
    ctx.fillText(item.n.name, item.p.x + item.r + 5, item.p.y);
  }
}

function ensureIndexes(nodes, index) {
  const key = nodes.length
    ? `${nodes.length}:${nodes[0]?.id}:${nodes[nodes.length - 1]?.id}`
    : "0";
  if (key === index.paintKey) return;
  index.paintKey = key;
  index.paintOrder = nodes
    .slice()
    .sort((a, b) => (a.dependent_count || 0) - (b.dependent_count || 0));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  index.spatialCell = Math.max(4, span / 25);
  index.spatial = new Map();
  for (const n of nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const cx = Math.floor(n.x / index.spatialCell);
    const cy = Math.floor(n.y / index.spatialCell);
    const k = cx + "," + cy;
    let bucket = index.spatial.get(k);
    if (!bucket) {
      bucket = [];
      index.spatial.set(k, bucket);
    }
    bucket.push(n);
  }
}

export function hitTest(opts) {
  const { canvas, cam, nodes, index, sx, sy, overviewScale = 1 } = opts;
  ensureIndexes(nodes, index);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const sxScale = camScaleX(cam);
  const zoomRatio = cam.scale / Math.max(overviewScale || cam.scale, 1e-6);
  const wx = (sx - w / 2) / sxScale + cam.x;
  const wy = (sy - h / 2) / cam.scale + cam.y;
  const padW = (HIT_PAD_PX + 5) / sxScale;
  const padH = (HIT_PAD_PX + 5) / cam.scale;
  const c0 = Math.floor((wx - padW) / index.spatialCell);
  const c1 = Math.floor((wx + padW) / index.spatialCell);
  const r0 = Math.floor((wy - padH) / index.spatialCell);
  const r1 = Math.floor((wy + padH) / index.spatialCell);
  let best = null;
  let bestScore = -Infinity;
  for (let cx = c0; cx <= c1; cx++) {
    for (let cy = r0; cy <= r1; cy++) {
      const bucket = index.spatial?.get(cx + "," + cy);
      if (!bucket) continue;
      for (const n of bucket) {
        // Same LOD as draw - do not hover invisible dust.
        if (!keepAmbientDot(n, zoomRatio)) continue;
        const px = (n.x - cam.x) * sxScale + w / 2;
        const py = (n.y - cam.y) * cam.scale + h / 2;
        const r = Math.max(screenRadius(n) + 4, HIT_PAD_PX);
        const d = Math.hypot(px - sx, py - sy);
        if (d > r) continue;
        const score = (r - d) * 10 + Math.log1p(n.dependent_count || 0);
        if (score > bestScore) {
          best = n;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

export function tipHtml(n, pinned, dependsOn, usedBy) {
  const d = cappedNeighbors(dependsOn.get(n.id), n.id, 9999);
  const u = cappedNeighbors(usedBy.get(n.id), n.id, 9999);
  // cappedNeighbors filters core; for tip totals use raw lengths
  const depTotal = (dependsOn.get(n.id) || []).length;
  const usedTotal = (usedBy.get(n.id) || []).length;
  const pin = pinned ? " · <em>pinned</em>" : "";
  return `<strong>${n.name}</strong>${pin} · Depends on ${depTotal || d.total} · Used by ${usedTotal || u.total}`;
}
