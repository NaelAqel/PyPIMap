import { apiFetch } from "./client";

export async function getLastUpdate() {
  return apiFetch("/last_update");
}

export async function searchPackages(query, limit) {
  const params = new URLSearchParams({ q: query });
  if (limit) params.set("limit", limit);
  return apiFetch(`/search?${params.toString()}`);
}

export async function getPackageDetails(normalizedName) {
  return apiFetch(`/package/api/${encodeURIComponent(normalizedName)}`);
}

function toQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }
  return query.toString();
}

export async function getGraphDependsOn(normalizedName, params = {}, init = {}) {
  return apiFetch(
    `/graph/${encodeURIComponent(normalizedName)}/depends-on?${toQuery(params)}`,
    init,
  );
}

export async function getGraphUsedBy(normalizedName, params = {}, init = {}) {
  return apiFetch(
    `/graph/${encodeURIComponent(normalizedName)}/used-by?${toQuery(params)}`,
    init,
  );
}

export async function getGraphSliceDependsOn(clusterId, offset, params = {}) {
  const query = new URLSearchParams({ offset, ...params });
  return apiFetch(
    `/graph/${encodeURIComponent(clusterId)}/depends-on?${query.toString()}`,
  );
}

export async function getGraphSliceUsedBy(clusterId, offset, params = {}) {
  const query = new URLSearchParams({ offset, ...params });
  return apiFetch(
    `/graph/${encodeURIComponent(clusterId)}/used-by?${query.toString()}`,
  );
}
