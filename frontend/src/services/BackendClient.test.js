import {
  createNote,
  createTodoList,
  createWorkspace,
  deleteNote,
  deleteTodoList,
  deleteWorkspace,
  fetchNotes,
  fetchTodoList,
  fetchTodoLists,
  fetchWorkspace,
  fetchWorkspaces,
  login,
  register,
  updateNote,
  updateTodoList,
  updateWorkspace,
} from './BackendClient';
import { apiFetch } from './client';

jest.mock('./client', () => ({
  apiFetch: jest.fn(),
}));

describe('BackendClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('when logging in with email, it builds the correct request', () => {
    login({ email: 'test@example.com', password: 'pass' });

    const [, options] = apiFetch.mock.calls[0];

    expect(apiFetch).toHaveBeenCalledWith('/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: options.body,
    });
    expect(JSON.parse(options.body)).toEqual({ email: 'test@example.com', password: 'pass' });
  });

  test('when logging in with username, it builds the correct request', () => {
    login({ username: 'tester', password: 'pass' });

    const [, options] = apiFetch.mock.calls[0];

    expect(apiFetch).toHaveBeenCalledWith('/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: options.body,
    });
    expect(JSON.parse(options.body)).toEqual({ username: 'tester', password: 'pass' });
  });

  test('when registering, it trims the username and email', () => {
    register({ email: ' test@example.com ', username: ' tester ', password: 'pass' });

    const [, options] = apiFetch.mock.calls[0];

    expect(apiFetch).toHaveBeenCalledWith('/auth/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: options.body,
    });
    expect(JSON.parse(options.body)).toEqual({
      email: 'test@example.com',
      username: 'tester',
      password: 'pass',
    });
  });

  test('when fetching a workspace list, it includes the auth header', () => {
    fetchWorkspaces('token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when creating a workspace, it sends json headers and payload', () => {
    createWorkspace({ name: 'New' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'New' }),
    });
  });

  test('when updating a workspace, it targets the workspace endpoint', () => {
    updateWorkspace(3, { name: 'Updated' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/3/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'Updated' }),
    });
  });

  test('when deleting a workspace, it uses the delete verb', () => {
    deleteWorkspace(5, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/5/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });

  test('when fetching todo lists, it adds the workspace query', () => {
    fetchTodoLists(2, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/?workspace=2', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when creating a todo list, it hits the workspace endpoint', () => {
    createTodoList(2, { name: 'List' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/?workspace=2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'List' }),
    });
  });

  test('when updating a todo list, it hits the todo list endpoint', () => {
    updateTodoList(4, { name: 'Updated' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/4/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'Updated' }),
    });
  });

  test('when deleting a todo list, it hits the todo list endpoint', () => {
    deleteTodoList(6, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/6/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });

  test('when fetching notes, it uses the todo_list query', () => {
    fetchNotes(8, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/?todo_list=8', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when creating notes, it uses the notes endpoint', () => {
    createNote(8, { note: 'Hello' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/?todo_list=8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ note: 'Hello' }),
    });
  });

  test('when updating notes, it uses the note endpoint', () => {
    updateNote(10, { note: 'Updated' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/10/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ note: 'Updated' }),
    });
  });

  test('when deleting notes, it uses the note endpoint', () => {
    deleteNote(12, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/12/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });

  test('when fetching a workspace, it targets the id endpoint', () => {
    fetchWorkspace(11, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/11/', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when fetching a todo list, it targets the id endpoint', () => {
    fetchTodoList(22, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/todolists/22/', {
      headers: { Authorization: 'Bearer token' },
    });
  });
});
