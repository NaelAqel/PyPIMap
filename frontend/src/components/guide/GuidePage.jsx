import { useEffect } from "react";
import { useAppStore } from "../../store/appStore";

const DOI_URL = "https://doi.org/10.34740/kaggle/ds/10945692";
const KAGGLE_URL =
  "https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data";
const HOSTED_MCP = "https://mcp.pypimap.com/mcp";
const API_DOCS = "https://api.pypimap.com/docs";

/**
 * @param {{ embedded?: boolean }} props
 * embedded=true when rendered inside AppShell (no standalone document shell).
 */
function GuidePage({ embedded = false }) {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const pinOnGalaxy = useAppStore((s) => s.pinOnGalaxy);

  useEffect(() => {
    if (embedded) return undefined;
    const guideTitle = "Guide | PyPIMap - Depends on, Used by, and API";
    const guideDesc =
      "Learn how to use PyPIMap: Galaxy overview, pin panel Depends on / Used by, glossary (core vs optional, active_version), dataset DOI, and MCP/API pointers.";
    document.title = guideTitle;
    const metaDesc = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const originalDesc = metaDesc ? metaDesc.getAttribute("content") : null;
    const originalCanonical = canonical
      ? canonical.getAttribute("href")
      : null;
    if (metaDesc) metaDesc.setAttribute("content", guideDesc);
    if (canonical) canonical.setAttribute("href", "https://pypimap.com/guide");
    return () => {
      document.title =
        "PyPIMap | Interactive map of the Python package ecosystem";
      if (metaDesc && originalDesc)
        metaDesc.setAttribute("content", originalDesc);
      if (canonical && originalCanonical)
        canonical.setAttribute("href", originalCanonical);
    };
  }, [embedded]);

  return (
    <div
      className={
        embedded
          ? "text-slate-200 px-6 py-10"
          : "min-h-screen bg-slate-900 text-slate-200 px-6 py-12"
      }
    >
      <article className="max-w-3xl mx-auto space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-white">PyPIMap Guide</h1>
          <p className="text-slate-300 leading-relaxed mt-3">
            How to read the Galaxy map, use the pin panel, and call the public
            API. Search engines should index this Guide and the Landing page;
            package deep links are app URLs (not crawl targets).
          </p>
        </div>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            What is PyPIMap?
          </h2>
          <p className="text-slate-300 leading-relaxed">
            PyPIMap is an interactive map of the Python package (PyPI)
            dependency ecosystem. Browse the Galaxy overview, pin a package for
            its one-hop neighborhood (
            <strong className="text-white">Depends on</strong> /{" "}
            <strong className="text-white">Used by</strong>), and read package
            context with honest ecosystem metrics.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            Galaxy (landing)
          </h2>
          <p className="text-slate-300 leading-relaxed">
            The home view is <strong className="text-white">Galaxy</strong>: an
            overview of many packages with <em>no package selected</em> until
            you click or search. Search or click pins a package and opens its
            info panel (Depends on / Used by / metadata) on the same map. Use{" "}
            <em>Full view</em> after zooming to reset the camera to the whole
            map. First open shows a short tour near the controls (you can skip
            it anytime).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            Exploring a package
          </h2>
          <p className="text-slate-300 leading-relaxed mb-3">
            Start by searching for any package on PyPI. The pin panel shows
            metadata; Depends on / Used by appear as arrows on the map. Click a
            related package on the map to walk.
          </p>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>Search or click to pin on Galaxy and open the panel.</li>
            <li>Blue / green arrows on the map are Depends on / Used by.</li>
            <li>Click a related package on the map to re-pin and keep walking.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Glossary</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              <strong className="text-white">Depends on</strong> - packages the
              pinned package needs (also: dependencies, requires, needs,
              imports).
            </li>
            <li>
              <strong className="text-white">Used by</strong> - packages that
              need the pinned package (also: dependents, reverse deps, who
              uses).
            </li>
            <li>
              <strong className="text-white">optional</strong> - extras / non-
              required relationships (toggle in the pin panel); core edges are
              required.
            </li>
            <li>
              <strong className="text-white">active_version</strong> - under{" "}
              <a
                href="https://peps.python.org/pep-0440/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline"
              >
                PEP 440
              </a>
              , preferring a final release when one exists (same idea as the
              PyPI project page), not the most recently uploaded tag.
            </li>
          </ul>
          <p className="text-slate-300 leading-relaxed mt-3">
            Arrow direction: <strong className="text-white">A → B</strong> means
            B <em>Depends on</em> A.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            How to read the graph
          </h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              <strong className="text-white">Focused package</strong> (center) -
              the package you are viewing.
            </li>
            <li>
              <strong className="text-white">Depends on</strong> (blue, left) -
              packages the focused package needs.
            </li>
            <li>
              <strong className="text-white">Used by</strong> (green, right) -
              packages that need the focused package.
            </li>
            <li>
              <strong className="text-white">Solid lines</strong> - core
              (required) dependencies.
            </li>
            <li>
              <strong className="text-white">Dashed lines</strong> - optional
              dependencies.
            </li>
            <li>
              <strong className="text-white">Show more</strong> - loads the next
              batch of neighbors when a hub is dense (~36).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            Interactions
          </h2>
          <table className="w-full text-sm text-left text-slate-300 border border-slate-700 rounded-lg overflow-hidden">
            <tbody>
              {[
                [
                  "Click / search a package",
                  "Pin on Galaxy and open the info panel",
                ],
                [
                  "Click a related package on the map",
                  "Re-pin; edges and panel update",
                ],
                ["Full view", "Reset Galaxy zoom/pan to the whole map"],
                ["Clear pin", "Close the panel and clear the map pin"],
              ].map(([action, result]) => (
                <tr key={action} className="border-t border-slate-700">
                  <td className="p-3 font-medium text-white">{action}</td>
                  <td className="p-3">{result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            Data &amp; DOI
          </h2>
          <p className="text-slate-300 leading-relaxed">
            Package metadata and dependency graphs update once daily via an
            automated ETL pipeline (PyPI release metadata from BigQuery and
            active packages from the PyPI Simple API).
          </p>
          <p className="text-slate-400 text-sm mt-3">
            For offline analysis, the same daily dataset is on{" "}
            <a
              href={KAGGLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              Kaggle
            </a>
            . Cite{" "}
            <a
              href={DOI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              DOI 10.34740/kaggle/ds/10945692
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            Developer / API &amp; MCP
          </h2>
          <p className="text-slate-400 text-sm mb-3">
            Interactive API docs:{" "}
            <a
              href={API_DOCS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              api.pypimap.com/docs
            </a>
            .
          </p>
          <table className="w-full text-sm text-left text-slate-300 border border-slate-700 rounded-lg overflow-hidden">
            <tbody>
              {[
                ["GET /package/api/{name}", "Package metadata as JSON"],
                [
                  "GET /graph/{name}/depends-on",
                  "Depends on graph (nodes + edges)",
                ],
                [
                  "GET /graph/{name}/used-by",
                  "Used by graph (nodes + edges)",
                ],
                ["GET /search?q={query}", "Search packages by name or author"],
                ["GET /last_update", "Data freshness"],
              ].map(([endpoint, desc]) => (
                <tr key={endpoint} className="border-t border-slate-700">
                  <td className="p-3 font-mono text-xs text-sky-400">
                    {endpoint}
                  </td>
                  <td className="p-3">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            Agents: see{" "}
            <button
              type="button"
              onClick={() => setActiveView("mcp")}
              className="text-sky-400 underline hover:text-sky-300"
            >
              MCP docs
            </button>{" "}
            (<code className="text-slate-300 text-xs">/mcp</code>) - pick{" "}
            <strong className="text-slate-300">A</strong> hosted URL{" "}
            <code className="text-sky-300 text-xs break-all">{HOSTED_MCP}</code>{" "}
            or <strong className="text-slate-300">B</strong> local stdio. Tools
            wrap the same API - search, package info, Depends on, Used by, and
            last update.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Credits</h2>
          <p className="text-slate-300 leading-relaxed">
            Galaxy overview interaction is <em>inspired by</em>{" "}
            <a
              href="https://github.com/h9-tec/model-family-tree"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              Open Model Family Tree
            </a>{" "}
            (Model Galaxy). Different graph and layout - inspiration only.
          </p>
        </section>

        <p className="text-slate-500 text-sm pt-6 border-t border-slate-800 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => setActiveView("galaxy")}
            className="text-sky-400 underline hover:text-sky-300"
          >
            ← Back to Galaxy
          </button>
          <button
            type="button"
            onClick={() => pinOnGalaxy("requests", "requests")}
            className="text-sky-400 underline hover:text-sky-300"
          >
            Try pinning requests →
          </button>
          <button
            type="button"
            onClick={() => setActiveView("mcp")}
            className="text-sky-400 underline hover:text-sky-300"
          >
            MCP docs →
          </button>
          <a
            href="https://github.com/naelaqel/pypimap/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 underline"
          >
            Open an issue on GitHub
          </a>
        </p>
      </article>
    </div>
  );
}

export default GuidePage;
