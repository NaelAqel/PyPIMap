import { create } from "zustand";

export const useAppStore = create((set) => ({
  focusedPackageId: null,
  focusedPackageName: null,
  breadcrumbs: [],
  showOptional: true, // Synced to API default parameter value
  errorState: null, // { type: 'network' | 'warning', message } or null
  toastMessage: null,

  initializeDefaultPackage: () => {
    const defaults = [
      "requests",
      "fastapi",
      "pydantic",
      "numpy",
      "black",
      "boto3",
    ];
    const randomPick = defaults[Math.floor(Math.random() * defaults.length)];
    set({ focusedPackageId: randomPick, focusedPackageName: randomPick });
  },

  setFocusedPackage: (id, name = null) =>
    set({
      focusedPackageId: id ? String(id) : null,
      focusedPackageName: name || (id ? String(id) : null),
    }),

  addBreadcrumb: (id, name) =>
    set((state) => {
      const normalizedId = String(id);
      const filtered = state.breadcrumbs.filter(
        (b) => String(b.id) !== normalizedId,
      );
      const updated = [...filtered, { id: normalizedId, name }].slice(-10);
      return { breadcrumbs: updated };
    }),

  toggleShowOptional: () =>
    set((state) => ({ showOptional: !state.showOptional })),

  setError: (errorState) => set({ errorState }),

  setToastMessage: (toastMessage) => set({ toastMessage }),
}));

window.useAppStore = useAppStore;
