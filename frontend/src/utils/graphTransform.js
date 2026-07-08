import { calculateInitialLayout, calculateBranchExpansion } from "./treeLayout";
const COLORS = {
  root: "#f8fafc",
  parent: "#38bdf8",
  child: "#fb923c",
};
function opacityForLevel(level) {
  if (level === 0) return 1.0;
  if (level === 1) return 0.55;
  return 0.25;
}
function edgeOpacity(fromNode, toNode) {
  const a = opacityForLevel(fromNode?.level ?? 0);
  const b = opacityForLevel(toNode?.level ?? 0);
  return Math.min(a, b);
}
function colorForNode(node) {
  return COLORS[node.direction] || "#94a3b8";
}
function clusterRadius(node) {
  const count = node.importance_score ? Number(node.importance_score) : 1;
  return 8 + 4 * Math.log2(count + 1);
}
function importanceRadius(node) {
  if (node.direction === "root") return 12;
  const score = node.importance_score || 0;
  if (score === 0) return 3;
  if (score <= 2) return 4.5;
  if (score <= 8) return 7;
  if (score <= 20) return 10;
  return 14;
}
function styleNode(n) {
  return {
    id: n.id,
    package_name: n.package_name,
    direction: n.direction,
    level: n.level,
    is_core: n.is_core,
    is_cluster: n.is_cluster,
    importance_score: n.importance_score,
    remaining_core_count: n.remaining_core_count,
    remaining_total_count: n.remaining_total_count,
    color: colorForNode(n),
    opacity: opacityForLevel(n.level),
    radius: n.is_cluster ? clusterRadius(n) : importanceRadius(n),
  };
}
function edgeEndpointId(value) {
  return typeof value === "object" && value !== null ? value.id : value;
}
function styleEdges(rawEdges, nodeById) {
  return rawEdges.map((e) => ({
    source: e.from,
    target: e.to,
    direction: e.direction,
    is_core: e.is_core,
    dashed: !e.is_core,
    color: e.direction === "parent" ? COLORS.parent : COLORS.child,
    opacity: edgeOpacity(nodeById[e.from], nodeById[e.to]),
  }));
}
function filterCore(nodes, edges, showNonCore, rootId) {
  let finalEdges = showNonCore ? edges : edges.filter((e) => e.is_core);
  const connected = new Set();
  finalEdges.forEach((e) => {
    connected.add(edgeEndpointId(e.source));
    connected.add(edgeEndpointId(e.target));
  });
  const finalNodes = nodes.filter(
    (n) => n.direction === "root" || n.id === rootId || connected.has(n.id),
  );
  return { nodes: finalNodes, edges: finalEdges };
}
function dedupeNodes(rawNodes) {
  const byId = {};
  rawNodes.forEach((n) => {
    const existing = byId[n.id];
    if (!existing || existing.direction !== "root") {
      if (!existing || n.direction === "root") {
        byId[n.id] = n;
      }
    }
  });
  return Object.values(byId);
}
// Builds the full initial graph from separate parent/child API results.
export function transformInitialGraph(
  parentResult,
  childResult,
  showNonCore = true,
) {
  const rootRaw =
    parentResult.nodes.find((n) => n.direction === "root") ||
    childResult.nodes.find((n) => n.direction === "root");
  const rootId = rootRaw ? rootRaw.id : parentResult.root_normalized_name;
  const parentRawNodes = parentResult.nodes.filter(
    (n) => n.direction !== "root",
  );
  const childRawNodes = childResult.nodes.filter((n) => n.direction !== "root");
  const allRawNodes = dedupeNodes([
    rootRaw || {
      id: rootId,
      direction: "root",
      level: 0,
      is_core: true,
      is_cluster: false,
    },
    ...parentRawNodes,
    ...childRawNodes,
  ]);
  const allRawEdges = [...parentResult.edges, ...childResult.edges];
  const styledNodes = allRawNodes.map(styleNode);
  const nodeById = {};
  styledNodes.forEach((n) => {
    nodeById[n.id] = n;
  });
  const styledEdges = styleEdges(allRawEdges, nodeById);
  const positions = calculateInitialLayout(
    rootId,
    parentRawNodes,
    parentResult.edges,
    childRawNodes,
    childResult.edges,
    35,
  );
  const positionedNodes = styledNodes.map((n) => {
    const pos = positions[n.id] || { x: 0, y: 0 };
    return { ...n, x: pos.x, y: pos.y, fx: pos.x, fy: pos.y };
  });
  return filterCore(positionedNodes, styledEdges, showNonCore, rootId);
}
// Merges a newly-fetched batch (expand or cluster "show more") into the current graph,
// anchored to sourceNode, continuing outward in its existing direction.
export function mergeExpansion(
  prevState,
  sourceNodeRef,
  newRawNodes,
  newRawEdges,
  options = {},
) {
  const { removeSourceNode = true } = options;
  const sourceNode =
    prevState.nodes.find((n) => n.id === sourceNodeRef.id) || sourceNodeRef;
  const inferredDirection = newRawEdges[0]
    ? newRawEdges[0].direction
    : sourceNode.direction === "child"
      ? "child"
      : "parent";
  const styledNew = newRawNodes.map(styleNode);
  const dedupedStyledNew = styledNew.filter(
    (n) => !prevState.nodes.some((existing) => existing.id === n.id),
  );
  const nodeById = {};
  prevState.nodes.forEach((n) => {
    nodeById[n.id] = n;
  });
  dedupedStyledNew.forEach((n) => {
    nodeById[n.id] = n;
  });
  nodeById[sourceNode.id] = sourceNode;
  const styledNewEdges = styleEdges(newRawEdges, nodeById);
  const positions = calculateBranchExpansion(
    sourceNode,
    dedupedStyledNew,
    newRawEdges,
    inferredDirection,
  );
  const positionedNew = dedupedStyledNew.map((n) => {
    const pos = positions[n.id] || { x: sourceNode.x, y: sourceNode.y };
    return { ...n, x: pos.x, y: pos.y };
  });
  const remainingNodes = removeSourceNode
    ? prevState.nodes.filter((n) => n.id !== sourceNode.id)
    : prevState.nodes;
  const existingIds = new Set(remainingNodes.map((n) => n.id));
  const dedupedNewNodes = positionedNew.filter((n) => !existingIds.has(n.id));
  const remainingEdges = removeSourceNode
    ? prevState.edges.filter(
        (e) =>
          edgeEndpointId(e.source) !== sourceNode.id &&
          edgeEndpointId(e.target) !== sourceNode.id,
      )
    : prevState.edges;
  const finalNodes = [...remainingNodes, ...dedupedNewNodes];
  const finalIds = new Set(finalNodes.map((n) => n.id));
  const existingEdgeKeys = new Set(
    remainingEdges.map(
      (e) => `${edgeEndpointId(e.source)}->${edgeEndpointId(e.target)}`,
    ),
  );
  const newUniqueEdges = styledNewEdges.filter(
    (e) =>
      !existingEdgeKeys.has(
        `${edgeEndpointId(e.source)}->${edgeEndpointId(e.target)}`,
      ),
  );
  const finalEdges = [...remainingEdges, ...newUniqueEdges].filter(
    (e) =>
      finalIds.has(edgeEndpointId(e.source)) &&
      finalIds.has(edgeEndpointId(e.target)),
  );
  return { nodes: finalNodes, edges: finalEdges };
}
