import { useState } from "react";
import { useAppStore } from "../../store/appStore";

function Breadcrumbs() {
  const breadcrumbs = useAppStore((state) => state.breadcrumbs);
  const setFocusedPackage = useAppStore((state) => state.setFocusedPackage);
  const [showAll, setShowAll] = useState(false);

  if (breadcrumbs.length === 0) return null;

  const reversed = [...breadcrumbs].reverse(); // most recent first
  const visible = showAll ? reversed : reversed.slice(0, 1);

  return (
    <div className="text-sm text-slate-300">
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        Recently viewed
      </p>
      <ul className="space-y-1">
        {visible.map((crumb) => (
          <li key={crumb.id}>
            <button
              className="hover:text-white hover:underline truncate block w-full text-left"
              onClick={() => setFocusedPackage(crumb.id)}
              title={crumb.name}
            >
              {crumb.name}
            </button>
          </li>
        ))}
      </ul>
      {breadcrumbs.length > 1 && (
        <button
          className="text-xs text-sky-400 underline mt-1"
          onClick={() => setShowAll((prev) => !prev)}
        >
          {showAll ? "Show less" : `+${breadcrumbs.length - 1} more`}
        </button>
      )}
    </div>
  );
}

export default Breadcrumbs;
