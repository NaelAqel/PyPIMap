import { useEffect } from "react";
import { useAppStore } from "../../store/appStore";

const TOOLS = [
  ["search_packages", "Search by package name or author"],
  ["package_info", "Metadata + Depends on / Used by counts"],
  ["package_depends_on", "What the package needs (graph)"],
  ["package_used_by", "Who needs the package (graph)"],
  ["last_update", "Pipeline freshness"],
];

const HOSTED_MCP = "https://mcp.pypimap.com/mcp";
const API_DOCS = "https://api.pypimap.com/docs";
const DOI_URL = "https://doi.org/10.34740/kaggle/ds/10945692";
const KAGGLE_URL =
  "https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data";
const MCP_REPO = "https://github.com/naelaqel/pypimap/tree/main/mcp";

/**
 * Agent-facing MCP docs. Same role as Guide: readable by humans + LLMs.
 * @param {{ embedded?: boolean }} props
 */
function McpPage({ embedded = false }) {
  const setActiveView = useAppStore((s) => s.setActiveView);

  useEffect(() => {
    if (embedded) return undefined;
    const title = "MCP | PyPIMap - agent tools over the public API";
    const desc =
      "Connect agents to PyPIMap via MCP - search packages, Depends on / Used by graphs, and freshness over the public API.";
    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const originalDesc = metaDesc ? metaDesc.getAttribute("content") : null;
    const originalCanonical = canonical
      ? canonical.getAttribute("href")
      : null;
    if (metaDesc) metaDesc.setAttribute("content", desc);
    if (canonical) canonical.setAttribute("href", "https://pypimap.com/mcp");
    return () => {
      document.title =
        "PyPIMap | Interactive map of the Python package ecosystem";
      if (metaDesc && originalDesc != null)
        metaDesc.setAttribute("content", originalDesc);
      if (canonical && originalCanonical != null)
        canonical.setAttribute("href", originalCanonical);
    };
  }, [embedded]);

  return (
    <div
      className={
        embedded
          ? "px-6 py-8 text-slate-200 max-w-3xl mx-auto"
          : "min-h-screen bg-slate-900 text-slate-200 px-6 py-12"
      }
    >
      <div className={embedded ? "space-y-10" : "max-w-3xl mx-auto space-y-10"}>
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
            Agents
          </p>
          <h1 className="text-3xl font-bold text-white">PyPIMap MCP</h1>
          <p className="text-slate-300 leading-relaxed mt-3">
            Read-only{" "}
            <a
              href="https://modelcontextprotocol.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              Model Context Protocol
            </a>{" "}
            tools over the public PyPIMap API. Interactive package lookup for
            agents - not a bulk catalog dump. Glossary matches the site:{" "}
            <strong>Depends on</strong> / <strong>Used by</strong>, optional,{" "}
            active_version.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Connect</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-2">
            <li>
              <span className="text-slate-400">Docs (this page):</span>{" "}
              <code className="text-sky-300 text-sm">/mcp</code>
            </li>
            <li>
              <span className="text-slate-400">Hosted MCP URL:</span>{" "}
              <code className="text-sky-300 text-sm break-all">{HOSTED_MCP}</code>
            </li>
            <li>
              <span className="text-slate-400">Local HTTP:</span>{" "}
              <code className="text-sky-300 text-sm">
                http://127.0.0.1:8765/mcp
              </code>
            </li>
          </ul>
          <p className="text-slate-400 text-sm mt-3">
            Local run:{" "}
            <code className="text-slate-300">
              pypimap-mcp --transport streamable-http --port 8765
            </code>
            . Stdio for Cursor / Claude Desktop - see the{" "}
            <a
              href={MCP_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              mcp/ README
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Tools</h2>
          <table className="w-full text-sm text-left text-slate-300 border border-slate-700 rounded-lg overflow-hidden">
            <tbody>
              {TOOLS.map(([tool, desc]) => (
                <tr key={tool} className="border-t border-slate-700">
                  <td className="p-3 font-mono text-xs text-sky-400">{tool}</td>
                  <td className="p-3">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Limits</h2>
          <p className="text-slate-300 leading-relaxed">
            Hosted / HTTP mode rate-limits by client IP (default{" "}
            <strong>60 requests/minute</strong>, <strong>2000/day</strong>). For
            bulk offline analysis use the{" "}
            <a
              href={KAGGLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              Kaggle dataset
            </a>{" "}
            · DOI{" "}
            <a
              href={DOI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              10.34740/kaggle/ds/10945692
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Also useful</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>
              <button
                type="button"
                onClick={() => setActiveView("guide")}
                className="text-sky-400 underline hover:text-sky-300"
              >
                Guide
              </button>{" "}
              - UI + glossary
            </li>
            <li>
              <a
                href={API_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline"
              >
                api.pypimap.com/docs
              </a>{" "}
              - interactive API
            </li>
            <li>
              <a href="/llms.txt" className="text-sky-400 underline">
                llms.txt
              </a>{" "}
              - agent-oriented site map
            </li>
          </ul>
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
            onClick={() => setActiveView("guide")}
            className="text-sky-400 underline hover:text-sky-300"
          >
            Open Guide →
          </button>
        </p>
      </div>
    </div>
  );
}

export default McpPage;
