import { useAppStore } from "../store/appStore";

const PACKAGE_PATH_PREFIX = "/package/";

function getIdFromPath(pathname) {
  if (!pathname.startsWith(PACKAGE_PATH_PREFIX)) return null;
  const name = pathname.slice(PACKAGE_PATH_PREFIX.length);
  return name ? decodeURIComponent(name) : null;
}

export function initUrlSync() {
  const initialUrlId = getIdFromPath(window.location.pathname);
  if (initialUrlId) {
    useAppStore.getState().setFocusedPackage(initialUrlId);
  }

  let previousId = initialUrlId;

  const syncUrl = (id) => {
    if (previousId === id) return;
    previousId = id;
    const newUrl = id ? `${PACKAGE_PATH_PREFIX}${encodeURIComponent(id)}` : "/";
    window.history.pushState({}, "", newUrl);
  };

  syncUrl(useAppStore.getState().focusedPackageId);

  const unsubscribe = useAppStore.subscribe((state) => {
    syncUrl(state.focusedPackageId);
  });

  function handlePopState() {
    const idFromUrl = getIdFromPath(window.location.pathname);
    if (idFromUrl !== previousId) {
      previousId = idFromUrl;
      useAppStore.getState().setFocusedPackage(idFromUrl);
    }
  }

  window.addEventListener("popstate", handlePopState);

  return () => {
    unsubscribe();
    window.removeEventListener("popstate", handlePopState);
  };
}
