import { navigate } from './navigationService';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

function shouldRedirectToLogin(path) {
  // Auth endpoints may legitimately return 401 (bad credentials) and should be handled by the UI.
  return !path.startsWith('/auth/login') && !path.startsWith('/auth/register');
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

export function redirectToLogin() {
  navigate('/login', { replace: true });
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

function handleUnauthorized() {
  clearAuthSession();

  if (typeof window === 'undefined') return;

  const currentPath = window.location?.pathname?.replace(/\/+$/, '') ?? '';
  if (currentPath.endsWith('/login') || currentPath.endsWith('/register')) return;

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

  redirectToLogin();
}

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, options);

  if (response?.status === 401 && shouldRedirectToLogin(path)) {
    handleUnauthorized();
  }

  return response;
}
