function MetricRow({ label, coreCount, optionalCount }) {
  return (
    <div className="text-sm text-white py-1">
      <div className="text-slate-300">{label}</div>
      <div className="flex gap-4 mt-0.5">
        <span>Core: {coreCount}</span>
        <span>Optional: {optionalCount}</span>
      </div>
    </div>
  );
}

function MetricsGrid({
  depends_on_core_counts,
  depends_on_optional_counts,
  used_by_core_counts,
  used_by_optional_counts,
}) {
  // defensively coerce null/undefined to 0 — spec requires "0" rendered, never blank
  const safe = (v) => (v === null || v === undefined ? 0 : v);

  return (
    <div className="space-y-1 border-t border-slate-700 pt-2 mt-2">
      <MetricRow
        label="Depends on"
        coreCount={safe(depends_on_core_counts)}
        optionalCount={safe(depends_on_optional_counts)}
      />
      <MetricRow
        label="Used by"
        coreCount={safe(used_by_core_counts)}
        optionalCount={safe(used_by_optional_counts)}
      />
    </div>
  );
}

export default MetricsGrid;
