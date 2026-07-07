import { useEffect, useState, useRef } from "react";
import {
  getGraphParents,
  getGraphChildren,
  getGraphSliceParents,
  getGraphSliceChildren,
} from "../api/endpoints";
import { useAppStore } from "../store/appStore";
import { NetworkError } from "../api/client";
import { transformInitialGraph, mergeExpansion } from "../utils/graphTransform";

const DEFAULT_DEPTH = 2;
const DEFAULT_NODE_CAP = 35;
const MAX_TOTAL_NODES = 500;

export function useGraphData() {
  const focusedPackageId = useAppStore((state) => state.focusedPackageId);
  const showNonCore = useAppStore((state) => state.showNonCore);
  const setFocusedPackage = useAppStore((state) => state.setFocusedPackage);
  const setError = useAppStore((state) => state.setError);

  const [rawParentData, setRawParentData] = useState(null);
  const [rawChildData, setRawChildData] = useState(null);
  const [fullGraphState, setFullGraphState] = useState({
    nodes: [],
    edges: [],
  });
  const [isLoading, setIsLoading] = useState(false);

  const clusterOffsets = useRef({});

  // --- Initial load: fetch both sides, merge once ---
  useEffect(() => {
    if (!focusedPackageId) return;
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      getGraphParents(focusedPackageId, {
        depth: DEFAULT_DEPTH,
        node_cap: DEFAULT_NODE_CAP,
        show_non_core: true,
      }),
      getGraphChildren(focusedPackageId, {
        depth: DEFAULT_DEPTH,
        node_cap: DEFAULT_NODE_CAP,
        show_non_core: true,
      }),
    ])
      .then(([parentResult, childResult]) => {
        if (cancelled) return;
        setRawParentData(parentResult);
        setRawChildData(childResult);

        const built = transformInitialGraph(parentResult, childResult, true);
        applyResult(built);
        clusterOffsets.current = {};
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setIsLoading(false);
        if (err instanceof NetworkError) {
          setError({ type: "network", message: err.message });
        } else {
          setError({ type: "warning", message: "Package not found." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [focusedPackageId]);

  function applyResult(built) {
    let { nodes, edges } = built;
    if (nodes.length > MAX_TOTAL_NODES) {
      nodes = nodes.slice(0, MAX_TOTAL_NODES);
      const ids = new Set(nodes.map((n) => n.id));
      edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
      setError({
        type: "warning",
        message: `Graph truncated to ${MAX_TOTAL_NODES} nodes to keep performance smooth.`,
      });
    }
    setFullGraphState({ nodes, edges });
  }

  // --- Expand a single node, one direction only ---
  async function expandNode(node, direction) {
    if (fullGraphState.nodes.length >= MAX_TOTAL_NODES) {
      setError({
        type: "warning",
        message:
          "Graph limit reached — double-click a node to focus and explore further.",
      });
      return { empty: true };
    }
    try {
      const fetcher =
        direction === "parent" ? getGraphParents : getGraphChildren;
      const result = await fetcher(node.id, {
        depth: 1,
        node_cap: DEFAULT_NODE_CAP,
        show_non_core: true,
      });

      // drop the echoed root (the clicked node itself) — we already have it on screen
      const newNodes = result.nodes.filter((n) => n.direction !== "root");
      const newEdges = result.edges;

      if (newNodes.length === 0) {
        return { empty: true };
      }

      setFullGraphState((prev) =>
        mergeExpansion(prev, node, newNodes, newEdges, {
          removeSourceNode: false,
        }),
      );
      return { empty: false };
    } catch (err) {
      if (err instanceof NetworkError) {
        setError({ type: "network", message: err.message });
      }
      return { empty: true };
    }
  }

  // --- Cluster "show more", one direction only (inferred from cluster id) ---
  async function loadMoreCluster(clusterNode) {
    const clusterId = clusterNode.id;
    const direction = clusterId.startsWith("cluster_p_") ? "parent" : "child";

    const existingCount = fullGraphState.nodes.filter((n) =>
      String(n.id).startsWith(String(clusterId)),
    ).length;
    const offset =
      clusterOffsets.current[clusterId] ??
      Math.max(existingCount, DEFAULT_NODE_CAP);

    if (fullGraphState.nodes.length >= MAX_TOTAL_NODES) {
      setError({
        type: "warning",
        message:
          "Graph limit reached — try focusing on a more specific package.",
      });
      return;
    }

    try {
      const fetcher =
        direction === "parent" ? getGraphSliceParents : getGraphSliceChildren;
      const result = await fetcher(clusterId, offset, {
        depth: DEFAULT_DEPTH,
        node_cap: DEFAULT_NODE_CAP,
        show_non_core: showNonCore,
      });

      setFullGraphState((prev) =>
        mergeExpansion(prev, clusterNode, result.nodes, result.edges, {
          removeSourceNode: true,
        }),
      );

      const newClusterNode = result.nodes.find((n) => n.is_cluster);
      if (newClusterNode) {
        clusterOffsets.current[newClusterNode.id] =
          offset + result.nodes.length;
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        setError({ type: "network", message: err.message });
      }
    }
  }

  const rootId = fullGraphState.nodes.find((n) => n.direction === "root")?.id;
  const visibleGraph = showNonCore
    ? fullGraphState
    : filterCoreOnly(fullGraphState, rootId);

  return {
    nodes: visibleGraph.nodes,
    edges: visibleGraph.edges,
    isLoading,
    loadMoreCluster,
    expandNode,
  };
}

function filterCoreOnly(graphState, rootId) {
  function edgeId(value) {
    return typeof value === "object" && value !== null ? value.id : value;
  }
  const coreEdges = graphState.edges.filter((e) => e.is_core);
  const adjacency = {};
  coreEdges.forEach((e) => {
    const s = edgeId(e.source);
    const t = edgeId(e.target);
    if (!adjacency[s]) adjacency[s] = [];
    if (!adjacency[t]) adjacency[t] = [];
    adjacency[s].push(t);
    adjacency[t].push(s);
  });
  const reachable = new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    (adjacency[current] || []).forEach((neighbor) => {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    });
  }
  const nodes = graphState.nodes.filter(
    (n) => n.direction === "root" || n.id === rootId || reachable.has(n.id),
  );

  return {
    nodes,
    edges: coreEdges.map((e) => ({
      ...e,
      source: edgeId(e.source),
      target: edgeId(e.target),
    })),
  };
}
