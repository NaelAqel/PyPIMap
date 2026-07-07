// Returns "YYYY-MM-DD" if input has no time component,
// or "YYYY-MM-DD HH:MM:SS" if input includes a time component.
// Returns a safe fallback string if input is null/malformed.

export function formatDate(rawValue, fallback = "Not available") {
  if (!rawValue) return fallback;

  const parsed = new Date(rawValue);
  if (isNaN(parsed.getTime())) return fallback;

  const pad = (n) => String(n).padStart(2, "0");

  const year = parsed.getFullYear();
  const month = pad(parsed.getMonth() + 1);
  const day = pad(parsed.getDate());
  const datePart = `${year}-${month}-${day}`;

  // detect whether the raw input string actually contained a time component
  const hasTime = /\d{1,2}:\d{2}/.test(String(rawValue));

  if (!hasTime) {
    return datePart;
  }

  const hours = pad(parsed.getHours());
  const minutes = pad(parsed.getMinutes());
  const seconds = pad(parsed.getSeconds());

  return `${datePart} ${hours}:${minutes}:${seconds}`;
}
