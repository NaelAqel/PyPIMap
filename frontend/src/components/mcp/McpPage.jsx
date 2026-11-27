import { useEffect } from "react";
import { useAppStore } from "../../store/appStore";

const TOOLS = [
  ["search_packages", "Search by package name or author"],
  [
    "package_info",
    "Metadata, Depends on / Used by counts, importance_score",
  ],
  [
    "package_depends_on",
    "What the package needs (also: dependencies, requires, imports)",
  ],
  [
    "package_used_by",
    "Who needs the package (also: dependents, reverse deps, who uses)",
  ],
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
      ? canonical.getAttribute("href") : null;
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
            MCP is a plug so an AI app can call PyPIMap tools (search,{" "}
            <strong>Depends on</strong>, <strong>Used by</strong>) instead of
            pasting API results by hand. Read-only{" "}
            <a
              href="https://modelcontextprotocol.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              Model Context Protocol
            </a>{" "}
            over the public API - interactive lookup, not a bulk catalog dump.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            Start here - pick A or B
          </h2>
          <ol className="list-decimal list-inside text-slate-300 space-y-3 leading-relaxed">
            <li>
              <strong className="text-white">A. Hosted URL</strong> - if the
              product has &quot;add remote MCP&quot; / &quot;server URL&quot;,
              paste{" "}
              <code className="text-sky-300 text-sm break-all">{HOSTED_MCP}</code>{" "}
              (streamable HTTP). Example: some ChatGPT plans.
            </li>
            <li>
              <strong className="text-white">B. Local install (stdio)</strong> -
              if the product only supports a local MCP server, install from the{" "}
              <a
                href={MCP_REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline"
              >
                mcp/ README
              </a>
              . Example: Cursor, Claude Desktop.
            </li>
          </ol>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            Gemini, Grok, DeepSeek, and others: use <strong>A</strong> if they
            offer a remote URL field, <strong>B</strong> if local only. No MCP
            in the product → use the{" "}
            <a
              href={API_DOCS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              public JSON API
            </a>
            . That is the client&apos;s limit, not &quot;MCP is down.&quot;
            Claude Desktop often rejects the hosted URL (client policy) - use
            B.
          </p>
          <p className="text-slate-500 text-sm mt-2">
            Local HTTP test:{" "}
            <code className="text-slate-400">
              pypimap-mcp --transport streamable-http --port 8765
            </code>{" "}
            →{" "}
            <code className="text-slate-400">http://127.0.0.1:8765/mcp</code>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Glossary</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-2 leading-relaxed">
            <li>
              <strong>Depends on</strong> - packages this one needs (also:
              dependencies, requires, needs, imports)
            </li>
            <li>
              <strong>Used by</strong> - packages that need this one (also:
              dependents, reverse deps, who uses)
            </li>
            <li>
              <strong>Core / optional</strong> - required vs extras edges
            </li>
            <li>
              <strong>active_version</strong> - PEP 440 active release (prefer
              final), not last upload time
            </li>
            <li>
              <strong>importance_score</strong> = used_by_core_counts + 0.3 x
              used_by_optional_counts
            </li>
            <li>
              <strong>parent / child</strong> - ambiguous; prefer Depends on /
              Used by
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">
            Short answer shape
          </h2>
          <p className="text-slate-400 text-sm mb-2 leading-relaxed">
            After <code className="text-slate-300">package_info</code>, agents
            should answer in a compact card (fill from tool JSON):
          </p>
          <pre className="text-xs text-slate-300 bg-slate-950/80 border border-slate-700 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">{`**{package_name}** is an active PyPI package (version {active_version}).
Author: {author}.
Depends on: {depends_on_core_counts} core / {depends_on_optional_counts} optional.
Used by: {used_by_core_counts} core / {used_by_optional_counts} optional.
Importance: {importance_score}.
Home: {home_page}
PyPIMap: https://pypimap.com/ (pin "{package_name}")
API: https://api.pypimap.com/package/api/{name}`}</pre>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            If they asked needs / dependencies, add a short{" "}
            <strong>Depends on</strong> list from{" "}
            <code className="text-slate-300">package_depends_on</code>. If who
            uses / reverse deps, add <strong>Used by</strong> from{" "}
            <code className="text-slate-300">package_used_by</code>.
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
