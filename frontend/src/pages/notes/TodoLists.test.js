import { renderWithProviders, setupUserEvent } from '../../test-utils';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import TodoLists from './TodoLists';
import {
  createTodoList,
  deleteTodoList,
  fetchTodoLists,
  updateTodoList,
} from '../../services/BackendClient';

jest.mock('../../services/BackendClient', () => ({
  createTodoList: jest.fn(),
  deleteTodoList: jest.fn(),
  fetchTodoLists: jest.fn(),
  updateTodoList: jest.fn(),
}));

describe('TodoLists', () => {
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    user = setupUserEvent();
  });

  test('when workspaceId is missing, it does not fetch lists', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<TodoLists setAppBarHeader={jest.fn()} />} />
      </Routes>,
      { routeEntries: ['/'] },
    );

    expect(fetchTodoLists).not.toHaveBeenCalled();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  test('when lists load, it renders them and allows navigation', async () => {
    fetchTodoLists.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 2, name: 'Daily' }],
    });

    renderWithProviders(
      <Routes>
        <Route
          path="/workspace/:workspaceId"
          element={<TodoLists setAppBarHeader={jest.fn()} />}
        />
      </Routes>,
      { routeEntries: ['/workspace/1'] },
    );

    expect(await screen.findByText('Daily')).toBeInTheDocument();
  });

  test('when adding a list, it appends it', async () => {
    fetchTodoLists.mockResolvedValue({ ok: true, json: async () => [] });
    createTodoList.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 10, name: 'New List' }),
    });

    renderWithProviders(
      <Routes>
        <Route
          path="/workspace/:workspaceId"
          element={<TodoLists setAppBarHeader={jest.fn()} />}
        />
      </Routes>,
      { routeEntries: ['/workspace/1'] },
    );

    await user.click(await screen.findByText('Add New'));

    const input = screen.getByPlaceholderText('New TodoList Name…');
    await user.type(input, 'New List{enter}');

    expect(await screen.findByText('New List')).toBeInTheDocument();
  });

  test('when editing and deleting a list, it updates the list', async () => {
    fetchTodoLists.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 7, name: 'Old List' }],
    });
    updateTodoList.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 7, name: 'Updated List' }),
    });
    deleteTodoList.mockResolvedValue({ ok: true });

    renderWithProviders(
      <Routes>
        <Route
          path="/workspace/:workspaceId"
          element={<TodoLists setAppBarHeader={jest.fn()} />}
        />
      </Routes>,
      { routeEntries: ['/workspace/1'] },
    );

    const menuIcons = await screen.findAllByTestId('MoreVertIcon');
    await user.click(menuIcons[0]);
    await user.click(screen.getByText('Edit'));

    const editInput = screen.getByDisplayValue('Old List');
    await user.clear(editInput);
    await user.type(editInput, 'Updated List{enter}');

    expect(await screen.findByText('Updated List')).toBeInTheDocument();

    await user.click(screen.getAllByTestId('MoreVertIcon')[0]);
    await user.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.queryByText('Updated List')).not.toBeInTheDocument();
    });
  });
});
