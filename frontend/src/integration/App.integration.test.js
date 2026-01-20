import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { noteFixtures, todoListFixtures, workspaceFixtures } from '../test-fixtures';
import {
  fetchNotes,
  fetchTodoList,
  fetchTodoLists,
  fetchWorkspaces,
} from '../services/backendClient';

jest.mock('../components/MyDrawer', () => () => null);
jest.mock('../components/MySnackbar', () => () => null);

jest.mock('../services/backendClient', () => ({
  createNote: jest.fn(),
  createTodoList: jest.fn(),
  createWorkspace: jest.fn(),
  deleteNote: jest.fn(),
  deleteTodoList: jest.fn(),
  deleteWorkspace: jest.fn(),
  fetchNotes: jest.fn(),
  fetchTodoList: jest.fn(),
  fetchTodoLists: jest.fn(),
  fetchWorkspace: jest.fn(),
  fetchWorkspaces: jest.fn(),
  updateNote: jest.fn(),
  updateTodoList: jest.fn(),
  updateWorkspace: jest.fn(),
}));

describe('App integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');

    fetchWorkspaces.mockResolvedValue({
      ok: true,
      json: async () => workspaceFixtures,
    });
    fetchTodoLists.mockResolvedValue({
      ok: true,
      json: async () => todoListFixtures,
    });
    fetchNotes.mockResolvedValue({
      ok: true,
      json: async () => noteFixtures,
    });
    fetchTodoList.mockResolvedValue({
      ok: true,
      json: async () => todoListFixtures[0],
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  test('navigates from workspaces to todo lists to notes', async () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    const user = userEvent.setup();

    await user.click(await screen.findByText('test_workspace_01'));
    expect(await screen.findByText('test_todolist_01')).toBeInTheDocument();

    await user.click(screen.getByText('test_todolist_01'));
    expect(await screen.findByText('test_note_01')).toBeInTheDocument();
    expect(screen.getByText('test_todolist_01')).toBeInTheDocument();
  });

  test('uses the app bar back button to return to todo lists', async () => {
    window.history.pushState({}, '', '/workspace/1/todolist/10');

    render(<App />);

    const user = userEvent.setup();

    expect(await screen.findByText('test_note_01')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back button/i }));

    expect(await screen.findByText('test_todolist_02')).toBeInTheDocument();
  });
});
