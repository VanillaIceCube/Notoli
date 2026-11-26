import {
  connectionReturnTo,
  loginPath as connectionLoginPath,
} from '../authentication/authRedirect';
import {
  clearSession,
  getSessionSnapshot,
  getSessionVersion,
  rotateSessionTokens,
} from '../authentication/sessionState';
import { browserLocation, navigate } from '../navigation/navigationService';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8000');

function shouldRedirectToLogin(path) {
  // Auth endpoints may legitimately return 401 (bad credentials) and should be handled by the UI.
  return (
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/register') &&
    !path.startsWith('/auth/forgot-password') &&
    !path.startsWith('/auth/reset-password')
  );
}

function redirectToLogin(returnTo) {
  const destination = connectionLoginPath(returnTo);
  const didNavigate = navigate(destination, { replace: true });

  if (didNavigate || typeof window === 'undefined') return;

  const publicUrl = import.meta.env.BASE_URL || '/';
  const normalizedBase = publicUrl.replace(/\/+$/, '');
  const loginPath = normalizedBase ? `${normalizedBase}${destination}` : destination;
  const loginUrl = `${window.location?.origin ?? ''}${loginPath.startsWith('/') ? '' : '/'}${loginPath}`;
  if (window.location?.replace) {
    browserLocation.replace(loginUrl);
  } else {
    window.location.href = loginUrl;
  }
}

export function logout() {
  try {
    sessionStorage.setItem(
      'pendingSnackbar',
      JSON.stringify({
        severity: 'success',
        message: 'Logout Successful :)',
      }),
    );
  } catch (_err) {
    // ignore
  }
  clearSession();
  redirectToLogin();
}

function handleUnauthorized(returnTo) {
  if (typeof window === 'undefined') {
    clearSession();
    return;
  }

  const currentPath = window.location?.pathname?.replace(/\/+$/, '') ?? '';
  if (
    currentPath.endsWith('/login') ||
    currentPath.endsWith('/register') ||
    currentPath.endsWith('/forgot-password') ||
    currentPath.endsWith('/reset-password')
  ) {
    clearSession();
    return;
  }

  // Let the login screen explain why the user got redirected.
  try {
    sessionStorage.setItem(
      'pendingSnackbar',
      JSON.stringify({
        severity: 'error',
        message: 'Your session expired. Please log in again.',
      }),
    );
  } catch (_err) {
    // ignore
  }

  const pending =
    connectionReturnTo(returnTo) ||
    connectionReturnTo(`${window.location?.pathname || ''}${window.location?.search || ''}`);
  clearSession();
  redirectToLogin(pending);
}

let refreshRequest = null;

async function refreshAccessToken(sessionVersion) {
  const refreshToken = getSessionSnapshot().refreshToken;
  if (!refreshToken) return { status: 'invalid' };
  if (
    refreshRequest?.sessionVersion === sessionVersion &&
    refreshRequest.refreshToken === refreshToken
  ) {
    return refreshRequest.promise;
  }

  const request = { sessionVersion, refreshToken };
  refreshRequest = request;
  const isCurrent = () =>
    getSessionVersion() === sessionVersion && getSessionSnapshot().refreshToken === refreshToken;
  request.promise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (!isCurrent()) return { status: 'stale' };
      if (response.status === 400 || response.status === 401) return { status: 'invalid' };
      if (!response.ok) return { status: 'transient' };

      const data = await response.json();
      if (!isCurrent()) return { status: 'stale' };
      if (typeof data?.access !== 'string' || !data.access.trim()) return { status: 'transient' };
      if (!rotateSessionTokens(data, sessionVersion, refreshToken)) return { status: 'stale' };
      return { status: 'refreshed', accessToken: data.access };
    } catch (_err) {
      return { status: 'transient' };
    } finally {
      if (refreshRequest === request) refreshRequest = null;
    }
  })();

  return request.promise;
}

export function normalizeHeaders(headers) {
  if (!headers) return {};
  const result = {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      if (value !== undefined && value !== null) {
        result[key] = value;
      }
    });
    return result;
  }
  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      if (key && value !== undefined && value !== null) {
        result[key] = value;
      }
    });
    return result;
  }
  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  });
  return result;
}

function setAccessToken(headers, accessToken) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'authorization') delete headers[key];
  }
  headers.Authorization = `Bearer ${accessToken}`;
}

export async function apiFetch(path, options = {}) {
  const { authReturnTo, ...fetchOptions } = options;
  const url = `${API_BASE_URL}${path}`;
  const headers = normalizeHeaders(fetchOptions.headers);

  const { version: sessionVersion, accessToken: storedToken } = getSessionSnapshot();
  const explicitAuthorization = Object.entries(headers).find(
    ([key, value]) => key.toLowerCase() === 'authorization' && Boolean(value),
  )?.[1];
  const ownsAuthorization =
    !explicitAuthorization || explicitAuthorization === `Bearer ${storedToken}`;
  if (storedToken && !explicitAuthorization && shouldRedirectToLogin(path)) {
    setAccessToken(headers, storedToken);
  }

  const mergedOptions = { ...fetchOptions };
  if (Object.keys(headers).length > 0) {
    mergedOptions.headers = headers;
  } else {
    delete mergedOptions.headers;
  }

  const response = await fetch(url, mergedOptions);

  if (
    response?.status === 401 &&
    ownsAuthorization &&
    shouldRedirectToLogin(path) &&
    getSessionVersion() === sessionVersion
  ) {
    // Another request may already have rotated this session's access token.
    const currentToken = getSessionSnapshot().accessToken;
    const refreshResult =
      currentToken && currentToken !== storedToken
        ? { status: 'refreshed', accessToken: currentToken }
        : await refreshAccessToken(sessionVersion);
    if (getSessionVersion() !== sessionVersion) return response;
    if (refreshResult.status === 'refreshed') {
      const retryHeaders = { ...headers };
      setAccessToken(retryHeaders, refreshResult.accessToken);
      const retried = await fetch(url, { ...mergedOptions, headers: retryHeaders });
      if (
        retried?.status === 401 &&
        getSessionVersion() === sessionVersion &&
        getSessionSnapshot().accessToken === refreshResult.accessToken
      ) {
        handleUnauthorized(authReturnTo);
      }
      return retried;
    }
    if (refreshResult.status === 'invalid') handleUnauthorized(authReturnTo);
  }

  return response;
}
