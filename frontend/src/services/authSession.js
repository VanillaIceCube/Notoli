async function safeReadJson(response) {
  try {
    return await response.json();
  } catch (_err) {
    return null;
  }
}

function extractErrorString(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractErrorString(item);
      if (extracted) return extracted;
    }
  } else if (value && typeof value === 'object') {
    if (value.error) return extractErrorString(value.error);
    if (value.detail) return extractErrorString(value.detail);
    if (value.non_field_errors) return extractErrorString(value.non_field_errors);
    for (const key of Object.keys(value)) {
      const extracted = extractErrorString(value[key]);
      if (extracted) return extracted;
    }
  }
  return null;
}

export async function getResponseErrorMessage(response, fallbackMessage) {
  const data = await safeReadJson(response);
  if (!data) return fallbackMessage;

  const extracted = extractErrorString(data);
  return extracted || fallbackMessage;
}

export async function readOkJson(response, fallbackMessage) {
  if (!response?.ok) {
    const message = await getResponseErrorMessage(response, `HTTP ${response?.status ?? 'error'}`);
    throw new Error(message);
  }

  const data = await safeReadJson(response);
  if (!data) {
    throw new Error(fallbackMessage);
  }
  return data;
}

export function persistAuthSession(data) {
  if (!data?.access || !data?.refresh) {
    throw new Error('Auth response missing tokens.');
  }

  try {
    sessionStorage.setItem('accessToken', data.access);
    sessionStorage.setItem('refreshToken', data.refresh);

    // Profile info (app bar menu). Remove stale keys if missing in payload.
    if (typeof data?.username === 'string' && data.username.trim()) {
      sessionStorage.setItem('username', data.username.trim());
    } else {
      sessionStorage.removeItem('username');
    }

    if (typeof data?.email === 'string' && data.email.trim()) {
      sessionStorage.setItem('email', data.email.trim());
    } else {
      sessionStorage.removeItem('email');
    }
  } catch (_err) {
    throw new Error('Unable to access browser session storage.');
  }
}
