const sessionKeys = ['accessToken', 'refreshToken', 'username', 'email'];
const emptySession = { accessToken: null, refreshToken: null, username: '', email: '' };
const listeners = new Set();
let snapshot;
let suppressStorageReads = false;

const token = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const profile = (value) => (typeof value === 'string' ? value.trim() : '');

function readStorage() {
  try {
    return {
      accessToken: token(sessionStorage.getItem('accessToken')),
      refreshToken: token(sessionStorage.getItem('refreshToken')),
      username: profile(sessionStorage.getItem('username')),
      email: profile(sessionStorage.getItem('email')),
    };
  } catch (_error) {
    return emptySession;
  }
}

// Cache by value: React must receive the same snapshot until the session changes.
// Reading storage also supports initial hydration and changes from same-origin frames.
export function getSessionSnapshot() {
  if (suppressStorageReads) return snapshot;
  const stored = readStorage();
  if (!snapshot || sessionKeys.some((key) => snapshot[key] !== stored[key])) {
    snapshot = Object.freeze({ ...stored, version: snapshot ? snapshot.version + 1 : 0 });
  }
  return snapshot;
}

export function getSessionVersion() {
  return getSessionSnapshot().version;
}

function publish(next, version) {
  snapshot = Object.freeze({ ...next, version });
  listeners.forEach((listener) => listener());
}

function syncStorage(event) {
  if (event.key !== null && !sessionKeys.includes(event.key)) return;
  if (event.storageArea && event.storageArea !== sessionStorage) return;
  const previous = snapshot;
  if (getSessionSnapshot() !== previous) listeners.forEach((listener) => listener());
}

export function subscribeSession(listener) {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', syncStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', syncStorage);
    }
  };
}

function writeStorage(next) {
  for (const key of sessionKeys) {
    if (next[key]) sessionStorage.setItem(key, next[key]);
    else sessionStorage.removeItem(key);
  }
}

function removeStoredSession() {
  let removed = true;
  for (const key of sessionKeys) {
    try {
      sessionStorage.removeItem(key);
    } catch (_error) {
      removed = false;
    }
  }
  return removed;
}

export function clearSession() {
  const version = getSessionVersion() + 1;
  // A blocked storage write must never bring an old account back into memory.
  suppressStorageReads = !removeStoredSession();
  publish(emptySession, version);
}

export function startSession(data) {
  const accessToken = token(data?.access);
  const refreshToken = token(data?.refresh);
  if (!accessToken || !refreshToken) throw new Error('Auth response missing tokens.');
  const version = getSessionVersion() + 1;
  const next = {
    accessToken,
    refreshToken,
    username: profile(data.username),
    email: profile(data.email),
  };
  try {
    writeStorage(next);
  } catch (_error) {
    removeStoredSession();
    suppressStorageReads = true;
    publish(emptySession, version);
    throw new Error('Unable to access browser session storage.');
  }
  suppressStorageReads = false;
  publish(next, version);
}

export function rotateSessionTokens(data, expectedVersion, expectedRefreshToken) {
  const current = getSessionSnapshot();
  if (current.version !== expectedVersion || current.refreshToken !== expectedRefreshToken) {
    return false;
  }
  const accessToken = token(data?.access);
  if (!accessToken) return false;
  const next = {
    ...current,
    accessToken,
    refreshToken: token(data.refresh) || current.refreshToken,
  };
  try {
    writeStorage(next);
  } catch (_error) {
    // Keep a transient persistence failure from publishing a partially rotated session.
    try {
      writeStorage(current);
    } catch (_rollbackError) {
      // The in-memory snapshot remains authoritative until a successful write.
    }
    suppressStorageReads = true;
    throw new Error('Unable to access browser session storage.');
  }
  suppressStorageReads = false;
  // Token rotation keeps the account generation and all mounted private content.
  publish(next, current.version);
  return true;
}
