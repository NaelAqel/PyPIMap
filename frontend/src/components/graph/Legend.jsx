function LegendRow({ color, label, dashed = false }) {
  return (
    <div className="flex items-center gap-2 text-sm text-white">
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
      {dashed !== null && (
        <span className="text-xs text-slate-400">
          {dashed ? "(dashed = optional)" : ""}
        </span>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="bg-slate-900/70 backdrop-blur-sm rounded-lg p-3 space-y-2 w-56">
      <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">
        Legend
      </p>
      <LegendRow color="#f8fafc" label="Root package" dashed={null} />
      <LegendRow color="#38bdf8" label="Upstream (needs)" dashed={null} />
      <LegendRow color="#fb923c" label="Downstream (feeds)" dashed={null} />
      <div className="border-t border-slate-700 my-1" />
      <div className="text-xs text-slate-400">Solid line = Core package</div>
      <div className="text-xs text-slate-400">
        Dashed line = Optional package
      </div>
    </div>
  );
}

export default Legend;
