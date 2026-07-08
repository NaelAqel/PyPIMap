import { useState, useEffect, useRef } from "react";
import { useSearchSuggestions } from "../../hooks/useSearchSuggestions";
import { useAppStore } from "../../store/appStore";
import AutocompleteList from "./AutocompleteList";

function SearchBar() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const { suggestions } = useSearchSuggestions(query, 10);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const setFocusedPackage = useAppStore((state) => state.setFocusedPackage);
  const addBreadcrumb = useAppStore((state) => state.addBreadcrumb);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(id, name) {
    setFocusedPackage(name);
    addBreadcrumb(name, name);
    setQuery("");
    setIsOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
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

  return (
    <div className="relative w-full" ref={containerRef}>
      <input
        className="w-full px-3 py-2 rounded-lg bg-slate-900/70 backdrop-blur-sm text-white placeholder-slate-400 outline-none"
        placeholder="Search by package or author"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && (
        <AutocompleteList
          suggestions={suggestions}
          onSelect={handleSelect}
          highlightedIndex={highlightedIndex}
        />
      )}
    </div>
  );
}

export default SearchBar;
