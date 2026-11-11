import { apiFetch } from './requestClient';
import { safeReadJson } from './authSession';

async function request(path, returnTo, body) {
  const response = await apiFetch(path, {
    method: body ? 'POST' : 'GET',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${sessionStorage.getItem('accessToken') || ''}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body: new URLSearchParams(body).toString() } : {}),
    authReturnTo: returnTo,
  });
  const data = await safeReadJson(response);
  if (!response.ok) {
    // Only documented error fields may reach the UI; never stringify arbitrary payloads.
    const message = [data?.error_description, data?.detail, data?.error].find(
      (value) => typeof value === 'string' && value.trim(),
    );
    throw new Error(message || `HTTP ${response.status}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Request failed.');
  }
  return data;
}

export function loadConsent(query) {
  return request(`/auth/mcp/authorize/${query}`, `/connections/authorize${query}`);
}

export function decideConsent(ticket, decision, query) {
  return request('/auth/mcp/authorize/', `/connections/authorize${query}`, { ticket, decision });
}

export function loadConnections() {
  return request('/auth/mcp/connections/', '/connections');
}

export function revokeConnection(applicationId) {
  return request('/auth/mcp/connections/', '/connections', { application_id: applicationId });
}

export function followOAuthCallback(url) {
  window.location.assign(url);
}
