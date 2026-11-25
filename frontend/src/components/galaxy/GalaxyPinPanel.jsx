import { useAppStore } from "../../store/appStore";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import ExplorerPackageCard from "../explorer/ExplorerPackageCard";
import "../../explorer.css";

/**
 * Galaxy side card - package meta + edge legend + optional toggle.
 * Map stage ends at this column (not drawn underneath).
 */
function GalaxyPinPanel() {
  const galaxyPinId = useAppStore((s) => s.galaxyPinId);
  const focusedPackageId = useAppStore((s) => s.focusedPackageId);
  const showOptional = useAppStore((s) => s.showOptional);
  const toggleShowOptional = useAppStore((s) => s.toggleShowOptional);
  const pinId = galaxyPinId || focusedPackageId;
  const isMobile = useMediaQuery();

  return (
    <aside
      className={`galaxy-side ${isMobile ? "galaxy-side--sheet" : ""} ${
        pinId ? "" : "galaxy-side--empty"
      }`}
      aria-label={pinId ? `Package ${pinId}` : "Package details"}
    >
      <div className="galaxy-side-card">
        <ExplorerPackageCard
          focusedPackageId={pinId}
          variant={isMobile ? "sheet" : "panel"}
        />
      </div>
      <div className="galaxy-side-legend">
        <label className="galaxy-optional-toggle">
          <input
            type="checkbox"
            checked={showOptional}
            onChange={() => toggleShowOptional()}
          />
          <span>Show optional</span>
        </label>
        <div>
          <span className="galaxy-swatch galaxy-swatch--depends" />
          <span>
            <strong>Depends on</strong> - arrow into pin
          </span>
        </div>
        <div>
          <span className="galaxy-swatch galaxy-swatch--used" />
          <span>
            <strong>Used by</strong> - arrow out of pin
          </span>
        </div>
        <div>
          <span className="galaxy-swatch galaxy-swatch--optional" aria-hidden />
          <span>
            <strong>Optional</strong> - dashed edge
          </span>
        </div>
        <div>
          <span className="galaxy-swatch galaxy-swatch--pin" />
          <span>
            <strong>Pinned</strong> package
          </span>
        </div>
      </div>
    </aside>
  );
}

export default GalaxyPinPanel;
