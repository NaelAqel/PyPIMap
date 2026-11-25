import { useState, useEffect, useRef } from "react";
import { useSearchSuggestions } from "../../hooks/useSearchSuggestions";
import { useAppStore } from "../../store/appStore";
import AutocompleteList from "./AutocompleteList";

/**
 * Autocomplete is live `/search` only.
 * Do not scan/fetch galaxy search_index here - that 84MB JSON freezes the tab
 * and made search look broken. Pin still resolves via Galaxy's own index.
 */
function SearchBar() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const { suggestions, isLoading } = useSearchSuggestions(query, 10);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const pinOnGalaxy = useAppStore((state) => state.pinOnGalaxy);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  function handleSelect(id, name) {
    // Product rule: search pins Galaxy - does not open Explorer.
    // id must be normalized (API `name`); package_name is display-only.
    const normalized = id || name;
    pinOnGalaxy(normalized, name || normalized);
    setQuery("");
    setIsOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        Math.min(prev + 1, Math.max(suggestions.length - 1, 0)),
      );
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    }
    if (e.key === "Enter" && suggestions.length > 0) {
      const index = highlightedIndex >= 0 ? highlightedIndex : 0;
      handleSelect(suggestions[index].name, suggestions[index].package_name);
    }
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  const showList = isOpen && (suggestions.length > 0 || (isLoading && query.length >= 2));

  return (
    <div className="relative w-full" ref={containerRef}>
      <input
        className="w-full px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white text-sm placeholder-slate-500 outline-none focus:outline focus:outline-1 focus:outline-sky-400/45"
        placeholder="Search package..."
        aria-label="Search packages"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)}
      />
      {showList && (
        <AutocompleteList
          suggestions={suggestions}
          onSelect={handleSelect}
          highlightedIndex={highlightedIndex}
          isLoading={isLoading && suggestions.length === 0}
        />
      )}
    </div>
  );
}

export default SearchBar;
