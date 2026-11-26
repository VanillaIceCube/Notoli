import { apiFetch } from '../http/requestClient';
import { getResponseErrorMessage } from '../http/apiResponse';

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

export const fetchTasks = (listId) => requestData(`/api/tasks/?list=${listId}`);

export const createTask = (listId, text) =>
  requestData('/api/tasks/', jsonRequest('POST', { text, list: listId }));

export const updateTask = (taskId, { text, status }) =>
  requestData(`/api/tasks/${taskId}/`, jsonRequest('PATCH', { text, status }));

export async function deleteTask(taskId) {
  await requestNotoli(`/api/tasks/${taskId}/`, deleteOptions);
}

export const reorderTasks = (listId, orderedIds) =>
  requestData(
    '/api/tasks/reorder/',
    jsonRequest('PATCH', { list: listId, ordered_ids: orderedIds }),
  );
