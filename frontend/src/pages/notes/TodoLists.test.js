import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import TodoLists from './TodoLists';
import { createDeferred, renderWithProviders, waitForLoadingToFinish } from '../../test-utils';
import { todoListFixtures } from '../../test-fixtures';
import {
  createTodoList,
  deleteTodoList,
  fetchTodoLists as fetchTodoListsApi,
  updateTodoList,
} from '../../services/backendClient';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

jest.mock('../../services/backendClient', () => ({
  createTodoList: jest.fn(),
  deleteTodoList: jest.fn(),
  fetchTodoLists: jest.fn(),
  updateTodoList: jest.fn(),
}));

async function renderTodoLists() {
  const setAppBarHeader = jest.fn();
  const view = renderWithProviders(<TodoLists setAppBarHeader={setAppBarHeader} />);

  await waitFor(() => {
    expect(fetchTodoListsApi).toHaveBeenCalledWith('1', 'token');
  });
  await waitForLoadingToFinish();

  return { ...view, setAppBarHeader };
}

describe('TodoLists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    mockUseParams.mockReturnValue({ workspaceId: '1' });
    fetchTodoListsApi.mockResolvedValue({
      ok: true,
      json: async () => todoListFixtures,
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

  test('when the workspaceId is missing, it does not fetch the lists', async () => {
    mockUseParams.mockReturnValue({ workspaceId: undefined });

    renderWithProviders(<TodoLists setAppBarHeader={jest.fn()} />);

    await waitFor(() => {
      expect(fetchTodoListsApi).not.toHaveBeenCalled();
    });
  });

  test('when the fetch succeeds with empty data, it shows the empty state message', async () => {
    fetchTodoListsApi.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await renderTodoLists();

    expect(await screen.findByText(/no to-do lists found/i)).toBeInTheDocument();
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

  test('when create fails, it shows an error message', async () => {
    createTodoList.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderTodoLists();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new todolist name/i);
    await userEvent.type(input, 'test_todolist_03{enter}');

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when add is opened and Escape is pressed, it closes the add input', async () => {
    await renderTodoLists();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new todolist name/i);
    await userEvent.type(input, 'test_todolist_03{Escape}');

    expect(screen.queryByPlaceholderText(/new todolist name/i)).not.toBeInTheDocument();
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

  test('when update fails, it shows an error message', async () => {
    updateTodoList.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderTodoLists();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /edit/i }));

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_todolist_01 Updated{enter}');

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when edit is opened and Escape is pressed, it closes the edit input', async () => {
    await renderTodoLists();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /edit/i }));

    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
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

  test('when delete fails, it shows an error message', async () => {
    deleteTodoList.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderTodoLists();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when an item is clicked, it navigates to the expected route', async () => {
    await renderTodoLists();

    await userEvent.click(await screen.findByText('test_todolist_01'));

    expect(mockNavigate).toHaveBeenCalledWith('/workspace/1/todolist/10');
  });

  test('when the workspaceId changes, it refetches the lists', async () => {
    const { rerender } = renderWithProviders(<TodoLists setAppBarHeader={jest.fn()} />);

    await waitFor(() => {
      expect(fetchTodoListsApi).toHaveBeenCalledWith('1', 'token');
    });

    mockUseParams.mockReturnValue({ workspaceId: '2' });
    fetchTodoListsApi.mockResolvedValueOnce({ ok: true, json: async () => [] });

    rerender(<TodoLists setAppBarHeader={jest.fn()} />);

    await waitFor(() => {
      expect(fetchTodoListsApi).toHaveBeenCalledWith('2', 'token');
    });
  });
});
