import { renderWithProviders, setupUserEvent } from '../../test-utils';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import Notes from './Notes';
import {
  createNote,
  deleteNote,
  fetchNotes,
  fetchTodoList,
  updateNote,
} from '../../services/BackendClient';

jest.mock('../../services/BackendClient', () => ({
  createNote: jest.fn(),
  deleteNote: jest.fn(),
  fetchNotes: jest.fn(),
  fetchTodoList: jest.fn(),
  updateNote: jest.fn(),
}));

describe('Notes', () => {
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    user = setupUserEvent();
  });

  test('when notes load, it fetches list and header', async () => {
    fetchNotes.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, note: 'First Note' }],
    });
    fetchTodoList.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Todo Header' }),
    });
    const setAppBarHeader = jest.fn();

    renderWithProviders(
      <Routes>
        <Route
          path="/workspace/:workspaceId/todolist/:todoListId"
          element={<Notes setAppBarHeader={setAppBarHeader} />}
        />
      </Routes>,
      { routeEntries: ['/workspace/1/todolist/2'] },
    );

    expect(await screen.findByText('First Note')).toBeInTheDocument();

    await waitFor(() => {
      expect(setAppBarHeader).toHaveBeenCalledWith('Todo Header');
    });
  });

  test('when the notes fail to load, it shows the error', async () => {
    fetchNotes.mockResolvedValue({ ok: false, status: 500, json: async () => [] });
    fetchTodoList.mockResolvedValue({ ok: true, json: async () => ({ name: 'Todo Header' }) });

    renderWithProviders(
      <Routes>
        <Route
          path="/workspace/:workspaceId/todolist/:todoListId"
          element={<Notes setAppBarHeader={jest.fn()} />}
        />
      </Routes>,
      { routeEntries: ['/workspace/1/todolist/2'] },
    );

    expect(await screen.findByText(/error: http 500/i)).toBeInTheDocument();
  });

  test('when there are no notes, it shows the empty state', async () => {
    fetchNotes.mockResolvedValue({ ok: true, json: async () => [] });
    fetchTodoList.mockResolvedValue({ ok: true, json: async () => ({ name: 'Todo Header' }) });

    renderWithProviders(
      <Routes>
        <Route
          path="/workspace/:workspaceId/todolist/:todoListId"
          element={<Notes setAppBarHeader={jest.fn()} />}
        />
      </Routes>,
      { routeEntries: ['/workspace/1/todolist/2'] },
    );

    expect(await screen.findByText('No notes found.')).toBeInTheDocument();
  });

  test('when adding a note, it appends it', async () => {
    fetchNotes.mockResolvedValue({ ok: true, json: async () => [] });
    fetchTodoList.mockResolvedValue({ ok: true, json: async () => ({ name: 'Todo Header' }) });
    createNote.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 3, note: 'New Note' }),
    });

    renderWithProviders(
      <Routes>
        <Route
          path="/workspace/:workspaceId/todolist/:todoListId"
          element={<Notes setAppBarHeader={jest.fn()} />}
        />
      </Routes>,
      { routeEntries: ['/workspace/1/todolist/2'] },
    );

    await user.click(await screen.findByText('Add New'));

    const input = screen.getByPlaceholderText('New Note…');
    await user.type(input, 'New Note{enter}');

    expect(await screen.findByText('New Note')).toBeInTheDocument();
  });

  test('when editing and deleting a note, it updates the list', async () => {
    fetchNotes.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 6, note: 'Old Note' }],
    });
    fetchTodoList.mockResolvedValue({ ok: true, json: async () => ({ name: 'Todo Header' }) });
    updateNote.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 6, note: 'Updated Note' }),
    });
    deleteNote.mockResolvedValue({ ok: true });

    renderWithProviders(
      <Routes>
        <Route
          path="/workspace/:workspaceId/todolist/:todoListId"
          element={<Notes setAppBarHeader={jest.fn()} />}
        />
      </Routes>,
      { routeEntries: ['/workspace/1/todolist/2'] },
    );

    const menuIcons = await screen.findAllByTestId('MoreVertIcon');
    await user.click(menuIcons[0]);
    await user.click(screen.getByText('Edit'));

    const editInput = screen.getByDisplayValue('Old Note');
    await user.clear(editInput);
    await user.type(editInput, 'Updated Note{enter}');

    expect(await screen.findByText('Updated Note')).toBeInTheDocument();

    await user.click(screen.getAllByTestId('MoreVertIcon')[0]);
    await user.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.queryByText('Updated Note')).not.toBeInTheDocument();
    });
  });
});
