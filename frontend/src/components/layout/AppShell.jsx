import { useState, useEffect } from "react";
import SearchBar from "../search/SearchBar";
import GlobalNotificationBanner from "../common/GlobalNotificationBanner";
import { useAppStore } from "../../store/appStore";
import { getLastUpdate } from "../../api/endpoints";
import { formatDate } from "../../utils/formatDate";
import GuidePage from "../guide/GuidePage";
import McpPage from "../mcp/McpPage";
import GalaxyView from "../views/GalaxyView";

const DOI_URL = "https://doi.org/10.34740/kaggle/ds/10945692";
const GITHUB_URL = "https://github.com/naelaqel/PyPIMap";

function NavLink({ view, label, activeView, onNavigate }) {
  const isActive = activeView === view;
  return (
    <button
      type="button"
      onClick={() => onNavigate(view)}
      className={`shell-nav-link ${isActive ? "active" : ""}`}
      aria-current={isActive ? "page" : undefined}
    >
      {label}
    </button>
  );
}

function AppShell() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const galaxyPinId = useAppStore((s) => s.galaxyPinId);
  const focusedPackageId = useAppStore((s) => s.focusedPackageId);
  const errorState = useAppStore((s) => s.errorState);
  const isNetworkError = errorState && errorState.type === "network";

  const [lastUpdateDate, setLastUpdateDate] = useState(null);

  useEffect(() => {
    getLastUpdate()
      .then((data) => setLastUpdateDate(formatDate(data.last_updated_date)))
      .catch((err) =>
        console.log("getLastUpdate ERROR:", err.name, err.message),
      );
  }, []);

  useEffect(() => {
    const pin = galaxyPinId || focusedPackageId;
    if (activeView === "guide") {
      document.title = "Guide | PyPIMap - Depends on, Used by, and API";
    } else if (activeView === "mcp") {
      document.title = "MCP | PyPIMap - agent tools over the public API";
    } else if (pin) {
      document.title = `${pin} · Galaxy | PyPIMap`;
    } else {
      document.title =
        "PyPIMap | Interactive map of the Python package ecosystem";
    }
  }, [activeView, galaxyPinId, focusedPackageId]);

  function handleNav(view) {
    setActiveView(view);
  }

  const showSearch = activeView !== "guide" && activeView !== "mcp";
  const galaxyActive = activeView === "galaxy";

  return (
    <div className="shell-root">
      <nav className="shell-nav" aria-label="Primary">
        <button
          type="button"
          className="shell-brand"
          onClick={() => setActiveView("galaxy")}
          title="PyPIMap home - Galaxy"
        >
          PyPIMap
        </button>

        <NavLink
          view="galaxy"
          label="Galaxy"
          activeView={activeView}
          onNavigate={handleNav}
        />
        <NavLink
          view="guide"
          label="Guide"
          activeView={activeView}
          onNavigate={handleNav}
        />
        <button
          type="button"
          className={`shell-mcp ${activeView === "mcp" ? "active" : ""}`}
          onClick={() => handleNav("mcp")}
          aria-current={activeView === "mcp" ? "page" : undefined}
          title="Connect agents via MCP"
        >
          <svg
            className="shell-mcp-icon"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M12 2a3 3 0 0 1 3 3v1h2a3 3 0 0 1 3 3v2h1a2 2 0 0 1 0 4h-1v2a3 3 0 0 1-3 3h-2v1a3 3 0 1 1-6 0v-1H8a3 3 0 0 1-3-3v-2H4a2 2 0 1 1 0-4h1V6a3 3 0 0 1 3-3h2V5a3 3 0 0 1 3-3zm0 2a1 1 0 0 0-1 1v3H8a1 1 0 0 0-1 1v2H5v0h2v2a1 1 0 0 0 1 1h3v3a1 1 0 1 0 2 0v-3h3a1 1 0 0 0 1-1v-2h2v0h-2V8a1 1 0 0 0-1-1h-3V5a1 1 0 0 0-1-1z"
            />
          </svg>
          <span>Connect MCP</span>
        </button>

        <a
          className="shell-ext"
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <a
          className="shell-ext"
          data-nav="doi"
          href={DOI_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Dataset DOI"
        >
          DOI
        </a>
        <span className="shell-fresh" title="Last dataset update">
          Updated: {lastUpdateDate || "-"} UTC
        </span>

        {showSearch && (
          <div className="shell-search">
            <SearchBar />
          </div>
        )}
      </nav>

      <GlobalNotificationBanner />

      <main className="shell-main">
        {/* Keep Galaxy mounted (hidden) so camera survives Guide/MCP round-trips */}
        {!isNetworkError && <GalaxyView active={galaxyActive} />}
        {activeView === "guide" && (
          <div className="shell-guide-scroll">
            <GuidePage embedded />
          </div>
        )}
        {activeView === "mcp" && (
          <div className="shell-guide-scroll">
            <McpPage embedded />
          </div>
        )}
      </main>

      <footer className="shell-footer">
        © 2026{" "}
        <a
          href="https://naelaqel.com?utm_source=pypimap&utm_medium=footer"
          target="_blank"
          rel="noopener noreferrer"
        >
          Nael Aqel
        </a>{" "}
        ·{" "}
        <a href="https://pypi.org" target="_blank" rel="noopener noreferrer">
          PyPI
        </a>{" "}
        &amp;{" "}
        <a
          href="https://pypistats.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          PyPI Stats
        </a>{" "}
        · Galaxy inspired by{" "}
        <a
          href="https://github.com/h9-tec/model-family-tree"
          target="_blank"
          rel="noopener noreferrer"
        >
          Model Galaxy
        </a>{" "}
        ·{" "}
        <a href={DOI_URL} target="_blank" rel="noopener noreferrer">
          DOI
        </a>
      </footer>
    </div>
  );
}

export default AppShell;
