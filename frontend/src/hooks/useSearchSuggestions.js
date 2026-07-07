import { useEffect, useRef, useState } from "react";
import { searchPackages } from "../api/endpoints";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

export function useSearchSuggestions(query, limit = 10) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!query || query.length < MIN_CHARS) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const thisRequestId = ++requestIdRef.current;
    setIsLoading(true);

    const timer = setTimeout(() => {
      searchPackages(query, limit)
        .then((result) => {
          // ignore if a newer request has started since this one fired
          if (thisRequestId !== requestIdRef.current) return;
          setSuggestions(result);
          setIsLoading(false);
        })
        .catch((err) => {
          if (thisRequestId !== requestIdRef.current) return;
          console.log("searchPackages ERROR:", err.name, err.message);
          setSuggestions([]);
          setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, limit]);

  return { suggestions, isLoading };
}
