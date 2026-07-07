import { apiFetch } from './requestClient';

const authHeader = (token) => (token ? { Authorization: `Bearer ${token}` } : {});
const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...authHeader(token),
});

export const login = ({ email, username, password }) => {
  const payload = { password };
  if (email) {
    payload.email = email;
  } else if (username) {
    payload.username = username;
  }

  return apiFetch('/auth/login/', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
};

export const register = ({ email, username, password }) => {
  const payload = {
    email: email?.trim(),
    password,
  };
  const trimmedUsername = username?.trim();
  if (trimmedUsername) {
    payload.username = trimmedUsername;
  }

  return apiFetch('/auth/register/', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
};

export const forgotPassword = ({ email }) =>
  apiFetch('/auth/forgot-password/', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email: email?.trim() }),
  });

export const resetPassword = ({ uid, token, password }) =>
  apiFetch('/auth/reset-password/', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ uid, token, password }),
  });

export const fetchBoards = (token) =>
  apiFetch('/api/boards/', {
    headers: authHeader(token),
  });

export const fetchBoard = (boardId, token) =>
  apiFetch(`/api/boards/${boardId}/`, {
    headers: authHeader(token),
  });

export const createBoard = (payload, token) =>
  apiFetch('/api/boards/', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const updateBoard = (boardId, payload, token) =>
  apiFetch(`/api/boards/${boardId}/`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const deleteBoard = (boardId, token) =>
  apiFetch(`/api/boards/${boardId}/`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });

export const addBoardCollaborator = (boardId, payload, token) =>
  apiFetch(`/api/boards/${boardId}/collaborators/`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const removeBoardCollaborator = (boardId, userId, token) =>
  apiFetch(`/api/boards/${boardId}/collaborators/${userId}/`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });

export const fetchLists = (boardId, token) =>
  apiFetch(`/api/lists/?board=${boardId}`, {
    headers: authHeader(token),
  });

export const fetchList = (listId, token) =>
  apiFetch(`/api/lists/${listId}/`, {
    headers: authHeader(token),
  });

export const createList = (boardId, payload, token) =>
  apiFetch(`/api/lists/?board=${boardId}`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const updateList = (listId, payload, token) =>
  apiFetch(`/api/lists/${listId}/`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const deleteList = (listId, token) =>
  apiFetch(`/api/lists/${listId}/`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });

export const reorderLists = (boardId, orderedIds, token) =>
  apiFetch('/api/lists/reorder/', {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify({ board: boardId, ordered_ids: orderedIds }),
  });

export const fetchNotes = (listId, token) =>
  apiFetch(`/api/notes/?list=${listId}`, {
    headers: authHeader(token),
  });

export const createNote = (listId, payload, token) =>
  apiFetch(`/api/notes/?list=${listId}`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const updateNote = (noteId, payload, token) =>
  apiFetch(`/api/notes/${noteId}/`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const deleteNote = (noteId, token) =>
  apiFetch(`/api/notes/${noteId}/`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });

export const reorderNotes = (listId, orderedIds, token) =>
  apiFetch('/api/notes/reorder/', {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify({ list: listId, ordered_ids: orderedIds }),
  });
