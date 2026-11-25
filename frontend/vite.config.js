import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALAXY_ARTIFACTS = path.resolve(
  __dirname,
  "../pipeline/artifacts/galaxy",
);

/** Cached search_index bytes - scan one id without JSON.parse of the whole file. */
let searchIndexBuf = null;

function locateInSearchIndex(id) {
  const indexPath = path.join(GALAXY_ARTIFACTS, "tiles/search_index.json");
  if (!fs.existsSync(indexPath)) return null;
  const raw = String(id || "").trim().toLowerCase();
  if (!raw || raw.length > 214) return null;
  if (!searchIndexBuf) searchIndexBuf = fs.readFileSync(indexPath);
  const needle = Buffer.from(`"id":"${raw}"`);
  const at = searchIndexBuf.indexOf(needle);
  if (at < 0) return null;
  const start = searchIndexBuf.lastIndexOf(0x7b /* { */, at);
  const end = searchIndexBuf.indexOf(0x7d /* } */, at);
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(searchIndexBuf.subarray(start, end + 1).toString("utf8"));
  } catch {
    return null;
  }
}

/** Dev-only: serve D-Data galaxy artifacts at /galaxy/* (same contract as D-API mount). */
function galaxyArtifactsPlugin() {
  return {
    name: "galaxy-artifacts-static",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/galaxy/") && url !== "/galaxy") {
          next();
          return;
        }

        // Lightweight single-package lookup - never ship the 84MB index to the browser.
        const pathOnly = url.split("?")[0];
        if (pathOnly === "/galaxy/locate") {
          const q = new URL(url, "http://localhost").searchParams.get("id");
          const hit = locateInSearchIndex(q);
          res.setHeader("Content-Type", "application/json");
          if (!hit) {
            res.statusCode = 404;
            res.end(JSON.stringify({ detail: "Not Found" }));
            return;
          }
          res.end(JSON.stringify(hit));
          return;
        }

        const rel = decodeURIComponent(
          url.replace(/^\/galaxy\/?/, "").split("?")[0],
        );
        if (rel.includes("..")) {
          res.statusCode = 400;
          res.end("bad path");
          return;
        }
        // Block accidental browser fetches of the giant indexes.
        if (
          rel === "tiles/search_index.json" ||
          rel === "tiles/neighbors.json"
        ) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              detail:
                "Use /galaxy/locate?id=... for pins. Full search_index/neighbors are not served to the browser.",
            }),
          );
          return;
        }
        const filePath = path.join(GALAXY_ARTIFACTS, rel || "");
        if (!filePath.startsWith(GALAXY_ARTIFACTS)) {
          res.statusCode = 400;
          res.end("bad path");
          return;
        }
        fs.stat(filePath, (err, st) => {
          if (err || !st.isFile()) {
            res.statusCode = 404;
            res.end("not found");
            return;
          }
          if (filePath.endsWith(".json")) {
            res.setHeader("Content-Type", "application/json");
          }
          fs.createReadStream(filePath).pipe(res);
        });
      });
    },
  };
}

const API_TARGET = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss(), galaxyArtifactsPlugin()],
  envDir: ".",
  server: {
    host: true,
    port: 3000,
    watch: {
      usePolling: true,
    },
    // When VITE_API_URL is empty, apiFetch uses same-origin → these proxies
    proxy: {
      "/search": { target: API_TARGET, changeOrigin: true },
      "/package": { target: API_TARGET, changeOrigin: true },
      "/graph": { target: API_TARGET, changeOrigin: true },
      "/last_update": { target: API_TARGET, changeOrigin: true },
    },
  },
});
