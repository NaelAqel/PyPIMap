import { usePackageData } from "../../hooks/usePackageData";
import { formatDate } from "../../utils/formatDate";
import { authorOrFallback } from "../../utils/nullGuards";
import MetricsGrid from "./MetricsGrid";
import Legend from "../graph/Legend";

function isHomepageUsable(value) {
  return value && value.toLowerCase() !== "not available";
}

function InfoLegendPanel() {
  const { data, isLoading } = usePackageData();

  return (
    <div className="bg-slate-900/70 backdrop-blur-sm rounded-lg p-4 w-[260px] text-white space-y-4">
      {isLoading || !data ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-5 bg-slate-700 rounded w-3/4" />
          <div className="h-3 bg-slate-700 rounded w-1/2" />
          <div className="h-3 bg-slate-700 rounded w-2/3" />
        </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold truncate">
            {data.package_name}
          </h2>
          <p className="text-sm text-slate-300">
            Author: {authorOrFallback(data.author)}
          </p>

          <p className="text-sm text-slate-300">
            Links:{" "}
            <a
              href={`https://pypi.org/project/${data.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              PyPI
            </a>
            {"  |  "}
            <a
              href={`https://pypistats.org/packages/${data.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              Stats
            </a>
            {isHomepageUsable(data.home_page) && (
              <>
                {"  |  "}
                <a
                  href={data.home_page}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 underline"
                >
                  Home Page
                </a>
              </>
            )}
          </p>

          <div className="text-xs text-slate-400 space-y-0.5">
            <div>Last version: {data.last_version}</div>
            <div>Releases: {data.releases_count}</div>
            <div>First upload: {formatDate(data.first_upload_date)} UTC</div>
            <div>Last upload: {formatDate(data.last_upload_date)} UTC</div>
          </div>
          <MetricsGrid
            parent_core_counts={data.parent_core_counts ?? 0}
            parent_non_core_counts={data.parent_non_core_counts ?? 0}
            children_core_counts={data.children_core_counts ?? 0}
            children_non_core_counts={data.children_non_core_counts ?? 0}
          />
        </>
      )}

      <div className="border-t border-slate-700 pt-3">
        <Legend />
      </div>
    </div>
  );
}

export default InfoLegendPanel;
