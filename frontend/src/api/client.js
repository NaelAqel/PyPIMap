const BASE_URL = import.meta.env.VITE_API_URL;

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = "NetworkError";
  }
}

export async function apiFetch(path, options = {}) {
  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, options);
  } catch (err) {
    // fetch itself throws on actual network failure (offline, DNS, CORS, timeout)
    throw new NetworkError(`Network request failed: ${err.message}`);
  }

  if (response.status === 404) {
    throw new NotFoundError(`Resource not found: ${path}`);
  }

  if (!response.ok) {
    // anything else non-2xx — treat as network/server error for now per spec's two-error-type model
    throw new NetworkError(
      `Request failed with status ${response.status}: ${path}`,
    );
  }

  try {
    return await response.json();
  } catch (err) {
    throw new NetworkError(`Failed to parse JSON response: ${err.message}`);
  }
}
