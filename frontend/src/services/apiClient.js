const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

function getAppBasePath() {
  // CRA sets PUBLIC_URL at build time (derived from `homepage` in package.json).
  // In local dev it's typically empty, so we fall back to root.
  const base = process.env.PUBLIC_URL || '';
  if (!base || base === '/') return '';
  return base.replace(/\/+$/, '');
}

function buildAppPath(path) {
  const base = getAppBasePath();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function shouldRedirectToLogin(path) {
  // Auth endpoints may legitimately return 401 (bad credentials) and should be handled by the UI.
  return !path.startsWith('/auth/login') && !path.startsWith('/auth/register');
}

function handleUnauthorized() {
  try {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
  } catch (_err) {
    // Ignore non-browser / blocked storage environments.
  }

  if (typeof window === 'undefined') return;

  const loginPath = buildAppPath('/login');
  const registerPath = buildAppPath('/register');

  const currentPath = window.location?.pathname?.replace(/\/+$/, '') ?? '';
  const normalizedLogin = loginPath.replace(/\/+$/, '');
  const normalizedRegister = registerPath.replace(/\/+$/, '');
  if (currentPath === normalizedLogin || currentPath === normalizedRegister) return;

  const isJsdom =
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    navigator.userAgent.toLowerCase().includes('jsdom');

  // In production, prefer a full redirect to clear any stale in-memory state.
  // In tests (jsdom), navigation isn't implemented, so just update the URL.
  if (isJsdom) {
    window.history.replaceState({}, '', loginPath);
    return;
  }

  window.location.replace(loginPath);
}

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, options);

  if (response?.status === 401 && shouldRedirectToLogin(path)) {
    handleUnauthorized();
  }

  return response;
}
