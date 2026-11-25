import { useEffect } from "react";

const TOOLS = [
  ["search_packages", "Search by package name or author"],
  ["package_info", "Metadata + Depends on / Used by counts"],
  ["package_depends_on", "What the package needs (graph)"],
  ["package_used_by", "Who needs the package (graph)"],
  ["last_update", "Pipeline freshness"],
];

function McpPage() {
  useEffect(() => {
    document.title = "MCP | PyPiMap";
    const metaDesc = document.querySelector('meta[name="description"]');
    const original = metaDesc ? metaDesc.getAttribute("content") : null;
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Connect agents to PyPIMap via MCP - search packages, Depends on / Used by graphs, and freshness over the public API.",
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
          <h1 className="text-3xl font-bold text-white">PyPIMap MCP</h1>
          <p className="text-slate-300 leading-relaxed mt-3">
            Read-only Model Context Protocol tools over the public PyPIMap API.
            Interactive package lookup for agents - not a bulk catalog dump.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">Connect</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-2">
            <li>
              <span className="text-slate-400">Docs (this page):</span>{" "}
              <a href="/mcp" className="text-sky-400 underline">
                pypimap.com/mcp
              </a>
            </li>
            <li>
              <span className="text-slate-400">Hosted MCP URL (when live):</span>{" "}
              <code className="text-sky-300 text-sm">
                https://mcp.pypimap.com/mcp
              </code>
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
            . Stdio install remains available for Cursor / Claude Desktop - see
            the{" "}
            <a
              href="https://github.com/naelaqel/pypimap/tree/main/mcp"
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
          <p className="text-slate-400 text-sm mb-3">
            Glossary matches the site: <strong>Depends on</strong> /{" "}
            <strong>Used by</strong>, optional, active_version.
          </p>
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
            <strong>60 requests/minute</strong>,{" "}
            <strong>2000/day</strong>). For bulk offline analysis use the{" "}
            <a
              href="https://www.kaggle.com/datasets/naelaqel/pypi-daily-metadata-and-analytics-base-dataset/data"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline"
            >
              Kaggle dataset
            </a>{" "}
            · DOI{" "}
            <a
              href="https://doi.org/10.34740/kaggle/ds/10945692"
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
              <a href="/guide" className="text-sky-400 underline">
                Guide
              </a>{" "}
              - UI + API overview
            </li>
            <li>
              <a
                href="https://api.pypimap.com/docs"
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
      </div>
    </div>
  );
}

export default McpPage;
