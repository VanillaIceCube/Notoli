// @vitest-environment node

import {
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
} from './notoliApiClient';
import { apiFetch } from '../http/requestClient';
vi.mock('../http/requestClient', () => ({
  apiFetch: vi.fn(),
}));
describe('notoliApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(Response.json({ id: 1 }));
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
});
