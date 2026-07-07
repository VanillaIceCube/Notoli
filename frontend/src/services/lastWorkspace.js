const STORAGE_KEY = 'notoli:lastWorkspaceByUser';

function getUserKey() {
  const username = sessionStorage.getItem('username');
  const email = sessionStorage.getItem('email');
  return username || email || null;
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (_err) {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_err) {
    // Last-workspace persistence is a convenience; navigation should still work.
  }
}

export function rememberLastWorkspace(workspaceId) {
  const userKey = getUserKey();
  if (!userKey || workspaceId === undefined || workspaceId === null || workspaceId === '') return;

  const store = readStore();
  store[userKey] = String(workspaceId);
  writeStore(store);
}

export function getLastWorkspaceId() {
  const userKey = getUserKey();
  if (!userKey) return null;

  const value = readStore()[userKey];
  return value === undefined || value === null || value === '' ? null : String(value);
}

export function getPreferredWorkspaceId(workspaces) {
  if (!Array.isArray(workspaces) || workspaces.length === 0) return null;

  const accessibleIds = workspaces.map((workspace) => String(workspace.id));
  const lastWorkspaceId = getLastWorkspaceId();
  if (lastWorkspaceId && accessibleIds.includes(lastWorkspaceId)) {
    return lastWorkspaceId;
  }

  return String(Math.min(...workspaces.map((workspace) => workspace.id)));
}
