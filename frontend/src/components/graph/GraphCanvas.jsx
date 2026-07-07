import { useMemo, useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useGraphData } from "../../hooks/useGraphData";
import { useAppStore } from "../../store/appStore";
import { drawClusterNode } from "./ClusterNode";

const CLICK_DELAY = 250;
function sortByImportance(nodeList) {
  return [...nodeList].sort(
    (a, b) => (a.importance_score || 0) - (b.importance_score || 0),
  );
}
function edgeEndpointId(value) {
  return typeof value === "object" && value !== null ? value.id : value;
}
function getSubtreeIds(startId, links, allNodesById) {
  const startNode = allNodesById[startId];
  if (!startNode) return new Set([startId]);
  const outward = {};
  links.forEach((e) => {
    const s = edgeEndpointId(e.source);
    const t = edgeEndpointId(e.target);
    const from = e.direction === "parent" ? t : s;
    const to = e.direction === "parent" ? s : t;
    if (!outward[from]) outward[from] = [];
    outward[from].push(to);
  });
  const visited = new Set([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift();
    (outward[current] || []).forEach((next) => {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    });
  }
  return visited;
}
function GraphCanvas() {
  const { nodes, edges, loadMoreCluster, expandNode } = useGraphData();
  const fgRef = useRef();
  const clickTimer = useRef(null);
  const hasFitOnce = useRef(false);
  const setFocusedPackage = useAppStore((state) => state.setFocusedPackage);
  const addBreadcrumb = useAppStore((state) => state.addBreadcrumb);
  const focusedPackageId = useAppStore((state) => state.focusedPackageId);
  const showNonCore = useAppStore((state) => state.showNonCore);
  const [loadingNodeId, setLoadingNodeId] = useState(null);
  const [emptyHintNodeId, setEmptyHintNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [hasClickedOnce, setHasClickedOnce] = useState(
    () => localStorage.getItem("pypimap_hint_seen") === "true",
  );
  const spawnTimes = useRef({});
  const [, forceTick] = useState(0);
  const dragSubtree = useRef(null);
  const dragLastPos = useRef(null);

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const graphData = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    const safeEdges = edges.filter(
      (e) =>
        nodeIds.has(edgeEndpointId(e.source)) &&
        nodeIds.has(edgeEndpointId(e.target)),
    );
    const now = performance.now();
    nodes.forEach((n) => {
      if (!(n.id in spawnTimes.current)) spawnTimes.current[n.id] = now;
    });
    const visibleNodes = nodes.filter((n) => {
      if (!n.is_cluster) return true;
      const activeCount = showNonCore
        ? n.remaining_total_count
        : n.remaining_core_count;
      return activeCount === undefined || activeCount > 0;
    });
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const finalEdges = safeEdges.filter(
      (e) =>
        visibleIds.has(edgeEndpointId(e.source)) &&
        visibleIds.has(edgeEndpointId(e.target)),
    );
    return { nodes: sortByImportance(visibleNodes), links: finalEdges };
  }, [nodes, edges, showNonCore]);

  const hoveredEdgeKeys = useMemo(() => {
    if (!hoveredNodeId) return new Set();
    const keys = new Set();
    graphData.links.forEach((e) => {
      const s = edgeEndpointId(e.source);
      const t = edgeEndpointId(e.target);
      if (s === hoveredNodeId || t === hoveredNodeId) keys.add(`${s}->${t}`);
    });
    return keys;
  }, [hoveredNodeId, graphData.links]);

  useEffect(() => {
    function handleResize() {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force("charge").strength(-100);
      fgRef.current.d3Force("link").distance(90);
      fgRef.current.d3Force("charge").distanceMax(300);
      fgRef.current.d3Force("center", null);
    }
  }, []);

  useEffect(() => {
    let raf;
    const GROW_DURATION = 500;
    const SETTLE_DURATION = 1500;
    function tick() {
      const now = performance.now();
      graphData.nodes.forEach((n) => {
        const spawnTime = spawnTimes.current[n.id];
        if (
          spawnTime &&
          n.fx === undefined &&
          now - spawnTime > SETTLE_DURATION &&
          n.direction !== "root"
        ) {
          n.fx = n.x;
          n.fy = n.y;
        }
      });
      const stillAnimating = Object.values(spawnTimes.current).some(
        (t) => now - t < GROW_DURATION,
      );
      const stillSettling = graphData.nodes.some((n) => {
        const spawnTime = spawnTimes.current[n.id];
        return (
          spawnTime && n.fx === undefined && now - spawnTime < SETTLE_DURATION
        );
      });
      if (stillAnimating || stillSettling) {
        forceTick((x) => x + 1);
        raf = requestAnimationFrame(tick);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [nodes, graphData.nodes]);

  useEffect(() => {
    hasFitOnce.current = false;
  }, [focusedPackageId]);

  function showEmptyHint(nodeId) {
    setEmptyHintNodeId(nodeId);
    setTimeout(
      () =>
        setEmptyHintNodeId((current) => (current === nodeId ? null : current)),
      1800,
    );
  }

  async function recenter(node) {
    setFocusedPackage(node.id, node.package_name);
    addBreadcrumb(node.id, node.package_name);
  }

  async function expand(node) {
    if (loadingNodeId) return;
    setLoadingNodeId(node.id);
    let result;
    if (node.is_cluster) {
      result = await loadMoreCluster(node);
    } else {
      const direction = node.direction === "parent" ? "parent" : "child";
      result = await expandNode(node, direction);
    }
    setLoadingNodeId(null);
    if (result && result.empty) {
      showEmptyHint(node.id);
    }
  }

  function handleNodeClick(node) {
    if (node.direction === "root") return;
    if (!hasClickedOnce) {
      setHasClickedOnce(true);
      localStorage.setItem("pypimap_hint_seen", "true");
    }
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      if (!node.is_cluster) recenter(node);
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      expand(node);
    }, CLICK_DELAY);
  }

  function handleNodeDrag(node) {
    setHoveredNodeId(null);
    if (node.direction === "root") return;
    if (!dragSubtree.current) {
      const nodesById = {};
      graphData.nodes.forEach((n) => {
        nodesById[n.id] = n;
      });
      dragSubtree.current = getSubtreeIds(node.id, graphData.links, nodesById);
      dragLastPos.current = { x: node.x, y: node.y };
      return;
    }
    const dx = node.x - dragLastPos.current.x;
    const dy = node.y - dragLastPos.current.y;
    dragSubtree.current.forEach((id) => {
      if (id === node.id) return;
      const n = graphData.nodes.find((gn) => gn.id === id);
      if (n) {
        n.x += dx;
        n.y += dy;
        n.fx = n.x;
        n.fy = n.y;
      }
    });
    dragLastPos.current = { x: node.x, y: node.y };
  }

  function handleNodeDragEnd(node) {
    if (node.direction === "root") {
      node.fx = 0;
      node.fy = 0;
    } else {
      node.fx = node.x;
      node.fy = node.y;
      if (dragSubtree.current) {
        dragSubtree.current.forEach((id) => {
          if (id === node.id) return;
          const n = graphData.nodes.find((gn) => gn.id === id);
          if (n) {
            n.fx = n.x;
            n.fy = n.y;
          }
        });
      }
      dragSubtree.current = null;
      dragLastPos.current = null;
    }
  }

  return (
    <div
      className="absolute inset-0"
      style={{ cursor: hoveredNodeId ? "pointer" : "default" }}
      onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
    >
      <button
        onClick={() => fgRef.current && fgRef.current.zoomToFit(400, 50)}
        className="absolute top-4 right-4 md:right-auto md:left-1/2 md:-translate-x-1/2 z-10 rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 shadow-lg hover:bg-white"
      >
        Reset view
      </button>
      {hoveredNodeId &&
        (() => {
          const node = graphData.nodes.find((n) => n.id === hoveredNodeId);
          if (!node || node.direction === "root") return null;
          return (
            <div
              className="pointer-events-none absolute z-10 rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg"
              style={{ left: hoverPos.x + 14, top: hoverPos.y + 14 }}
            >
              <div className="font-medium">{node.package_name}</div>
              {!hasClickedOnce && (
                <div className="mt-0.5 text-slate-300">
                  Click to expand • Double-click to focus
                </div>
              )}
            </div>
          );
        })()}
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#1e293b"
        onNodeClick={handleNodeClick}
        onNodeHover={(node) => setHoveredNodeId(node ? node.id : null)}
        onNodeDrag={handleNodeDrag}
        onNodeDragEnd={handleNodeDragEnd}
        onEngineStop={() => {
          if (fgRef.current && !hasFitOnce.current) {
            hasFitOnce.current = true;
            fgRef.current.zoomToFit(400, 50);
          }
        }}
        nodeId="id"
        nodeLabel={() => ""}
        pixelRatio={1}
        nodeRelSize={6}
        nodeVal={(node) => (node.direction === "root" ? 12 : node.radius)}
        linkColor={(link) => {
          const s = edgeEndpointId(link.source);
          const t = edgeEndpointId(link.target);
          return hoveredEdgeKeys.has(`${s}->${t}`) ? "#f8fafc" : link.color;
        }}
        linkWidth={(link) => {
          const s = edgeEndpointId(link.source);
          const t = edgeEndpointId(link.target);
          return hoveredEdgeKeys.has(`${s}->${t}`) ? 2.5 : 1;
        }}
        linkLineDash={(link) => (link.dashed ? [4, 2] : null)}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0}
        cooldownTicks={40}
        cooldownTime={1500}
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.4}
        nodeCanvasObjectMode={() => "replace"}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const isLoadingThis = node.id === loadingNodeId;
          const isHovered = node.id === hoveredNodeId;
          const GROW_DURATION = 500;
          const spawnTime = spawnTimes.current[node.id] || 0;
          const age = performance.now() - spawnTime;
          const growProgress = Math.min(age / GROW_DURATION, 1);
          const easedProgress = 1 - Math.pow(1 - growProgress, 3);
          if (node.is_cluster) {
            drawClusterNode(node, ctx, isLoadingThis, globalScale, showNonCore);
            return;
          }
          const baseRadius = node.direction === "root" ? 20 : node.radius;
          const fixedRadius =
            ((isHovered ? baseRadius * 1.15 : baseRadius) * easedProgress) /
            globalScale;
          ctx.beginPath();
          ctx.arc(node.x, node.y, fixedRadius, 0, 2 * Math.PI);
          ctx.fillStyle = isLoadingThis ? "#475569" : node.color;
          ctx.globalAlpha =
            (isHovered ? Math.min(node.opacity + 0.25, 1) : node.opacity) *
            easedProgress;
          ctx.fill();
          if (isHovered) {
            ctx.beginPath();
            ctx.arc(
              node.x,
              node.y,
              fixedRadius + 2 / globalScale,
              0,
              2 * Math.PI,
            );
            ctx.strokeStyle = "#f8fafc";
            ctx.lineWidth = 1.5 / globalScale;
            ctx.globalAlpha = 0.8;
            ctx.stroke();
          }
          if (isLoadingThis) {
            ctx.beginPath();
            ctx.arc(
              node.x,
              node.y,
              fixedRadius + 3 / globalScale,
              0,
              2 * Math.PI,
            );
            ctx.strokeStyle = "#94a3b8";
            ctx.lineWidth = 1.5 / globalScale;
            ctx.stroke();
          }
          const label =
            node.id === emptyHintNodeId
              ? "No more connections"
              : node.package_name;
          const fontSize = 10 / globalScale;
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = node.id === emptyHintNodeId ? "#fbbf24" : "white";
          ctx.textAlign = "center";
          ctx.globalAlpha = easedProgress;
          ctx.fillText(label, node.x, node.y + fixedRadius + fontSize);
        }}
      />
    </div>
  );
}
export default GraphCanvas;
