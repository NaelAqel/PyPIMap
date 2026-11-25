function AutocompleteList({
  suggestions,
  onSelect,
  highlightedIndex,
  isLoading = false,
}) {
  if ((!suggestions || suggestions.length === 0) && !isLoading) return null;

  return (
    <ul className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-white/10 rounded-lg shadow-lg overflow-hidden z-50 max-h-72 overflow-y-auto">
      {isLoading && (
        <li className="px-3 py-2 text-slate-400 text-sm">Searching...</li>
      )}
      {(suggestions || []).map((s, index) => (
        <li
          key={s.name}
          className={`px-3 py-2 text-white text-sm cursor-pointer ${
            index === highlightedIndex ? "bg-slate-700" : "hover:bg-slate-700"
          }`}
          onMouseDown={(e) => {
            // mousedown before blur/outside handlers so click always selects
            e.preventDefault();
            onSelect(s.name, s.package_name);
          }}
        >
          {s.package_name}
        </li>
      ))}
    </ul>
  );
}

export default AutocompleteList;
