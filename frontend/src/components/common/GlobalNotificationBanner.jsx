import { useEffect, useState } from "react";
import { useAppStore } from "../../store/appStore";

function GlobalNotificationBanner() {
  const errorState = useAppStore((state) => state.errorState);
  const setError = useAppStore((state) => state.setError);
  const toastMessage = useAppStore((state) => state.toastMessage);
  const setToastMessage = useAppStore((state) => state.setToastMessage);
  const focusedPackageId = useAppStore((state) => state.focusedPackageId);
  const setFocusedPackage = useAppStore((state) => state.setFocusedPackage);

  const [browserWarning, setBrowserWarning] = useState(null);
  const [browserDismissed, setBrowserDismissed] = useState(false);
  const [mobileWarning, setMobileWarning] = useState(null);
  const [mobileDismissed, setMobileDismissed] = useState(false);

  // Environment checks (low priority warning)
  useEffect(() => {
    if (navigator.brave && typeof navigator.brave.isBrave === "function") {
      navigator.brave.isBrave().then((isBrave) => {
        if (isBrave)
          setBrowserWarning(
            "Brave's Shields may limit graph interactions. For the best experience, consider disabling Shields for this site.",
          );
      });
    }
    if (window.innerWidth < 769) {
      setMobileWarning(
        "Some features work best on a larger screen, try desktop for the full experience.",
      );
    }
  }, []);

  // Auto-dismiss logic for temporary warning alerts (like graph limits or 404s)
  useEffect(() => {
    if (toastMessage || (errorState && errorState.type !== "network")) {
      const timer = setTimeout(() => {
        setToastMessage(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage, errorState, setToastMessage, setError]);

  // Determine active notification based on priority severity
  let currentContent = null;
  let bannerType = "info"; // info, warning, error

  if (errorState && errorState.type === "network") {
    bannerType = "error";
    currentContent = (
      <div className="flex items-center justify-between w-full gap-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          <span className="font-medium">System Error</span>
        </div>
        <span>Connection lost. Check your network.</span>
        <button
          onClick={() => {
            setError(null);
            const idToRestore = focusedPackageId;
            setFocusedPackage(null);
            setTimeout(() => setFocusedPackage(idToRestore), 0);
          }}
          className="bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded text-white font-medium transition"
        >
          Retry
        </button>
      </div>
    );
  } else if (errorState || toastMessage) {
    bannerType = "warning";
    currentContent = (
      <div className="flex items-center justify-between w-full gap-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          <span className="font-medium text-slate-400">Warning</span>
        </div>
        <span>{toastMessage || errorState?.message}</span>
        <button
          onClick={() => {
            setToastMessage(null);
            setError(null);
          }}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors flex items-center justify-center"
          aria-label="Dismiss"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    );
  }

  if (!currentContent) return null;

  // Dynamic status border colors mapping
  const borderColors = {
    error: "border-red-500/20 shadow-red-950/10 text-slate-200",
    warning: "border-amber-500/20 shadow-amber-950/10 text-slate-200",
    info: "border-slate-800 text-slate-200",
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-2 w-full max-w-[340px] flex flex-col gap-2 pointer-events-none">
      <div
        className={`bg-[#161b26]/90 backdrop-blur-xl border ${borderColors[bannerType]} 
          shadow-xl rounded-xl pl-3 pr-2 py-2.5 text-[11px] tracking-wide flex flex-col gap-1.5 justify-between 
          transition-all duration-200 pointer-events-auto`}
      >
        {currentContent}
      </div>
    </div>
  );
}

export default GlobalNotificationBanner;
