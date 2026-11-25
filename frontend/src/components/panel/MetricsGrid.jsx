function MetricRow({ label, coreCount, optionalCount }) {
  return (
    <div className="text-sm text-slate-100 py-1">
      <div className="text-slate-200">{label}</div>
      <div className="flex gap-4 mt-0.5 text-slate-300">
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
  // null/undefined → 0; allow "-" / "…" for empty/loading card shells
  const safe = (v) => {
    if (v === null || v === undefined) return 0;
    return v;
  };

  return (
    <div className="space-y-1 border-t border-slate-500/60 pt-2 mt-2">
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
