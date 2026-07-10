import {
  login,
  register,
  forgotPassword,
  resetPassword,
  fetchBoards,
  fetchBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  fetchLists,
  fetchList,
  createList,
  updateList,
  deleteList,
  reorderLists,
  fetchNotes,
  createNote,
  updateNote,
  deleteNote,
  reorderNotes,
  fetchNotifications,
  markNotificationRead,
  clearNotification,
  markAllNotificationsRead,
} from './notoliApiClient';
import { apiFetch } from './requestClient';

jest.mock('./requestClient', () => ({
  apiFetch: jest.fn(() => Promise.resolve({ ok: true })),
}));

describe('notoliApiClient', () => {
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

  test('when forgotPassword is called, it posts trimmed email', () => {
    forgotPassword({ email: ' user@example.com ' });

    expect(apiFetch).toHaveBeenCalledWith('/auth/forgot-password/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
  });

  test('when resetPassword is called, it posts uid/token/password', () => {
    resetPassword({ uid: 'abc', token: 'tok', password: 'secret' });

    expect(apiFetch).toHaveBeenCalledWith('/auth/reset-password/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'abc', token: 'tok', password: 'secret' }),
    });
  });

  test('when fetching boards with a token, it sends the auth header', () => {
    fetchBoards('token');

    expect(apiFetch).toHaveBeenCalledWith('/api/boards/', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when fetching boards without a token, it omits the auth header', () => {
    fetchBoards();

    expect(apiFetch).toHaveBeenCalledWith('/api/boards/', {
      headers: {},
    });
  });

  test('when fetching a board, it calls the board endpoint', () => {
    fetchBoard(3, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/boards/3/', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when creating a board, it posts JSON with auth', () => {
    createBoard({ name: 'Alpha' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/boards/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'Alpha' }),
    });
  });

  test('when updating a board, it patches JSON with auth', () => {
    updateBoard(3, { name: 'Beta' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/boards/3/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'Beta' }),
    });
  });

  test('when deleting a board, it deletes with auth', () => {
    deleteBoard(3, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/boards/3/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });

  test('when fetching lists, it calls the board query endpoint', () => {
    fetchLists(9, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/lists/?board=9', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when fetching a list, it calls the list endpoint', () => {
    fetchList(5, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/lists/5/', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when creating a list, it posts JSON with auth', () => {
    createList(9, { name: 'List' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/lists/?board=9', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'List' }),
    });
  });

  test('when updating a list, it patches JSON with auth', () => {
    updateList(5, { name: 'Updated' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/lists/5/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ name: 'Updated' }),
    });
  });

  test('when deleting a list, it deletes with auth', () => {
    deleteList(5, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/lists/5/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });

  test('when reordering lists, it patches the reorder endpoint', () => {
    reorderLists(9, [11, 10], 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/lists/reorder/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ board: 9, ordered_ids: [11, 10] }),
    });
  });

  test('when fetching notes, it calls the list query endpoint', () => {
    fetchNotes(7, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/?list=7', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when creating a note, it posts JSON with auth', () => {
    createNote(7, { note: 'Hello' }, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/?list=7', {
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

  test('when reordering notes, it patches the reorder endpoint', () => {
    reorderNotes(7, [102, 101], 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notes/reorder/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ list: 7, ordered_ids: [102, 101] }),
    });
  });

  test('when fetching notifications, it calls the notifications endpoint', () => {
    fetchNotifications('token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('when marking a notification read, it patches the notification', () => {
    markNotificationRead(4, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/4/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ is_read: true }),
    });
  });

  test('when clearing a notification, it deletes the notification', () => {
    clearNotification(4, 'token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/4/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });

  test('when marking all notifications read, it patches the collection action', () => {
    markAllNotificationsRead('token');

    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/mark-all-read/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    });
  });
});
