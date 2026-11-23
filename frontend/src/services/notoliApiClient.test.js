// @vitest-environment node

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
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  fetchNotifications,
  markNotificationRead,
  clearNotification,
  clearAllNotifications,
  markAllNotificationsRead,
} from './notoliApiClient';
import { apiFetch } from './requestClient';
vi.mock('./requestClient', () => ({
  apiFetch: vi.fn(),
}));
describe('notoliApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(Response.json({ id: 1 }));
  });
  test('when login uses email, it posts the email payload', async () => {
    await login({
      email: 'user@example.com',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });
  test('when login uses username, it posts the username payload', async () => {
    await login({
      username: 'user1',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      username: 'user1',
      password: 'secret',
    });
  });
  test('when login includes email and username, it prefers email', async () => {
    await login({
      email: 'user@example.com',
      username: 'user1',
      password: 'secret',
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });
  test('when register trims inputs, it posts trimmed values', async () => {
    await register({
      email: ' user@example.com ',
      username: ' user1 ',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      email: 'user@example.com',
      username: 'user1',
      password: 'secret',
    });
  });
  test('when register has blank username, it omits the username', async () => {
    await register({
      email: 'user@example.com',
      username: '   ',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });
  test('when forgotPassword is called, it posts trimmed email', async () => {
    await forgotPassword({
      email: ' user@example.com ',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/forgot-password/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'user@example.com',
      }),
    });
  });
  test('when resetPassword is called, it posts uid/token/password', async () => {
    await resetPassword({
      uid: 'abc',
      token: 'tok',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/reset-password/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid: 'abc',
        token: 'tok',
        password: 'secret',
      }),
    });
  });
  test('fetchBoards returns parsed board data', async () => {
    const boards = [{ id: 3, name: 'Alpha' }];
    apiFetch.mockResolvedValueOnce(Response.json(boards));

    await expect(fetchBoards()).resolves.toEqual(boards);
    expect(apiFetch).toHaveBeenCalledWith('/api/boards/', undefined);
  });

  test('fetchBoards keeps the HTTP status and server message', async () => {
    apiFetch.mockResolvedValueOnce(
      Response.json({ detail: 'Boards are unavailable.' }, { status: 503 }),
    );
    await expect(fetchBoards()).rejects.toMatchObject({
      message: 'Boards are unavailable.',
      status: 503,
    });
  });

  test('when fetching a board, it calls the board endpoint', async () => {
    await fetchBoard(3);
    expect(apiFetch).toHaveBeenCalledWith('/api/boards/3/', undefined);
  });
  test('when creating a board, it posts JSON', async () => {
    await createBoard({
      name: 'Alpha',
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/boards/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Alpha',
      }),
    });
  });
  test('when updating a board, it patches JSON', async () => {
    await updateBoard(3, {
      name: 'Beta',
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/boards/3/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Beta',
      }),
    });
  });
  test('when deleting a board, it deletes', async () => {
    apiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteBoard(3)).resolves.toBeUndefined();
    expect(apiFetch).toHaveBeenCalledWith('/api/boards/3/', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
  test('when fetching lists, it calls the board query endpoint', async () => {
    await fetchLists(9);
    expect(apiFetch).toHaveBeenCalledWith('/api/lists/?board=9', undefined);
  });
  test('when fetching a list, it calls the list endpoint', async () => {
    await fetchList(5);
    expect(apiFetch).toHaveBeenCalledWith('/api/lists/5/', undefined);
  });
  test('when creating a list, it posts JSON', async () => {
    await createList(9, {
      name: 'List',
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/lists/?board=9', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'List',
      }),
    });
  });
  test('when updating a list, it patches JSON', async () => {
    await updateList(5, {
      name: 'Updated',
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/lists/5/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Updated',
      }),
    });
  });
  test('when deleting a list, it deletes', async () => {
    await deleteList(5);
    expect(apiFetch).toHaveBeenCalledWith('/api/lists/5/', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
  test('when reordering lists, it patches the reorder endpoint', async () => {
    await reorderLists(9, [11, 10]);
    expect(apiFetch).toHaveBeenCalledWith('/api/lists/reorder/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        board: 9,
        ordered_ids: [11, 10],
      }),
    });
  });
  test('fetchTasks reads existing notes as tasks with text', async () => {
    apiFetch.mockResolvedValueOnce(
      Response.json([{ id: 2, note: 'Hello', status: 'Not Started' }]),
    );

    await expect(fetchTasks(7)).resolves.toEqual([{ id: 2, text: 'Hello', status: 'Not Started' }]);
    expect(apiFetch).toHaveBeenCalledWith('/api/notes/?list=7', undefined);
  });

  test('createTask sends text as the note field and returns a task', async () => {
    apiFetch.mockResolvedValueOnce(Response.json({ id: 2, note: 'Hello' }));

    await expect(createTask(7, 'Hello')).resolves.toEqual({ id: 2, text: 'Hello' });
    expect(apiFetch).toHaveBeenCalledWith('/api/notes/?list=7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Hello', list: 7, description: '' }),
    });
  });

  test.each([
    [{ text: 'Updated' }, { note: 'Updated' }, 'Updated', 'Not Started'],
    [{ status: 'Complete' }, { status: 'Complete' }, 'Original', 'Complete'],
  ])('updateTask patches only the supplied fields %o', async (changes, payload, text, status) => {
    apiFetch.mockResolvedValueOnce(Response.json({ id: 2, note: text, status }));

    await expect(updateTask(2, changes)).resolves.toEqual({ id: 2, text, status });
    expect(apiFetch).toHaveBeenCalledWith('/api/notes/2/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  test('deleteTask deletes through the notes endpoint', async () => {
    apiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(deleteTask(2)).resolves.toBeUndefined();
    expect(apiFetch).toHaveBeenCalledWith('/api/notes/2/', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  test('reorderTasks returns the reordered tasks using frontend fields', async () => {
    apiFetch.mockResolvedValueOnce(
      Response.json([
        { id: 102, note: 'Second' },
        { id: 101, note: 'First' },
      ]),
    );

    await expect(reorderTasks(7, [102, 101])).resolves.toEqual([
      { id: 102, text: 'Second' },
      { id: 101, text: 'First' },
    ]);
    expect(apiFetch).toHaveBeenCalledWith('/api/notes/reorder/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list: 7, ordered_ids: [102, 101] }),
    });
  });
  test('when fetching notifications, it calls the notifications endpoint', async () => {
    await fetchNotifications();
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/');
  });
  test('when marking a notification read, it patches the notification', async () => {
    await markNotificationRead(4);
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/4/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        is_read: true,
      }),
    });
  });
  test('when clearing a notification, it deletes the notification', async () => {
    await clearNotification(4);
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/4/', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
  test('when clearing all notifications, it deletes the collection action', async () => {
    await clearAllNotifications();
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/clear-all/', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
  test('when marking all notifications read, it patches the collection action', async () => {
    await markAllNotificationsRead();
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/mark-all-read/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
});
