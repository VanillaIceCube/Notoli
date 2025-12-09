const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  return fetch(url, options);
}
