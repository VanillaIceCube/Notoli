import { apiFetch } from './client';

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

export const fetchWorkspaces = (token) =>
  apiFetch('/api/workspaces/', {
    headers: authHeader(token),
  });

export const fetchWorkspace = (workspaceId, token) =>
  apiFetch(`/api/workspaces/${workspaceId}/`, {
    headers: authHeader(token),
  });

export const createWorkspace = (payload, token) =>
  apiFetch('/api/workspaces/', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const updateWorkspace = (workspaceId, payload, token) =>
  apiFetch(`/api/workspaces/${workspaceId}/`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const deleteWorkspace = (workspaceId, token) =>
  apiFetch(`/api/workspaces/${workspaceId}/`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });

export const fetchTodoLists = (workspaceId, token) =>
  apiFetch(`/api/todolists/?workspace=${workspaceId}`, {
    headers: authHeader(token),
  });

export const fetchTodoList = (todoListId, token) =>
  apiFetch(`/api/todolists/${todoListId}/`, {
    headers: authHeader(token),
  });

export const createTodoList = (workspaceId, payload, token) =>
  apiFetch(`/api/todolists/?workspace=${workspaceId}`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const updateTodoList = (todoListId, payload, token) =>
  apiFetch(`/api/todolists/${todoListId}/`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(payload),
  });

export const deleteTodoList = (todoListId, token) =>
  apiFetch(`/api/todolists/${todoListId}/`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });

export const fetchNotes = (todoListId, token) =>
  apiFetch(`/api/notes/?todo_list=${todoListId}`, {
    headers: authHeader(token),
  });

export const createNote = (todoListId, payload, token) =>
  apiFetch(`/api/notes/?todo_list=${todoListId}`, {
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
