// src/components/docs/GuidePage.jsx
import { useEffect } from "react";

function GuidePage() {
  useEffect(() => {
    document.title = "Guide | PyPiMap";
    const metaDesc = document.querySelector('meta[name="description"]');
    const original = metaDesc ? metaDesc.getAttribute("content") : null;
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Learn how to use PyPiMap | reading the dependency graph, interactions, API reference, and more.",
      );
    }
    return () => {
      document.title = "PyPiMap | Interactive Python Package Dependency Graph";
      if (metaDesc && original) metaDesc.setAttribute("content", original);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-12">
      <div className="max-w-3xl mx-auto space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-white">PyPiMap Guide</h1>
        </div>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            What is PyPiMap?
          </h2>
          <p className="text-slate-300 leading-relaxed">
            PyPiMap is an interactive visualization of the Python package
            dependency ecosystem on PyPI. Search any package to see its full
            dependency network rendered as a live, explorable graph — what it
            depends on (downstream) and what depends on it (upstream) — backed
            by data refreshed daily.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Architecture</h2>
          <img
            src="/assets/architecture.png"
            alt="PyPiMap system architecture: data pipeline, Postgres, FastAPI backend, React frontend, and deployment"
            className="w-full rounded-lg border border-slate-700"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            How to Read the Graph
          </h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              <strong className="text-white">Root node</strong> (white, center)
              - the package you're currently viewing.
            </li>
            <li>
              <strong className="text-white">Parent nodes</strong> (blue,
              upstream) - packages that depend on the root.
            </li>
            <li>
              <strong className="text-white">Child nodes</strong> (orange,
              downstream) - packages the root depends on.
            </li>
            <li>
              <strong className="text-white">Solid lines</strong> - core
              (required) dependencies.
            </li>
            <li>
              <strong className="text-white">Dashed lines</strong> - non-core
              (optional) dependencies.
            </li>
            <li>
              <strong className="text-white">Node size</strong> - reflects
              relative importance in the ecosystem.
            </li>
            <li>
              <strong className="text-white">"+N more" bubbles</strong> - a
              cluster of additional packages; click to reveal more.
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
                  "Single-click a node",
                  "Expand it - reveals more of its own upstream or downstream chain",
                ],
                [
                  "Double-click a node",
                  "Recenter - makes that package the new root",
                ],
                [
                  "Click a cluster bubble",
                  "Loads the next batch of hidden packages",
                ],
                [
                  "Drag a node",
                  "Moves it (and everything further out) to a new position",
                ],
                [
                  "Reset view button",
                  "Re-fits the camera without changing the root",
                ],
                ["Show non-core toggle", "Shows/hides optional dependencies"],
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
            Understanding the Numbers
          </h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              <strong className="text-white">
                Core dependents/dependencies
              </strong>{" "}
              - required relationships.
            </li>
            <li>
              <strong className="text-white">
                Non-core dependents/dependencies
              </strong>{" "}
              - optional relationships (extras, dev deps).
            </li>
            <li>
              <strong className="text-white">Importance score</strong> -
              relative centrality within the ecosystem.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            Data Freshness
          </h2>
          <p className="text-slate-300 leading-relaxed">
            All package metadata and dependency graphs are updated once daily
            via an automated ETL pipeline pulling from the official PyPI
            registry.
          </p>
          <p className="text-slate-400 text-sm mt-3">
            For deeper offline analysis (GNNs, large-scale graph algorithms,
            etc.), the same daily-updated dataset is available as a{" "}
            <a
              href="https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              Kaggle dataset
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Limitations</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              Graphs are capped at a maximum number of nodes per view; beyond
              this, packages appear as "+N more" clusters.
            </li>
            <li>
              Traversal depth is limited per request - deep chains may need
              multiple expand clicks.
            </li>
            <li>
              Extremely large ecosystems always require cluster pagination.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            API Reference
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Full interactive API documentation (try-it-yourself included) is
            available at{" "}
            <a
              href="https://api.pypimap.com/docs"
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
                [
                  "GET /package/{name}",
                  "Pre-rendered HTML page with SEO metadata",
                ],
                ["GET /package/api/{name}", "Package metadata as JSON"],
                [
                  "GET /graph/{name}/parents",
                  "Upstream dependency graph (nodes + edges)",
                ],
                [
                  "GET /graph/{name}/children",
                  "Downstream dependency graph (nodes + edges)",
                ],
                ["GET /search?q={query}", "Search packages by name or author"],
                ["GET /sitemap.xml", "Sitemap index for all indexed packages"],
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
        </section>

        <p className="text-slate-500 text-sm pt-6 border-t border-slate-800">
          Have a question not covered here?{" "}
          <a
            href="https://github.com/naelaqel/pypimap/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 underline"
          >
            Open an issue on GitHub
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export default GuidePage;
