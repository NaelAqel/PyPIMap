import { useEffect, useRef, useState } from "react";
import { searchPackages } from "../api/endpoints";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export function useSearchSuggestions(query, limit = 10) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const q = (query || "").trim();
    if (!q || q.length < MIN_CHARS) {
      requestIdRef.current += 1;
      setSuggestions([]);
      setIsLoading(false);
      return undefined;
    }

    const thisRequestId = ++requestIdRef.current;
    setIsLoading(true);

    const timer = setTimeout(() => {
      searchPackages(q, limit)
        .then((result) => {
          if (thisRequestId !== requestIdRef.current) return;
          setSuggestions(Array.isArray(result) ? result : []);
          setIsLoading(false);
        })
        .catch((err) => {
          if (thisRequestId !== requestIdRef.current) return;
          console.log("searchPackages ERROR:", err.name, err.message);
          setSuggestions([]);
          setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // Invalidate in-flight handlers from this effect instance
      if (requestIdRef.current === thisRequestId) {
        // A newer effect will bump the id; only clear loading if we are still current
        // and the timer never fired - next effect sets loading again.
      }
    };
  }, [query, limit]);

  return { suggestions, isLoading };
}
