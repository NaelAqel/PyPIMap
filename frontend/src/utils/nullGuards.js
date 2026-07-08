export function authorOrFallback(value) {
  const placeholders = ["Your Name", "UNKNOWN", "Example Author"];
  return value && !placeholders.includes(value) ? value : "Not Available";
}

export function homepageOrFallback(value) {
  return value ? value : "Home page not available";
}
