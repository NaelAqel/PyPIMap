import { usePackageData } from "../../hooks/usePackageData";
import { formatDate } from "../../utils/formatDate";
import { authorOrFallback } from "../../utils/nullGuards";
import MetricsGrid from "../panel/MetricsGrid";

function isHomepageUsable(value) {
  return value && String(value).toLowerCase() !== "not available";
}

function EmptyField({ label, value = "-" }) {
  return (
    <p className="explorer-card-line">
      {label}: <span className="explorer-card-muted">{value}</span>
    </p>
  );
}

/**
 * Honest package card - fields from `/package/api/{name}` only.
 * Empty selection still shows field titles with blank values.
 */
function ExplorerPackageCard({
  focusedPackageId,
  notFound = false,
  variant = "panel",
}) {
  const { data, isLoading, error } = usePackageData();

  if (!focusedPackageId) {
    return (
      <div className={`explorer-card explorer-card--${variant}`}>
        <h2 className="explorer-card-title explorer-card-title--empty">
          Package
        </h2>
        <EmptyField label="Author" />
        <EmptyField label="Links" />
        <div className="explorer-card-dates">
          <div>
            Active version: <span className="explorer-card-muted">-</span>
          </div>
          <div>
            Releases: <span className="explorer-card-muted">-</span>
          </div>
          <div>
            First upload: <span className="explorer-card-muted">-</span>
          </div>
          <div>
            Last upload: <span className="explorer-card-muted">-</span>
          </div>
        </div>
        <MetricsGrid
          depends_on_core_counts="-"
          depends_on_optional_counts="-"
          used_by_core_counts="-"
          used_by_optional_counts="-"
        />
      </div>
    );
  }

  if (notFound || (error && error.name === "NotFoundError")) {
    return (
      <div className={`explorer-card explorer-card--${variant}`}>
        <h2 className="explorer-card-title">{focusedPackageId}</h2>
        <p className="explorer-card-muted">
          Package not found in the registry. Check the name or pick another
          from Galaxy.
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className={`explorer-card explorer-card--${variant}`}>
        <h2 className="explorer-card-title">{focusedPackageId}</h2>
        <EmptyField label="Author" value="…" />
        <EmptyField label="Links" value="…" />
        <div className="explorer-card-dates">
          <div>
            Active version: <span className="explorer-card-muted">…</span>
          </div>
          <div>
            Releases: <span className="explorer-card-muted">…</span>
          </div>
          <div>
            First upload: <span className="explorer-card-muted">…</span>
          </div>
          <div>
            Last upload: <span className="explorer-card-muted">…</span>
          </div>
        </div>
        <MetricsGrid
          depends_on_core_counts="…"
          depends_on_optional_counts="…"
          used_by_core_counts="…"
          used_by_optional_counts="…"
        />
      </div>
    );
  }

  const name = data.name || focusedPackageId;
  const title = data.package_name || name;

  return (
    <div className={`explorer-card explorer-card--${variant}`}>
      <h2 className="explorer-card-title" title={title}>
        {title}
      </h2>
      <p className="explorer-card-line">
        Author: {authorOrFallback(data.author)}
      </p>
      <p className="explorer-card-line">
        Links:{" "}
        <a
          href={`https://pypi.org/project/${name}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          PyPI
        </a>
        {" · "}
        <a
          href={`https://pypistats.org/packages/${name}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Stats
        </a>
        {isHomepageUsable(data.home_page) && (
          <>
            {" · "}
            <a
              href={data.home_page}
              target="_blank"
              rel="noopener noreferrer"
            >
              Home
            </a>
          </>
        )}
      </p>
      <div className="explorer-card-dates">
        <div>Active version: {data.active_version ?? "-"}</div>
        <div>Releases: {data.releases_count ?? "-"}</div>
        <div>First upload: {formatDate(data.first_upload_date)} UTC</div>
        <div>Last upload: {formatDate(data.last_upload_date)} UTC</div>
      </div>
      <MetricsGrid
        depends_on_core_counts={data.depends_on_core_counts ?? 0}
        depends_on_optional_counts={data.depends_on_optional_counts ?? 0}
        used_by_core_counts={data.used_by_core_counts ?? 0}
        used_by_optional_counts={data.used_by_optional_counts ?? 0}
      />
    </div>
  );
}

export default ExplorerPackageCard;
