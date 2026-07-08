function MetricRow({ label, coreCount, nonCoreCount }) {
  return (
    <div className="text-sm text-white py-1">
      <div className="text-slate-300">{label}</div>
      <div className="flex gap-4 mt-0.5">
        <span>Core: {coreCount}</span>
        <span>Optional: {nonCoreCount}</span>
      </div>
    </div>
  );
}

function MetricsGrid({
  parent_core_counts,
  parent_non_core_counts,
  children_core_counts,
  children_non_core_counts,
}) {
  // defensively coerce null/undefined to 0 — spec requires "0" rendered, never blank
  const safe = (v) => (v === null || v === undefined ? 0 : v);

  return (
    <div className="space-y-1 border-t border-slate-700 pt-2 mt-2">
      <MetricRow
        label="Upstream (Needs)"
        coreCount={safe(parent_core_counts)}
        nonCoreCount={safe(parent_non_core_counts)}
      />
      <MetricRow
        label="Downstream (Feeds)"
        coreCount={safe(children_core_counts)}
        nonCoreCount={safe(children_non_core_counts)}
      />
    </div>
  );
}

export default MetricsGrid;
