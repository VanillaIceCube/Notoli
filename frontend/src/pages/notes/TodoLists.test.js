import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import TodoLists from './TodoLists';
import { renderWithProviders } from '../../test-utils';
import {
  createTodoList,
  deleteTodoList,
  fetchTodoLists as fetchTodoListsApi,
  updateTodoList,
} from '../../services/BackendClient';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

jest.mock('../../services/BackendClient', () => ({
  createTodoList: jest.fn(),
  deleteTodoList: jest.fn(),
  fetchTodoLists: jest.fn(),
  updateTodoList: jest.fn(),
}));

const defaultTodoLists = [
  { id: 10, name: 'test_todolist_01' },
  { id: 11, name: 'test_todolist_02' },
];

function createDeferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function renderTodoLists() {
  const setAppBarHeader = jest.fn();
  const view = renderWithProviders(<TodoLists setAppBarHeader={setAppBarHeader} />);

  await waitFor(() => {
    expect(fetchTodoListsApi).toHaveBeenCalledWith('1', 'token');
  });

  return { ...view, setAppBarHeader };
}

describe('TodoLists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    mockUseParams.mockReturnValue({ workspaceId: '1' });
    fetchTodoListsApi.mockResolvedValue({
      ok: true,
      json: async () => defaultTodoLists,
    });
  });

  test('when the page loads, it shows a loading state', async () => {
    const deferred = createDeferred();
    fetchTodoListsApi.mockReturnValueOnce(deferred.promise);

    renderWithProviders(<TodoLists setAppBarHeader={jest.fn()} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    deferred.resolve({ ok: true, json: async () => [] });
    expect(await screen.findByText(/no to-do lists found/i)).toBeInTheDocument();
  });

  test('when the fetch succeeds, it renders the list items', async () => {
    await renderTodoLists();

    expect(await screen.findByText('test_todolist_01')).toBeInTheDocument();
    expect(screen.getByText('test_todolist_02')).toBeInTheDocument();
  });

  test('when the fetch fails, it shows an error message', async () => {
    fetchTodoListsApi.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderTodoLists();

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when the add flow is opened, it shows the input', async () => {
    await renderTodoLists();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    expect(screen.getByPlaceholderText(/new todolist name/i)).toBeInTheDocument();
  });

  test('when a valid add is submitted, it creates and renders the new item', async () => {
    createTodoList.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 12, name: 'test_todolist_03' }),
    });

    await renderTodoLists();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new todolist name/i);
    await userEvent.type(input, 'test_todolist_03{enter}');

    await waitFor(() => {
      expect(createTodoList).toHaveBeenCalledWith(
        '1',
        { name: 'test_todolist_03', workspace: '1', description: '' },
        'token',
      );
    });
    expect(await screen.findByText('test_todolist_03')).toBeInTheDocument();
  });

  test('when edit is opened, it shows the edit input prefilled', async () => {
    await renderTodoLists();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /edit/i }));

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test_todolist_01');
  });

  test('when a valid edit is submitted, it updates the item', async () => {
    updateTodoList.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 10, name: 'test_todolist_01 Updated' }),
    });

    await renderTodoLists();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /edit/i }));

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_todolist_01 Updated{enter}');

    await waitFor(() => {
      expect(updateTodoList).toHaveBeenCalledWith(
        10,
        { name: 'test_todolist_01 Updated' },
        'token',
      );
    });
    expect(await screen.findByText('test_todolist_01 Updated')).toBeInTheDocument();
  });

  test('when delete is confirmed, it removes the item', async () => {
    deleteTodoList.mockResolvedValueOnce({ ok: true });

    await renderTodoLists();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));

    await waitFor(() => {
      expect(deleteTodoList).toHaveBeenCalledWith(10, 'token');
    });
    await waitFor(() => {
      expect(screen.queryByText('test_todolist_01')).not.toBeInTheDocument();
    });
  });

  test('when an item is clicked, it navigates to the expected route', async () => {
    await renderTodoLists();

    await userEvent.click(await screen.findByText('test_todolist_01'));

    expect(mockNavigate).toHaveBeenCalledWith('/workspace/1/todolist/10');
  });
});
