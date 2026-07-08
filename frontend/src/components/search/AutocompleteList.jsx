function AutocompleteList({ suggestions, onSelect, highlightedIndex }) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <ul className="absolute top-full left-0 right-0 mt-1 bg-slate-900 rounded-lg shadow-lg overflow-hidden z-10">
      {suggestions.map((s, index) => (
        <li
          key={s.name}
          className={`px-3 py-2 text-white text-sm cursor-pointer 
            ${index === highlightedIndex ? "bg-slate-700" : "hover:bg-slate-700"}`}
          onClick={() => onSelect(s.name, s.package_name)}
        >
          {s.package_name}
        </li>
      ))}
    </ul>
  );
}

export default AutocompleteList;
