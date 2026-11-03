import { browserLocation, navigate } from './navigationService';
import { connectionReturnTo, loginPath } from './authRedirect';

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ??
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');

function shouldRedirectToLogin(path) {
  // Auth endpoints may legitimately return 401 (bad credentials) and should be handled by the UI.
  return (
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/register') &&
    !path.startsWith('/auth/forgot-password') &&
    !path.startsWith('/auth/reset-password')
  );
}

export function clearAuthSession() {
  try {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('email');
  } catch (_err) {
    // Ignore non-browser / blocked storage environments.
  }
}

export function redirectToLogin(returnTo) {
  const destination = loginPath(returnTo);
  const didNavigate = navigate(destination, { replace: true });

  if (didNavigate || typeof window === 'undefined') return;

  const publicUrl = process.env.PUBLIC_URL || '';
  const normalizedBase = publicUrl.replace(/\/+$/, '');
  const path = normalizedBase ? `${normalizedBase}${destination}` : destination;
  const loginUrl = `${window.location?.origin ?? ''}${path.startsWith('/') ? '' : '/'}${path}`;
  if (window.location?.replace) {
    browserLocation.replace(loginUrl);
  } else {
    window.location.href = loginUrl;
  }
}

export function logout() {
  clearAuthSession();
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
  redirectToLogin();
}

function handleUnauthorized(returnTo) {
  clearAuthSession();

  if (typeof window === 'undefined') return;

  const currentPath = window.location?.pathname?.replace(/\/+$/, '') ?? '';
  if (
    currentPath.endsWith('/login') ||
    currentPath.endsWith('/register') ||
    currentPath.endsWith('/forgot-password') ||
    currentPath.endsWith('/reset-password')
  ) {
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

  // Background board/notification requests can expire alongside consent.
  // Preserve the active connection URL regardless of which request fails first.
  const pending =
    connectionReturnTo(returnTo) ||
    connectionReturnTo(`${window.location?.pathname || ''}${window.location?.search || ''}`);
  redirectToLogin(pending);
}

let refreshRequest = null;

async function refreshAccessToken() {
  if (refreshRequest) return refreshRequest;

  const refreshToken = sessionStorage.getItem('refreshToken');
  if (!refreshToken) return { status: 'invalid' };

  refreshRequest = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (response.status === 400 || response.status === 401) return { status: 'invalid' };
      if (!response.ok) return { status: 'transient' };

      const data = await response.json();
      if (!data?.access) return { status: 'transient' };
      sessionStorage.setItem('accessToken', data.access);
      if (data.refresh) sessionStorage.setItem('refreshToken', data.refresh);
      return { status: 'refreshed', accessToken: data.access };
    } catch (_err) {
      return { status: 'transient' };
    } finally {
      refreshRequest = null;
    }
  })();

  return refreshRequest;
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

function hasAuthorizationHeader(headers) {
  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === 'authorization' && Boolean(value),
  );
}

function getStoredAccessToken() {
  try {
    const token = sessionStorage.getItem('accessToken');
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  } catch (_err) {
    return null;
  }
}

function removeAuthorizationHeaders(headers) {
  Object.keys(headers).forEach((key) => {
    if (key.toLowerCase() === 'authorization') {
      delete headers[key];
    }
  });
}

function withAccessToken(options, accessToken) {
  const headers = normalizeHeaders(options.headers);
  removeAuthorizationHeaders(headers);
  headers.Authorization = `Bearer ${accessToken}`;
  return {
    ...options,
    headers,
  };
}

export async function apiFetch(path, options = {}) {
  const { authReturnTo, ...requestOptions } = options;
  const url = `${API_BASE_URL}${path}`;
  const headers = normalizeHeaders(requestOptions.headers);

  const storedToken = getStoredAccessToken();
  if (storedToken && !hasAuthorizationHeader(headers) && shouldRedirectToLogin(path)) {
    removeAuthorizationHeaders(headers);
    headers.Authorization = `Bearer ${storedToken}`;
  }

  const mergedOptions = { ...requestOptions };
  if (Object.keys(headers).length > 0) {
    mergedOptions.headers = headers;
  } else {
    delete mergedOptions.headers;
  }

  const response = await fetch(url, mergedOptions);

  if (response?.status === 401 && shouldRedirectToLogin(path)) {
    const refreshResult = await refreshAccessToken();
    if (refreshResult.status === 'refreshed') {
      const retried = await fetch(url, withAccessToken(mergedOptions, refreshResult.accessToken));
      if (retried?.status === 401 && authReturnTo) handleUnauthorized(authReturnTo);
      return retried;
    }
    if (refreshResult.status === 'invalid') handleUnauthorized(authReturnTo);
  }

  return response;
}
