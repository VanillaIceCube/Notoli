import {
  login,
  register,
  fetchWorkspaces,
  fetchWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  fetchTodoLists,
  fetchTodoList,
  createTodoList,
  updateTodoList,
  deleteTodoList,
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
} from './backendClient';
import { apiFetch } from './apiClient';

jest.mock('./apiClient', () => ({
  apiFetch: jest.fn(() => Promise.resolve({ ok: true })),
}));

describe('backendClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('when login uses email, it posts the email payload', () => {
    login({ email: 'user@example.com', password: 'secret' });

    expect(apiFetch).toHaveBeenCalledWith('/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ email: 'user@example.com', password: 'secret' });
  });

  test('when login uses username, it posts the username payload', () => {
    login({ username: 'user1', password: 'secret' });

    expect(apiFetch).toHaveBeenCalledWith('/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ username: 'user1', password: 'secret' });
  });

  test('when login includes email and username, it prefers email', () => {
    login({ email: 'user@example.com', username: 'user1', password: 'secret' });

    const [, options] = apiFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ email: 'user@example.com', password: 'secret' });
  });

  test('when register trims inputs, it posts trimmed values', () => {
    register({ email: ' user@example.com ', username: ' user1 ', password: 'secret' });

    expect(apiFetch).toHaveBeenCalledWith('/auth/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      email: 'user@example.com',
      username: 'user1',
      password: 'secret',
    });
  });

  test('when register has blank username, it omits the username', () => {
    register({ email: 'user@example.com', username: '   ', password: 'secret' });

    expect(apiFetch).toHaveBeenCalledWith('/auth/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ email: 'user@example.com', password: 'secret' });
  });

  test('when fetching workspaces with a token, it sends the auth header', () => {
    fetchWorkspaces('token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when fetching workspaces without a token, it omits the auth header', () => {
    fetchWorkspaces();

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/', {
      headers: {},
    });
  });

  test('when fetching a workspace, it calls the workspace endpoint', () => {
    fetchWorkspace(3, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/3/', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when creating a workspace, it posts JSON with auth', () => {
    createWorkspace({ name: 'Alpha' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'Alpha' }),
    });
  });

  test('when updating a workspace, it patches JSON with auth', () => {
    updateWorkspace(3, { name: 'Beta' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/3/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'Beta' }),
    });
  });

  test('when deleting a workspace, it deletes with auth', () => {
    deleteWorkspace(3, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/3/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });

  test('when fetching todo lists, it calls the workspace query endpoint', () => {
    fetchTodoLists(9, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/?workspace=9', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when fetching a todo list, it calls the todo list endpoint', () => {
    fetchTodoList(5, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/5/', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when creating a todo list, it posts JSON with auth', () => {
    createTodoList(9, { name: 'List' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/?workspace=9', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'List' }),
    });
  });

  test('when updating a todo list, it patches JSON with auth', () => {
    updateTodoList(5, { name: 'Updated' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/5/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'Updated' }),
    });
  });

  test('when deleting a todo list, it deletes with auth', () => {
    deleteTodoList(5, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/5/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });

  test('when fetching notes, it calls the todo list query endpoint', () => {
    fetchNotes(7, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/?todo_list=7', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when creating a note, it posts JSON with auth', () => {
    createNote(7, { note: 'Hello' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/?todo_list=7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ note: 'Hello' }),
    });
  });

  test('when updating a note, it patches JSON with auth', () => {
    updateNote(2, { note: 'Updated' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/2/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ note: 'Updated' }),
    });
  });

  test('when deleting a note, it deletes with auth', () => {
    deleteNote(2, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/2/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });
});
