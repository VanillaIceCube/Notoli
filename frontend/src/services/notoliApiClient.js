import { apiFetch } from './requestClient';
import { getResponseErrorMessage, readOkJson } from './authSession';

const jsonHeaders = { 'Content-Type': 'application/json' };
const deleteOptions = { method: 'DELETE', headers: jsonHeaders };

function jsonRequest(method, payload) {
  return { method, headers: jsonHeaders, body: JSON.stringify(payload) };
}

async function requestNotoli(path, options, errorMessage) {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const status = response.status;
    const message = errorMessage ? await errorMessage(response) : `HTTP ${status}`;
    throw Object.assign(new Error(message), { status });
  }
  return response;
}

async function requestData(path, options, errorMessage) {
  const response = await requestNotoli(path, options, errorMessage);
  return response.json();
}

async function postAuthForm(path, payload, invalidResponseMessage) {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readOkJson(response, invalidResponseMessage);
}

export const login = ({ email, username, password }) => {
  const payload = { password };
  if (email) payload.email = email;
  else if (username) payload.username = username;

  return postAuthForm('/auth/login/', payload, 'Login failed :(');
};

export const register = ({ email, username, password }) => {
  const payload = { email: email?.trim(), password };
  const trimmedUsername = username?.trim();
  if (trimmedUsername) payload.username = trimmedUsername;

  return postAuthForm('/auth/register/', payload, 'Registration failed :(');
};

export const forgotPassword = ({ email }) =>
  postAuthForm(
    '/auth/forgot-password/',
    { email: email?.trim() },
    'Password reset request failed :(',
  );

export const resetPassword = ({ uid, token, password }) =>
  postAuthForm('/auth/reset-password/', { uid, token, password }, 'Password reset failed :(');

export const fetchBoards = () =>
  requestData('/api/boards/', undefined, (response) =>
    getResponseErrorMessage(response, `HTTP ${response.status}`),
  );

export const fetchBoard = (boardId) => requestData(`/api/boards/${boardId}/`);

export const createBoard = (payload) =>
  requestData('/api/boards/', jsonRequest('POST', payload), (response) =>
    getResponseErrorMessage(response, `Unable to create board (HTTP ${response.status})`),
  );

export const updateBoard = (boardId, payload) =>
  requestData(`/api/boards/${boardId}/`, jsonRequest('PATCH', payload), (response) =>
    getResponseErrorMessage(response, `Unable to update board (HTTP ${response.status})`),
  );

export const deleteBoard = async (boardId) => {
  await requestNotoli(`/api/boards/${boardId}/`, deleteOptions, (response) =>
    getResponseErrorMessage(response, `Unable to delete board (HTTP ${response.status})`),
  );
};

export const addBoardCollaborator = (boardId, payload) =>
  requestData(`/api/boards/${boardId}/collaborators/`, jsonRequest('POST', payload), (response) =>
    getResponseErrorMessage(response, 'Unable to add collaborator.'),
  );

export const removeBoardCollaborator = (boardId, userId) =>
  requestData(`/api/boards/${boardId}/collaborators/${userId}/`, deleteOptions, (response) =>
    getResponseErrorMessage(response, 'Unable to remove collaborator.'),
  );

export const fetchLists = (boardId) => requestData(`/api/lists/?board=${boardId}`);

export const fetchList = (listId) => requestData(`/api/lists/${listId}/`);

export const createList = (boardId, payload) =>
  requestData(`/api/lists/?board=${boardId}`, jsonRequest('POST', payload));

export const updateList = (listId, payload) =>
  requestData(`/api/lists/${listId}/`, jsonRequest('PATCH', payload));

export const deleteList = async (listId) => {
  await requestNotoli(`/api/lists/${listId}/`, deleteOptions);
};

export const reorderLists = (boardId, orderedIds) =>
  requestData(
    '/api/lists/reorder/',
    jsonRequest('PATCH', { board: boardId, ordered_ids: orderedIds }),
  );

// The REST API calls these records notes. The frontend uses tasks.
function toTask({ note, ...task }) {
  return { ...task, text: note };
}

export async function fetchTasks(listId) {
  const notes = await requestData(`/api/notes/?list=${listId}`);
  return notes.map(toTask);
}

export async function createTask(listId, text) {
  const note = await requestData(
    `/api/notes/?list=${listId}`,
    jsonRequest('POST', { note: text, list: listId, description: '' }),
  );
  return toTask(note);
}

export async function updateTask(taskId, { text, status }) {
  const note = await requestData(
    `/api/notes/${taskId}/`,
    jsonRequest('PATCH', { note: text, status }),
  );
  return toTask(note);
}

export async function deleteTask(taskId) {
  await requestNotoli(`/api/notes/${taskId}/`, deleteOptions);
}

export async function reorderTasks(listId, orderedIds) {
  const notes = await requestData(
    '/api/notes/reorder/',
    jsonRequest('PATCH', { list: listId, ordered_ids: orderedIds }),
  );
  return notes.map(toTask);
}

export const fetchNotifications = () => apiFetch('/api/notifications/');

export const markNotificationRead = (notificationId) =>
  apiFetch(`/api/notifications/${notificationId}/`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ is_read: true }),
  });

export const clearNotification = (notificationId) =>
  apiFetch(`/api/notifications/${notificationId}/`, {
    method: 'DELETE',
    headers: jsonHeaders,
  });

export const clearAllNotifications = () =>
  apiFetch('/api/notifications/clear-all/', {
    method: 'DELETE',
    headers: jsonHeaders,
  });

export const markAllNotificationsRead = () =>
  apiFetch('/api/notifications/mark-all-read/', {
    method: 'PATCH',
    headers: jsonHeaders,
  });
