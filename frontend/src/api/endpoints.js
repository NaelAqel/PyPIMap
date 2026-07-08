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

export async function getGraphParents(normalizedName, params = {}) {
  const query = new URLSearchParams(params);
  return apiFetch(
    `/graph/${encodeURIComponent(normalizedName)}/parents?${query.toString()}`,
  );
}

export async function getGraphChildren(normalizedName, params = {}) {
  const query = new URLSearchParams(params);
  return apiFetch(
    `/graph/${encodeURIComponent(normalizedName)}/children?${query.toString()}`,
  );
}

export async function getGraphSliceParents(clusterId, offset, params = {}) {
  const query = new URLSearchParams({ offset, ...params });
  return apiFetch(
    `/graph/${encodeURIComponent(clusterId)}/parents?${query.toString()}`,
  );
}

export async function getGraphSliceChildren(clusterId, offset, params = {}) {
  const query = new URLSearchParams({ offset, ...params });
  return apiFetch(
    `/graph/${encodeURIComponent(clusterId)}/children?${query.toString()}`,
  );
}
