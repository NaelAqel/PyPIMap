import { useState, useEffect } from "react";
import SearchBar from "../search/SearchBar";
import Breadcrumbs from "../search/Breadcrumbs";
import ShowNonCoreCheckbox from "../graph/ShowNonCoreCheckbox";
import GlobalNotificationBanner from "../common/GlobalNotificationBanner";
import { useAppStore } from "../../store/appStore";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { getLastUpdate } from "../../api/endpoints";
import { formatDate } from "../../utils/formatDate";
import GuidePage from "../guide/GuidePage";
import { lazy, Suspense } from "react";

const GraphCanvas = lazy(() => import("../graph/GraphCanvas"));
const InfoLegendPanel = lazy(() => import("../panel/InfoLegendPanel"));
const InfoLegendBottomSheet = lazy(
  () => import("../panel/InfoLegendBottomSheet"),
);
const OnboardingTour = lazy(() => import("../onboarding/OnboardingTour"));

function AppShell() {
  const errorState = useAppStore((state) => state.errorState);
  const initializeDefaultPackage = useAppStore(
    (state) => state.initializeDefaultPackage,
  );
  const isNetworkError = errorState && errorState.type === "network";
  const isMobile = useMediaQuery();
  const [lastUpdateDate, setLastUpdateDate] = useState(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const isGuidePage = window.location.pathname === "/guide";

  useEffect(() => {
    if (isGuidePage) return;
    initializeDefaultPackage();

    getLastUpdate()
      .then((data) => setLastUpdateDate(formatDate(data.last_updated_date)))
      .catch((err) =>
        console.log("getLastUpdate ERROR:", err.name, err.message),
      );
  }, [isGuidePage]);

  if (isGuidePage) {
    return <GuidePage />;
  }

  return (
    <div className="fixed inset-0 bg-slate-800 overflow-hidden">
      {!isNetworkError && (
        <div className="absolute inset-0 z-0">
          <Suspense
            fallback={
              <div className="w-full h-full bg-slate-950 animate-pulse" />
            }
          >
            <GraphCanvas />
          </Suspense>
        </div>
      )}

      <GlobalNotificationBanner />

      {!isNetworkError && (
        <Suspense fallback={null}>
          <OnboardingTour />
        </Suspense>
      )}

      {/* Left panel: brand, search, breadcrumbs, checkbox — all in one column */}
      <div className="absolute top-4 left-4 z-10 pointer-events-auto flex flex-col gap-4 w-[280px] bg-slate-900/90 backdrop-blur-sm rounded-lg p-4 text-white border border-slate-600 shadow-lg">
        <div>
          <h1 className="text-lg font-bold">PyPiMap</h1>
          <p className="text-xs text-slate-300 mt-1">
            An interactive map of Python package dependencies on PyPI.

          </p>
          <a
            href="https://github.com/naelaqel/PyPIMap"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white px-2 py-1 rounded-md ml-3 mt-2 transition-colors ring-2 ring-sky-400/60"
          >
            GitHub
          </a>
          <a
            href="/guide"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white px-2 py-1 rounded-md ml-3 mt-2 transition-colors ring-2 ring-sky-400/60"
          >
            Guide
          </a>
          <p className="text-[10px] text-slate-500 mt-2">
            Last record at: {lastUpdateDate || "—"} UTC
          </p>
        </div>

        <div className="border-t border-slate-700 pt-3">
          <div className="rounded-lg ring-2 ring-sky-400/60">
            <SearchBar />
          </div>
        </div>

        <div className="border-t border-slate-700 pt-3 space-y-3">
          <div className="bg-slate-800/60 rounded-md p-2">
            <ShowNonCoreCheckbox />
          </div>
          <Breadcrumbs />
        </div>
      </div>

      <Suspense
        fallback={
          <div className="fixed bottom-0 left-0 w-full h-16 bg-slate-900/50 animate-pulse md:hidden" />
        }
      >
        {isMobile ? (
          <InfoLegendBottomSheet />
        ) : (
          <Suspense
            fallback={
              <div className="w-[260px] h-[200px] bg-slate-900/40 rounded-lg animate-pulse absolute top-4 right-4" />
            }
          >
            <div className="absolute top-4 right-4 z-10 pointer-events-auto">
              <InfoLegendPanel />
            </div>
          </Suspense>
        )}
      </Suspense>

      {/* Bottom left: footer credit */}
      <div className="absolute bottom-4 left-4 z-10 text-xs text-slate-400">
        <p>
          © 2026{" "}
          <a
            href="https://naelaqel.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-200 transition-colors"
          >
            Nael Aqel
          </a>{" "}
          | Powered by{" "}
          <a
            href="https://pypi.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-200 transition-colors"
          >
            PyPI
          </a>{" "}
          &{" "}
          <a
            href="https://pypistats.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-200 transition-colors"
          >
            PyPI Stats
          </a>
        </p>
      </div>
    </div>
  );
}

export default AppShell;
