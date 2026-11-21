const LEVEL_SPACING = 160;
const MAX_ARC_DEGREES = 315;
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}
// Builds: for each node id, which node ids are "one step further out" in this direction.
// depends_on edges: outward toward what the focus needs (root is the dependent).
// used_by edges: outward toward who needs the focus (root is the dependency).
function buildOutwardMap(edges, direction) {
  const map = {};
  edges.forEach((e) => {
    const outwardFrom = direction === "depends_on" ? e.to : e.from;
    const outwardTo = direction === "depends_on" ? e.from : e.to;
    if (!map[outwardFrom]) map[outwardFrom] = [];
    map[outwardFrom].push(outwardTo);
  });
  return map;
}
// Recursively places nodes fanning outward from (originX, originY), starting at `distance`,
// centered on `angleCenter`, spreading across `angleSpan` degrees. Cycle-safe via `visited`.
function place(
  nodeId,
  distance,
  angleCenter,
  angleSpan,
  nodesById,
  outwardMap,
  maxNodesPerLevel,
  positions,
  visited,
  originX,
  originY,
  isOrigin,
) {
  if (!nodesById[nodeId]) return;
  if (visited.has(nodeId)) return;
  visited.add(nodeId);
  if (!isOrigin) {
    const rad = degToRad(angleCenter);
    positions[nodeId] = {
      x: originX + Math.cos(rad) * distance,
      y: originY + Math.sin(rad) * distance,
    };
  }
  let next = (outwardMap[nodeId] || [])
    .filter((id) => nodesById[id])
    .slice(0, maxNodesPerLevel);
  if (next.length === 0) return;
  const span = Math.min(angleSpan, MAX_ARC_DEGREES);
  const step = next.length > 1 ? span / (next.length - 1) : 0;
  const start = angleCenter - span / 2;
  next.forEach((id, i) => {
    const angle = next.length > 1 ? start + step * i : angleCenter;
    place(
      id,
      distance + LEVEL_SPACING,
      angle,
      span * 0.9,
      nodesById,
      outwardMap,
      maxNodesPerLevel,
      positions,
      visited,
      originX,
      originY,
      false,
    );
  });
}
// Initial full layout: root at (0,0), Depends on one side, Used by the other.
export function calculateInitialLayout(
  rootId,
  dependsOnNodes,
  dependsOnEdges,
  usedByNodes,
  usedByEdges,
  maxNodesPerLevel = 12,
) {
  const nodesById = {};
  dependsOnNodes.forEach((n) => {
    nodesById[n.id] = n;
  });
  usedByNodes.forEach((n) => {
    nodesById[n.id] = n;
  });
  nodesById[rootId] = nodesById[rootId] || { id: rootId };
  const positions = { [rootId]: { x: 0, y: 0 } };
  const dependsOnMap = buildOutwardMap(dependsOnEdges, "depends_on");
  const usedByMap = buildOutwardMap(usedByEdges, "used_by");
  place(
    rootId,
    0,
    0,
    MAX_ARC_DEGREES,
    nodesById,
    dependsOnMap,
    maxNodesPerLevel,
    positions,
    new Set(),
    0,
    0,
    true,
  );
  place(
    rootId,
    0,
    180,
    MAX_ARC_DEGREES,
    nodesById,
    usedByMap,
    maxNodesPerLevel,
    positions,
    new Set(),
    0,
    0,
    true,
  );
  return positions;
}
export function calculateBranchExpansion(
  sourceNode,
  newNodes,
  newEdges,
  direction,
  maxNodesPerLevel = 35,
) {
  const positions = {};
  if (!sourceNode || newNodes.length === 0) return positions;
  const originX = sourceNode.x || 0;
  const originY = sourceNode.y || 0;
  const atOrigin = Math.abs(originX) < 0.01 && Math.abs(originY) < 0.01;
  const angleCenter = atOrigin
    ? direction === "used_by"
      ? 180
      : 0
    : (Math.atan2(originY, originX) * 180) / Math.PI;
  const ids = newNodes.map((n) => n.id).slice(0, maxNodesPerLevel);
  const span = 140; // fixed fan width in degrees, always spreads regardless of edge data
  const step = ids.length > 1 ? span / (ids.length - 1) : 0;
  const start = angleCenter - span / 2;
  ids.forEach((id, i) => {
    const angle = ids.length > 1 ? start + step * i : angleCenter;
    const rad = (angle * Math.PI) / 180;
    positions[id] = {
      x: originX + Math.cos(rad) * 160,
      y: originY + Math.sin(rad) * 160,
    };
  });
  return positions;
}
