import { useState, lazy, Suspense } from "react";
import { usePackageData } from "../../hooks/usePackageData";
const InfoLegendPanel = lazy(() => import("./InfoLegendPanel"));

function InfoLegendBottomSheet() {
  const { data, isLoading } = usePackageData();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`fixed left-0 right-0 bottom-0 z-20 bg-slate-900/90 backdrop-blur-sm rounded-t-2xl text-white transition-all duration-300 ${
        isExpanded ? "h-[60vh]" : "h-16"
      }`}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <p className="font-semibold">Details</p>
        <span className="text-slate-400 text-sm">
          {isExpanded ? "Hide ▼" : "Show ▲"}
        </span>
      </div>

      {isExpanded && (
        <div className="px-2 pb-4 overflow-y-auto h-[calc(60vh-3.5rem)] flex justify-center">
          <Suspense
            fallback={
              <div className="w-full h-32 bg-slate-800/50 animate-pulse rounded-lg" />
            }
          >
            <InfoLegendPanel />
          </Suspense>
        </div>
      )}
    </div>
  );
}

export default InfoLegendBottomSheet;
