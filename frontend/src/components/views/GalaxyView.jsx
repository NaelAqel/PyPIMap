import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import {
  loadGalaxyBoot,
  locateGalaxyPackage,
  fetchGalaxyTile,
} from "../../api/galaxy";
import { getGraphDependsOn, getGraphUsedBy } from "../../api/endpoints";
import {
  computeFitCamera,
  drawGalaxy,
  hitTest,
  pinEdgeIds,
  placeOrbitNeighbors,
  keepPinnedAmbient,
  resolveSearchHit,
  stubFromSearchHit,
  visibleTileKeys,
  camScaleX,
  PIN_EDGE_CAP,
  MAX_TILE_INFLIGHT,
  MAX_VISIBLE_TILES,
  scaleAfterWheel,
  adjustCamForScale,
  lerp,
  zoomAlmostDone,
  zoomMinForOverview,
  zoomMaxForOverview,
  ZOOM_LERP,
} from "../galaxy/galaxyMapEngine";
import GalaxyPinPanel from "../galaxy/GalaxyPinPanel";

/** Parse live /graph one-hop nodes into galaxy edge lists (no 74MB neighbors.json). */
function neighborsFromGraphResult(result, direction) {
  const out = [];
  for (const n of result?.nodes || []) {
    if (n.direction === "root" || n.is_cluster) continue;
    if (direction && n.direction && n.direction !== direction) continue;
    out.push({
      id: n.id,
      is_core: n.is_core !== false,
    });
  }
  return out;
}

function purgeOrbitNeighbors(byId) {
  for (const [id, n] of byId) {
    if (n?.is_orbit) byId.delete(id);
  }
}

/**
 * Real Galaxy map: overview + viewport tiles from /galaxy/*.
 * Camera persists in appStore.galaxyCamera (namespaced - do not collide with Explorer).
 * Full view = only intentional fit-all. Search pin does not zoom-thrash.
 */
