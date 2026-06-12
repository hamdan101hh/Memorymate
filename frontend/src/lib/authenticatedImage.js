import api from "./api";

/** Fetch a protected image path and return a temporary blob URL for <img src>. */
export function isProtectedImagePath(path) {
  return path && (path.startsWith("/api/attachments/") || path.startsWith("/api/images/"));
}

export async function fetchAuthenticatedImageUrl(path) {
  if (!path) return null;
  const rel = path.startsWith("/api/") ? path.slice(4) : path.startsWith("/") ? path.slice(1) : path;
  const { data } = await api.get(rel, { responseType: "blob" });
  return URL.createObjectURL(data);
}
