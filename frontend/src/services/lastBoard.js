const STORAGE_KEY = 'notoli:lastBoardByUser';

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
    // Last-board persistence is a convenience; navigation should still work.
  }
}

export function rememberLastBoard(boardId) {
  const userKey = getUserKey();
  if (!userKey || boardId === undefined || boardId === null || boardId === '') return;

  const store = readStore();
  store[userKey] = String(boardId);
  writeStore(store);
}

export function getLastBoardId() {
  const userKey = getUserKey();
  if (!userKey) return null;

  const value = readStore()[userKey];
  return value === undefined || value === null || value === '' ? null : String(value);
}

export function getPreferredBoardId(boards) {
  if (!Array.isArray(boards) || boards.length === 0) return null;

  const accessibleIds = boards.map((board) => String(board.id));
  const lastBoardId = getLastBoardId();
  if (lastBoardId && accessibleIds.includes(lastBoardId)) {
    return lastBoardId;
  }

  return String(Math.min(...boards.map((board) => board.id)));
}