function GalaxyView({ active = true }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    meta: null,
    overviewNodes: [],
    searchById: new Map(),
    tileCache: new Map(),
    inflight: new Set(),
    tileTimer: null,
    byId: new Map(),
    dependsOn: new Map(),
    usedBy: new Map(),
    nodes: [],
    cam: { x: 0, y: 0, scale: 1 },
    overviewScale: 1,
    /** Smooth wheel zoom: lerp cam.scale toward this each frame. */
    zoomTargetScale: 1,
    zoomAnchor: null,
    /** When set, wheel zoom-out eases cam x/y/scale to Full view framing. */
    zoomHome: false,
    zoomHomeTarget: null,
    zoomRaf: 0,
    /** Coalesce pan redraws to one/frame. */
    panRaf: 0,
    selectedId: null,
    hover: null,
    dragging: false,
    moved: false,
    lastPtr: null,
    lastClick: { id: null, t: 0 },
    index: {
      paintOrder: [],
      paintKey: "",
      spatial: null,
      spatialCell: 8,
    },
    fittedOnce: false,
    bootOk: false,
  });

  const [status, setStatus] = useState("Loading Galaxy map…");
  const [error, setError] = useState(null);
  const [hasPin, setHasPin] = useState(false);
  const pinSyncGen = useRef(0);
  const scheduleTilesRef = useRef(null);

  const galaxyPinId = useAppStore((s) => s.galaxyPinId);
  const showOptional = useAppStore((s) => s.showOptional);
  const setGalaxyCameraFn = useAppStore((s) => s.setGalaxyCamera);
  const clearGalaxyPin = useAppStore((s) => s.clearGalaxyPin);
  const pinOnGalaxy = useAppStore((s) => s.pinOnGalaxy);
  const showOptionalRef = useRef(showOptional);
  showOptionalRef.current = showOptional;

  const persistCamera = useCallback(() => {
    const s = stateRef.current;
    setGalaxyCameraFn({
      x: s.cam.x,
      y: s.cam.y,
      scale: s.cam.scale,
      overviewScale: s.overviewScale,
    });
  }, [setGalaxyCameraFn]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = stateRef.current;
    const selected = s.selectedId ? s.byId.get(s.selectedId) : null;
    drawGalaxy({
      canvas,
      ctx,
      cam: s.cam,
      overviewScale: s.overviewScale,
      nodes: s.nodes,
      byId: s.byId,
      dependsOn: s.dependsOn,
      usedBy: s.usedBy,
      selected,
      hover: s.hover,
      showOptional: showOptionalRef.current,
      index: s.index,
    });
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }, [redraw]);

  const rebuildVisibleNodes = useCallback(() => {
    const s = stateRef.current;
    if (!s.meta) return;
    const ratio =
      s.overviewScale > 0 ? s.cam.scale / s.overviewScale : 1;
    const wantTiles = ratio >= (s.meta.tile_zoom_ratio || 1.4);
    for (const n of s.overviewNodes) s.byId.set(n.id, n);
    for (const tileNodes of s.tileCache.values()) {
      for (const n of tileNodes) s.byId.set(n.id, n);
    }
    const pinned = s.selectedId ? s.byId.get(s.selectedId) : null;
    const seen = new Map();
    if (pinned) {
      // Pin mode: pin + edge neighbors (incl. orbit) + sparse far hubs only.
      seen.set(pinned.id, pinned);
      const showOpt = showOptionalRef.current;
      const edgeIds = [
        ...pinEdgeIds(s.dependsOn.get(pinned.id), pinned.id, PIN_EDGE_CAP, showOpt),
        ...pinEdgeIds(s.usedBy.get(pinned.id), pinned.id, PIN_EDGE_CAP, showOpt),
      ];
      for (const id of edgeIds) {
        const n = s.byId.get(id);
        if (n && Number.isFinite(n.x) && Number.isFinite(n.y)) seen.set(id, n);
      }
      const consider = (n) => {
        if (!n || seen.has(n.id)) return;
        if (keepPinnedAmbient(n, pinned)) seen.set(n.id, n);
      };
      for (const n of s.overviewNodes) consider(n);
      if (wantTiles) {
        for (const tileNodes of s.tileCache.values()) {
          for (const n of tileNodes) consider(n);
        }
      }
    } else {
      for (const n of s.overviewNodes) seen.set(n.id, n);
      if (wantTiles) {
        for (const tileNodes of s.tileCache.values()) {
          for (const n of tileNodes) seen.set(n.id, n);
        }
      }
    }
    s.nodes = Array.from(seen.values());
    s.index.paintKey = "";
  }, []);

  // Client-side core/optional filter - edges already fetched with optional included
  useEffect(() => {
    showOptionalRef.current = showOptional;
    rebuildVisibleNodes();
    redraw();
  }, [showOptional, rebuildVisibleNodes, redraw]);

  const fetchTile = useCallback(
    async (tx, ty) => {
      const s = stateRef.current;
      const key = `${tx}_${ty}`;
      if (!s.meta || s.tileCache.has(key) || s.inflight.has(key)) return;
      if (s.inflight.size >= MAX_TILE_INFLIGHT) return;
      s.inflight.add(key);
      try {
        const body = await fetchGalaxyTile(s.meta, tx, ty);
        s.tileCache.set(key, body.nodes || []);
        rebuildVisibleNodes();
        redraw();
      } catch (err) {
        console.warn("galaxy tile fail", key, err);
      } finally {
        s.inflight.delete(key);
        // Drain queue if camera still wants more tiles
        scheduleTilesRef.current?.();
      }
    },
    [rebuildVisibleNodes, redraw],
  );

  const scheduleTiles = useCallback(() => {
    const s = stateRef.current;
    if (!s.meta) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio =
      s.overviewScale > 0 ? s.cam.scale / s.overviewScale : 1;
    // Far out: overview only - skip rebuild/redraw here (caller already drew).
    if (ratio < (s.meta.tile_zoom_ratio || 1.4)) return;
    clearTimeout(s.tileTimer);
    s.tileTimer = setTimeout(() => {
      const keys = visibleTileKeys(
        s.cam,
        canvas.clientWidth,
        canvas.clientHeight,
        s.meta,
        MAX_VISIBLE_TILES,
      );
      for (const key of keys) {
        if (s.inflight.size >= MAX_TILE_INFLIGHT) break;
        const [tx, ty] = key.split("_").map(Number);
        fetchTile(tx, ty);
      }
      rebuildVisibleNodes();
      redraw();
    }, 120);
  }, [fetchTile, rebuildVisibleNodes, redraw]);
  scheduleTilesRef.current = scheduleTiles;

  const applyFit = useCallback(() => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!canvas || !s.nodes.length) return;
    const fitted = computeFitCamera(
      s.overviewNodes.length ? s.overviewNodes : s.nodes,
      canvas.clientWidth,
      canvas.clientHeight,
    );
    if (!fitted) return;
    if (s.zoomRaf) {
      cancelAnimationFrame(s.zoomRaf);
      s.zoomRaf = 0;
    }
    s.cam = { x: fitted.x, y: fitted.y, scale: fitted.scale };
    s.zoomTargetScale = fitted.scale;
    s.zoomAnchor = null;
    s.zoomHome = false;
    s.zoomHomeTarget = null;
    s.overviewScale = fitted.scale;
    persistCamera();
    resizeCanvas();
    scheduleTiles();
  }, [persistCamera, resizeCanvas, scheduleTiles]);

  const ensurePackage = useCallback(
    async (id) => {
      const s = stateRef.current;
      let hit = resolveSearchHit(s.searchById, id);
      const nid = hit?.id || id;
      if (s.byId.has(nid) && Number.isFinite(s.byId.get(nid).x)) return nid;
      // One-package locate - never pull the 84MB search_index into the tab.
      if (!hit) {
        try {
          hit = await locateGalaxyPackage(id);
        } catch (err) {
          console.warn("galaxy locate fail", id, err);
          hit = null;
        }
        if (hit?.id) s.searchById.set(hit.id, hit);
      }
      if (!hit) return null;
      const stub = stubFromSearchHit(hit);
      s.byId.set(hit.id, stub);
      if (Number.isFinite(hit.tx) && Number.isFinite(hit.ty)) {
        await fetchTile(hit.tx, hit.ty);
      }
      rebuildVisibleNodes();
      return s.byId.has(hit.id) ? hit.id : null;
    },
    [fetchTile, rebuildVisibleNodes],
  );

  /**
   * Pin edges from live API (Depends on / Used by), then locate neighbor coords
   * so canvas arrows can draw - never load neighbors.json.
   */
  const hydratePinNeighborhood = useCallback(
    async (focusId) => {
      const s = stateRef.current;
      const params = {
        depth: 1,
        node_cap: PIN_EDGE_CAP,
        offset: 0,
        show_optional: true,
      };
      let depends = [];
      let used = [];
      try {
        const [depRes, usedRes] = await Promise.all([
          getGraphDependsOn(focusId, params),
          getGraphUsedBy(focusId, params),
        ]);
        depends = neighborsFromGraphResult(depRes, "depends_on");
        used = neighborsFromGraphResult(usedRes, "used_by");
      } catch (err) {
        console.warn("galaxy pin edges fail", focusId, err);
      }
      s.dependsOn = new Map([[focusId, depends]]);
      s.usedBy = new Map([[focusId, used]]);

      // Locate core + optional so the toggle can switch without re-fetch
      const depIds = pinEdgeIds(depends, focusId, PIN_EDGE_CAP, true);
      const usedIds = pinEdgeIds(used, focusId, PIN_EDGE_CAP, true);
      const ids = [...new Set([...depIds, ...usedIds])];
      purgeOrbitNeighbors(s.byId);
      await Promise.all(
        ids.map(async (oid) => {
          const existing = s.byId.get(oid);
          if (existing && Number.isFinite(existing.x) && !existing.is_orbit) {
            existing.is_pin_neighbor = true;
            return;
          }
          let hit = resolveSearchHit(s.searchById, oid);
          if (!hit) {
            try {
              hit = await locateGalaxyPackage(oid);
              if (hit?.id) s.searchById.set(hit.id, hit);
            } catch {
              hit = null;
            }
          }
          if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) {
            return;
          }
          const stub = stubFromSearchHit(hit);
          stub.is_pin_neighbor = true;
          s.byId.set(hit.id, stub);
        }),
      );

      // Neighbors not in the layout get a temporary orbit so edges still draw.
      const focus = s.byId.get(focusId);
      const missing = ids.filter((oid) => {
        const n = s.byId.get(oid);
        return !n || !Number.isFinite(n.x) || !Number.isFinite(n.y) || n.is_orbit;
      });
      for (const stub of placeOrbitNeighbors(focus, missing)) {
        s.byId.set(stub.id, stub);
      }
    },
    [],
  );

  const syncPinFromStore = useCallback(
    async (pinId) => {
      const s = stateRef.current;
      if (!s.bootOk) return;
      const gen = ++pinSyncGen.current;
      if (!pinId) {
        s.selectedId = null;
        s.dependsOn = new Map();
        s.usedBy = new Map();
        purgeOrbitNeighbors(s.byId);
        setHasPin(false);
        rebuildVisibleNodes();
        redraw();
        return;
      }
      const resolvedId = await ensurePackage(pinId);
      if (gen !== pinSyncGen.current) return;
      const node = resolvedId ? s.byId.get(resolvedId) : null;
      if (!node) {
        s.selectedId = null;
        s.dependsOn = new Map();
        s.usedBy = new Map();
        setHasPin(true);
        useAppStore
          .getState()
          .setToastMessage(
            `“${pinId}” is not on this Galaxy map overview - the info panel still works.`,
          );
        rebuildVisibleNodes();
        redraw();
        return;
      }
      s.selectedId = resolvedId;
      setHasPin(true);
      await hydratePinNeighborhood(resolvedId);
      if (gen !== pinSyncGen.current) return;
      // Keep camera put - no zoom/pan on pin (edges + gold mark only)
      rebuildVisibleNodes();
      redraw();
    },
    [ensurePackage, hydratePinNeighborhood, rebuildVisibleNodes, redraw],
  );

  // Boot ONLY while Galaxy is visible. Never pull search_index/neighbors into
  // the browser - pins use /galaxy/locate, Explorer uses the live API.
  useEffect(() => {
    if (!active) return undefined;
    if (stateRef.current.bootOk) {
      const pin = useAppStore.getState().galaxyPinId;
      if (pin) syncPinFromStore(pin);
      else redraw();
      return undefined;
    }

    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        setStatus("Loading Galaxy map…");
        setError(null);
        const boot = await loadGalaxyBoot(ac.signal);
        if (cancelled || ac.signal.aborted) return;
        const s = stateRef.current;
        s.meta = boot.meta;
        s.overviewNodes = boot.overviewNodes;
        s.searchById = new Map();
        s.dependsOn = new Map();
        s.usedBy = new Map();
        s.byId = new Map(s.overviewNodes.map((n) => [n.id, n]));
        s.nodes = s.overviewNodes.slice();
        s.bootOk = true;
        setStatus("");
        rebuildVisibleNodes();

        const saved = useAppStore.getState().galaxyCamera;
        const canvas = canvasRef.current;
        if (
          saved &&
          Number.isFinite(saved.x) &&
          Number.isFinite(saved.y) &&
          Number.isFinite(saved.scale) &&
          saved.scale > 0
        ) {
          s.cam = { x: saved.x, y: saved.y, scale: saved.scale };
          s.zoomTargetScale = saved.scale;
          s.zoomAnchor = null;
          s.overviewScale =
            Number.isFinite(saved.overviewScale) && saved.overviewScale > 0
              ? saved.overviewScale
              : saved.scale;
          s.fittedOnce = true;
          resizeCanvas();
          scheduleTiles();
        } else if (canvas) {
          applyFit();
          s.fittedOnce = true;
        }

        const pinEarly = useAppStore.getState().galaxyPinId;
        if (pinEarly) await syncPinFromStore(pinEarly);
        else redraw();
      } catch (err) {
        if (err?.name === "AbortError" || cancelled) return;
        console.error("Galaxy boot failed", err);
        if (!cancelled) {
          setError("Could not load the Galaxy map.");
          setStatus("");
        }
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(stateRef.current.tileTimer);
    };
  }, [
    active,
    applyFit,
    rebuildVisibleNodes,
    resizeCanvas,
    scheduleTiles,
    syncPinFromStore,
    redraw,
  ]);

  // Pin sync only when Galaxy is visible (avoids tile storms under Explorer)
  useEffect(() => {
    if (!active) return;
    syncPinFromStore(galaxyPinId);
  }, [active, galaxyPinId, syncPinFromStore]);

  // Resize when becoming active or window resizes
  useEffect(() => {
    if (!active) return;
    resizeCanvas();
    const onResize = () => {
      resizeCanvas();
      persistCamera();
    };
    window.addEventListener("resize", onResize);
    const canvas = canvasRef.current;
    let ro;
    if (canvas && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => resizeCanvas());
      ro.observe(canvas);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [active, resizeCanvas, persistCamera]);

  // Persist on leave / restore on enter - do not re-bind on every pan (would thrash).
  const wasActiveRef = useRef(active);
  useEffect(() => {
    const was = wasActiveRef.current;
    if (was && !active) {
      persistCamera();
    } else if (!was && active) {
      const saved = useAppStore.getState().galaxyCamera;
      const s = stateRef.current;
      if (
        saved &&
        Number.isFinite(saved.scale) &&
        saved.scale > 0 &&
        s.bootOk
      ) {
        s.cam = { x: saved.x, y: saved.y, scale: saved.scale };
        s.zoomTargetScale = saved.scale;
        s.zoomAnchor = null;
        if (Number.isFinite(saved.overviewScale) && saved.overviewScale > 0) {
          s.overviewScale = saved.overviewScale;
        }
        resizeCanvas();
        scheduleTiles();
      } else {
        resizeCanvas();
      }
    }
    wasActiveRef.current = active;
  }, [active, persistCamera, resizeCanvas, scheduleTiles]);

  // Pointer / wheel handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /**
     * Wheel zoom lerps toward zoomTargetScale. If the user pans mid-lerp,
     * aborting at cam.scale throws away the rest of the scroll (feels slow).
     * Commit the pending target under the last anchor, then pan.
     */
    const commitPendingZoom = () => {
      const s = stateRef.current;
      stopZoomLoop();
      if (s.zoomHome && s.zoomHomeTarget) {
        const t = s.zoomHomeTarget;
        s.cam = { x: t.x, y: t.y, scale: t.scale };
        s.zoomTargetScale = t.scale;
        s.overviewScale = t.scale;
        s.zoomHome = false;
        s.zoomHomeTarget = null;
        s.zoomAnchor = null;
        redraw();
        return;
      }
      const target = s.zoomTargetScale;
      const anchor = s.zoomAnchor;
      if (
        Number.isFinite(target) &&
        !zoomAlmostDone(s.cam.scale, target)
      ) {
        const zMin = zoomMinForOverview(s.overviewScale);
        const zMax = zoomMaxForOverview(s.overviewScale);
        if (anchor && canvas.clientWidth > 0) {
          adjustCamForScale(
            s.cam,
            target,
            anchor.sx,
            anchor.sy,
            canvas.clientWidth,
            canvas.clientHeight,
            zMin,
            zMax,
          );
        } else {
          s.cam.scale = target;
        }
        redraw();
      }
      s.zoomTargetScale = s.cam.scale;
      s.zoomAnchor = null;
    };

    const onDown = (e) => {
      const s = stateRef.current;
      // Zoom with wheel (no click) then drag - finish zoom first so pan
      // does not fight the lerp or drop the scrolled target.
      commitPendingZoom();
      s.dragging = true;
      s.moved = false;
      s.lastPtr = { x: e.clientX, y: e.clientY };
      canvas.classList.add("dragging");
      canvas.setPointerCapture(e.pointerId);
    };

    const onUp = () => {
      const s = stateRef.current;
      const didMove = s.moved;
      s.dragging = false;
      canvas.classList.remove("dragging");
      if (s.panRaf) {
        cancelAnimationFrame(s.panRaf);
        s.panRaf = 0;
        redraw();
      }
      // Persist / tiles once per drag - doing this every move re-rendered
      // the store and rebuilt 20k nodes, which made pan feel syrupy.
      if (didMove) {
        s.zoomTargetScale = s.cam.scale;
        persistCamera();
        scheduleTiles();
      }
    };

    const onMove = (e) => {
      const s = stateRef.current;
      if (s.dragging && s.lastPtr) {
        const dx = e.clientX - s.lastPtr.x;
        const dy = e.clientY - s.lastPtr.y;
        if (Math.hypot(dx, dy) > 2) s.moved = true;
        s.cam.x -= dx / camScaleX(s.cam);
        s.cam.y -= dy / s.cam.scale;
        s.lastPtr = { x: e.clientX, y: e.clientY };
        if (!s.panRaf) {
          s.panRaf = requestAnimationFrame(() => {
            s.panRaf = 0;
            redraw();
          });
        }
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const next = hitTest({
        canvas,
        cam: s.cam,
        nodes: s.nodes,
        index: s.index,
        overviewScale: s.overviewScale,
        sx: e.clientX - rect.left,
        sy: e.clientY - rect.top,
      });
      const hoverChanged = (next && next.id) !== (s.hover && s.hover.id);
      s.hover = next;
      if (hoverChanged) redraw();
    };

    const onLeave = () => {
      const s = stateRef.current;
      if (!s.hover) return;
      s.hover = null;
      redraw();
    };

    const onClick = (e) => {
      const s = stateRef.current;
      if (s.moved) return;
      const rect = canvas.getBoundingClientRect();
      const n = hitTest({
        canvas,
        cam: s.cam,
        nodes: s.nodes,
        index: s.index,
        overviewScale: s.overviewScale,
        sx: e.clientX - rect.left,
        sy: e.clientY - rect.top,
      });
      if (!n) {
        if (s.selectedId) {
          // Clear pin only - do NOT fit (Full view is intentional fit-all)
          clearGalaxyPin();
        }
        return;
      }
      s.lastClick = { id: n.id, t: performance.now() };
      if (s.selectedId === n.id) {
        clearGalaxyPin();
        return;
      }
      // Pin opens the Galaxy info panel (Explorer UI retired)
      pinOnGalaxy(n.id, n.name);
    };

    const stopZoomLoop = () => {
      const s = stateRef.current;
      if (s.zoomRaf) {
        cancelAnimationFrame(s.zoomRaf);
        s.zoomRaf = 0;
      }
    };

    const homeAlmostDone = (cam, target) => {
      if (!target || !zoomAlmostDone(cam.scale, target.scale)) return false;
      const errPx =
        Math.hypot(cam.x - target.x, cam.y - target.y) * cam.scale;
      return errPx <= 1.25;
    };

    const tickZoom = () => {
      const s = stateRef.current;
      s.zoomRaf = 0;

      // Ease back to Full view (scale + center) - cursor anchor would leave
      // you at overview scale looking at a corner of the map.
      if (s.zoomHome && s.zoomHomeTarget) {
        const t = s.zoomHomeTarget;
        s.cam.x = lerp(s.cam.x, t.x, ZOOM_LERP);
        s.cam.y = lerp(s.cam.y, t.y, ZOOM_LERP);
        s.cam.scale = lerp(s.cam.scale, t.scale, ZOOM_LERP);
        if (homeAlmostDone(s.cam, t)) {
          s.cam = { x: t.x, y: t.y, scale: t.scale };
          s.zoomTargetScale = t.scale;
          s.overviewScale = t.scale;
          s.zoomHome = false;
          s.zoomHomeTarget = null;
          s.zoomAnchor = null;
          redraw();
          persistCamera();
          scheduleTiles();
          return;
        }
        redraw();
        s.zoomRaf = requestAnimationFrame(tickZoom);
        return;
      }

      const target = s.zoomTargetScale;
      const anchor = s.zoomAnchor;
      if (!Number.isFinite(target)) return;
      const zMin = zoomMinForOverview(s.overviewScale);
      const zMax = zoomMaxForOverview(s.overviewScale);

      let nextScale = lerp(s.cam.scale, target, ZOOM_LERP);
      if (zoomAlmostDone(nextScale, target)) nextScale = target;

      if (anchor && canvas.clientWidth > 0) {
        adjustCamForScale(
          s.cam,
          nextScale,
          anchor.sx,
          anchor.sy,
          canvas.clientWidth,
          canvas.clientHeight,
          zMin,
          zMax,
        );
      } else {
        s.cam.scale = nextScale;
      }

      redraw();

      if (!zoomAlmostDone(s.cam.scale, target)) {
        s.zoomRaf = requestAnimationFrame(tickZoom);
        return;
      }

      // Settled - resync so the next gesture starts from the true camera.
      s.zoomTargetScale = s.cam.scale;
      s.zoomAnchor = null;
      persistCamera();
      scheduleTiles();
    };

    const onWheel = (e) => {
      e.preventDefault();
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const zoomingOut = e.deltaY > 0;

      // Zoom-in cancels a pending Full-view ease.
      if (!zoomingOut) {
        s.zoomHome = false;
        s.zoomHomeTarget = null;
      } else if (s.zoomHome) {
        // Keep easing home - further zoom-out notches used to clear zoomHome
        // because next was computed from the still-high cam.scale.
        if (!s.zoomRaf) s.zoomRaf = requestAnimationFrame(tickZoom);
        return;
      }

      // Mid-gesture: chain from target. Idle: start from live camera.
      const base = s.zoomRaf ? s.zoomTargetScale : s.cam.scale;
      const zMin = zoomMinForOverview(s.overviewScale);
      const zMax = zoomMaxForOverview(s.overviewScale);
      const next = scaleAfterWheel(
        base,
        e.deltaY,
        e.deltaMode,
        canvas.clientHeight,
        undefined,
        zMin,
        zMax,
      );

      // Zooming out to (or past) overview scale → Full view framing, not
      // cursor-anchored scale-only (that leaves the map off-center).
      if (
        zoomingOut &&
        Number.isFinite(s.overviewScale) &&
        next <= s.overviewScale * 1.05
      ) {
        const fitted = computeFitCamera(
          s.overviewNodes.length ? s.overviewNodes : s.nodes,
          canvas.clientWidth,
          canvas.clientHeight,
        );
        if (fitted) {
          s.zoomHome = true;
          s.zoomHomeTarget = fitted;
          s.zoomTargetScale = fitted.scale;
          s.zoomAnchor = null;
          if (!s.zoomRaf) s.zoomRaf = requestAnimationFrame(tickZoom);
          return;
        }
      }

      s.zoomHome = false;
      s.zoomHomeTarget = null;
      s.zoomTargetScale = next;
      s.zoomAnchor = { sx, sy };
      if (!s.zoomRaf) s.zoomRaf = requestAnimationFrame(tickZoom);
    };

    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (!useAppStore.getState().galaxyPinId) return;
      clearGalaxyPin();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);

    return () => {
      stopZoomLoop();
      const s = stateRef.current;
      if (s.panRaf) {
        cancelAnimationFrame(s.panRaf);
        s.panRaf = 0;
      }
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [
    clearGalaxyPin,
    persistCamera,
    pinOnGalaxy,
    redraw,
    scheduleTiles,
  ]);

  function handleFullView() {
    applyFit();
  }

  function handleClearPin() {
    clearGalaxyPin();
  }

  return (
    <div
      className="galaxy-root"
      aria-hidden={!active}
      style={{
        visibility: active ? "visible" : "hidden",
        pointerEvents: active ? "auto" : "none",
        zIndex: active ? 1 : 0,
      }}
    >
      <div className="galaxy-stage">
        {(status || error) && (
          <div className="galaxy-hud" aria-live="polite">
            {status && <p>{status}</p>}
            {error && <p className="galaxy-error">{error}</p>}
          </div>
        )}

        <div className="galaxy-toolbar">
          <button
            type="button"
            onClick={handleFullView}
            title="Reset zoom and pan to the full Galaxy"
          >
            Full view
          </button>
          {hasPin && (
            <button type="button" onClick={handleClearPin}>
              Clear pin
            </button>
          )}
        </div>

        <canvas
          ref={canvasRef}
          className="galaxy-canvas"
          aria-label="PyPI package Galaxy map"
        />
      </div>
      {active && <GalaxyPinPanel />}
    </div>
  );
}

export default GalaxyView;
