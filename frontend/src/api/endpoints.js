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

export async function getGraphDependsOn(normalizedName, params = {}) {
  const query = new URLSearchParams(params);
  return apiFetch(
    `/graph/${encodeURIComponent(normalizedName)}/depends-on?${query.toString()}`,
  );
}

export async function getGraphUsedBy(normalizedName, params = {}) {
  const query = new URLSearchParams(params);
  return apiFetch(
    `/graph/${encodeURIComponent(normalizedName)}/used-by?${query.toString()}`,
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
