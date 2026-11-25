import { useAppStore } from "../store/appStore";

/**
 * Path routes (Galaxy-only map + pin panel):
 *   /                 → Galaxy (no pin)
 *   /explore/:pkg     → Galaxy pinned on pkg (shareable; panel open)
 *   /explore          → Galaxy (upgrade to /explore/:pkg if pin exists)
 *   /guide            → Guide
 *   /mcp              → MCP agent docs
 * Legacy /package/:pkg → /explore/:pkg once.
 */

function parsePath(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/guide") {
    return { view: "guide", packageId: null, legacyPackage: false };
  }

  if (path === "/mcp") {
    return { view: "mcp", packageId: null, legacyPackage: false };
  }

  if (path === "/explore") {
    return { view: "galaxy", packageId: null, legacyPackage: false };
  }

  const exploreMatch = path.match(/^\/explore\/([^/]+)$/);
  if (exploreMatch) {
    return {
      view: "galaxy",
      packageId: decodeURIComponent(exploreMatch[1]),
      legacyPackage: false,
    };
  }

  const legacyMatch = path.match(/^\/package\/([^/]+)$/);
  if (legacyMatch) {
    return {
      view: "galaxy",
      packageId: decodeURIComponent(legacyMatch[1]),
      legacyPackage: true,
    };
  }

  return { view: "galaxy", packageId: null, legacyPackage: false };
}

function pathForState(view, pinId) {
  if (view === "guide") return "/guide";
  if (view === "mcp") return "/mcp";
  if (view === "galaxy" && pinId) {
    return `/explore/${encodeURIComponent(pinId)}`;
  }
  return "/";
}

function pinIdFromStore(state = useAppStore.getState()) {
  return state.galaxyPinId || state.focusedPackageId || null;
}

function applyParsedToStore(parsed, { replaceLegacy = false } = {}) {
  const store = useAppStore.getState();
  store.setActiveView(parsed.view === "explorer" ? "galaxy" : parsed.view);

  if (parsed.packageId) {
    store.pinOnGalaxy(parsed.packageId);
  }

  if (replaceLegacy && parsed.legacyPackage && parsed.packageId) {
    window.history.replaceState(
      {},
      "",
      `/explore/${encodeURIComponent(parsed.packageId)}`,
    );
  }
}

/**
 * Apply URL → store BEFORE first React paint.
 */
export function hydrateStoreFromUrl() {
  const initial = parsePath(window.location.pathname);
  applyParsedToStore(initial, { replaceLegacy: true });

  if (
    initial.view === "galaxy" &&
    !initial.packageId &&
    pinIdFromStore() &&
    window.location.pathname.replace(/\/+$/, "") === "/explore"
  ) {
    const id = pinIdFromStore();
    window.history.replaceState(
      {},
      "",
      `/explore/${encodeURIComponent(id)}`,
    );
  }

  const previousPath = pathForState(
    useAppStore.getState().activeView,
    pinIdFromStore(),
  );

  if (window.location.pathname !== previousPath && !initial.legacyPackage) {
    if (
      previousPath === "/" ||
      previousPath === "/guide" ||
      previousPath === "/mcp" ||
      previousPath === "/explore" ||
      previousPath.startsWith("/explore/")
    ) {
      window.history.replaceState({}, "", previousPath);
    }
  }

  return previousPath;
}

export function initUrlSync() {
  let previousPath = pathForState(
    useAppStore.getState().activeView,
    pinIdFromStore(),
  );
  const parsedNow = parsePath(window.location.pathname);
  if (
    parsedNow.view !== useAppStore.getState().activeView ||
    (parsedNow.packageId || null) !== pinIdFromStore()
  ) {
    previousPath = hydrateStoreFromUrl();
  }

  const unsubscribe = useAppStore.subscribe((state) => {
    const nextPath = pathForState(state.activeView, pinIdFromStore(state));
    if (nextPath === previousPath) return;
    previousPath = nextPath;
    window.history.pushState({}, "", nextPath);
  });

  function handlePopState() {
    const parsed = parsePath(window.location.pathname);
    previousPath = pathForState(parsed.view, parsed.packageId);
    applyParsedToStore(parsed);
  }

  window.addEventListener("popstate", handlePopState);

  return () => {
    unsubscribe();
    window.removeEventListener("popstate", handlePopState);
  };
}

export function navigateInApp(path) {
  const parsed = parsePath(path);
  applyParsedToStore(parsed);
  const next = pathForState(
    parsed.view,
    parsed.packageId || pinIdFromStore(),
  );
  if (window.location.pathname !== next) {
    window.history.pushState({}, "", next);
  }
}
