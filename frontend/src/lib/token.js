// Centralised auth-token storage (single source of truth for the JWT).
//
// SECURITY NOTE: the token is kept in localStorage for simplicity. localStorage is
// readable by any JavaScript on the page, so it carries an XSS risk. We mitigate this by
// never rendering untrusted HTML (no dangerouslySetInnerHTML on user-provided content).
// For a hardened deployment, move to httpOnly + Secure + SameSite cookies issued by the
// backend (JS cannot read those) together with CSRF protection. Keeping ALL token access
// in this one module makes that migration a single-file change.
const TOKEN_KEY = "mm_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Decodes the JWT payload and returns true if the `exp` claim is in the past.
export function isTokenExpired(token = getToken()) {
  if (!token) return true;
  try {
    const payload = token.split(".")[1];
    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof data.exp !== "number") return false;
    return data.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
