import { create } from "zustand";

/** @typedef {'galaxy' | 'guide' | 'mcp'} AppView */

function withPinCrumbs(state, normalizedId, label) {
  let crumbs = state.breadcrumbs;
  const existing = crumbs.findIndex((c) => String(c.id) === normalizedId);
  if (existing >= 0) crumbs = crumbs.slice(0, existing + 1);
  else crumbs = [...crumbs, { id: normalizedId, name: label }];
  if (crumbs.length > 8) crumbs = crumbs.slice(-8);
  crumbs = crumbs.map((c) =>
    String(c.id) === normalizedId ? { ...c, name: label } : c,
  );
  return crumbs;
}

export const useAppStore = create((set, get) => ({
  /** @type {AppView} */
  activeView: "galaxy",
  /** Pinned package on Galaxy - also drives the info panel */
  galaxyPinId: null,
  galaxyPinName: null,
  /**
   * Galaxy camera only.
   * Keys: { x, y, scale, overviewScale }
   */
  galaxyCamera: null,
  /** Same as pin for panel/API hooks (legacy name kept for less churn) */
  focusedPackageId: null,
  focusedPackageName: null,
  breadcrumbs: [],
  showOptional: false,
  errorState: null,
  toastMessage: null,

  setActiveView: (view) =>
    set({
      // Explorer mode retired - map any legacy "explorer" to Galaxy
      activeView: view === "explorer" ? "galaxy" : view,
    }),

  setGalaxyCamera: (cam) =>
    set({
      galaxyCamera: cam
        ? {
            x: cam.x,
            y: cam.y,
            scale: cam.scale,
            overviewScale: cam.overviewScale,
          }
        : null,
    }),

  setGalaxyPin: (id, name = null) => {
    const pkg = id ? String(id) : null;
    const label = name || pkg;
    set({
      galaxyPinId: pkg,
      galaxyPinName: label,
      focusedPackageId: pkg,
      focusedPackageName: label,
    });
  },

  clearGalaxyPin: () =>
    set({
      galaxyPinId: null,
      galaxyPinName: null,
      focusedPackageId: null,
      focusedPackageName: null,
    }),

  setFocusedPackage: (id, name = null) =>
    set({
      focusedPackageId: id ? String(id) : null,
      focusedPackageName: name || (id ? String(id) : null),
      galaxyPinId: id ? String(id) : null,
      galaxyPinName: name || (id ? String(id) : null),
    }),

  /** Search / click / deep link: stay on Galaxy, pin + open panel */
  pinOnGalaxy: (id, name = null) => {
    const pkg = id ? String(id) : null;
    if (!pkg) {
      set({ activeView: "galaxy" });
      return;
    }
    const label = name || pkg;
    set((state) => ({
      activeView: "galaxy",
      galaxyPinId: pkg,
      galaxyPinName: label,
      focusedPackageId: pkg,
      focusedPackageName: label,
      breadcrumbs: withPinCrumbs(state, pkg, label),
    }));
  },

  /**
   * @deprecated Explorer UI removed - aliases pinOnGalaxy.
   * Kept so Guide / old call sites keep working.
   */
  openExplorer: (id = null, name = null) => {
    const { galaxyPinId, galaxyPinName, focusedPackageId, focusedPackageName } =
      get();
    const pkg = id ? String(id) : focusedPackageId || galaxyPinId;
    const pkgName =
      name ||
      (id ? String(id) : null) ||
      focusedPackageName ||
      galaxyPinName ||
      pkg;
    if (pkg) get().pinOnGalaxy(pkg, pkgName);
    else set({ activeView: "galaxy" });
  },

  /** Neighbor click in panel - re-pin on Galaxy with crumb walk */
  focusInExplorer: (id, name = null) => {
    if (!id) return;
    get().pinOnGalaxy(id, name || String(id));
  },

  /** Seed / rename crumb without rewriting walk history */
  ensureExplorerCrumb: (id, name = null) => {
    if (!id) return;
    const normalizedId = String(id);
    const label = name || normalizedId;
    const state = get();
    const crumbs = state.breadcrumbs;
    const existing = crumbs.findIndex((c) => String(c.id) === normalizedId);
    if (existing >= 0) {
      if (
        crumbs[existing].name === label &&
        state.focusedPackageName === label
      ) {
        return;
      }
      set({
        breadcrumbs: crumbs.map((c, i) =>
          i === existing ? { ...c, name: label } : c,
        ),
        focusedPackageName: label,
        galaxyPinName: label,
      });
      return;
    }
    if (crumbs.length === 0) {
      set({
        breadcrumbs: [{ id: normalizedId, name: label }],
        focusedPackageName: label,
        galaxyPinName: label,
      });
      return;
    }
    if (String(state.focusedPackageId) === normalizedId) {
      set({
        breadcrumbs: [...crumbs, { id: normalizedId, name: label }].slice(-8),
        focusedPackageName: label,
        galaxyPinName: label,
      });
    }
  },

  addBreadcrumb: (id, name) =>
    set((state) => {
      const normalizedId = String(id);
      const label = name || normalizedId;
      const existing = state.breadcrumbs.findIndex(
        (b) => String(b.id) === normalizedId,
      );
      let updated;
      if (existing >= 0) {
        updated = state.breadcrumbs
          .slice(0, existing + 1)
          .map((b, i) => (i === existing ? { ...b, name: label } : b));
      } else {
        updated = [
          ...state.breadcrumbs,
          { id: normalizedId, name: label },
        ].slice(-8);
      }
      return { breadcrumbs: updated };
    }),

  toggleShowOptional: () =>
    set((state) => ({ showOptional: !state.showOptional })),

  setError: (errorState) => set({ errorState }),

  setToastMessage: (toastMessage) => set({ toastMessage }),
}));

window.useAppStore = useAppStore;
