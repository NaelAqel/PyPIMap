// Draws a cluster bubble: circle sized by node.radius, with a label showing
// either the package count or "Loading..." while a fetch is in progress.
export function drawClusterNode(
  node,
  ctx,
  isLoadingThis,
  globalScale,
  showNonCore,
) {
  const radius = (node.radius || 18) / globalScale;

  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = isLoadingThis ? "#475569" : node.color || "#94a3b8";
  ctx.globalAlpha = node.opacity ?? 1;
  ctx.fill();
  ctx.globalAlpha = 1;

  const count = showNonCore
    ? node.remaining_total_count
    : node.remaining_core_count;
  const directionWord = node.direction === "parent" ? "parents" : "children";
  const label = isLoadingThis
    ? "Loading..."
    : count !== undefined
      ? `+${count} more ${directionWord}`
      : node.package_name;
  ctx.font = `${10 / globalScale}px sans-serif`;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText(label, node.x, node.y + radius + 10 / globalScale);
}
