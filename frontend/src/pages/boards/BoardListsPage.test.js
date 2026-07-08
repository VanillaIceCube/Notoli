import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BoardListsPage from './BoardListsPage';
import { listFixtures, boardFixtures } from '../../test-support/fixtures';
import { collectRowStartPixels } from '../../test-support/layout';
import {
  createDeferred,
  renderWithProviders,
  waitForLoadingToFinish,
} from '../../test-support/utils';
import {
  createList,
  deleteList,
  fetchLists as fetchListsApi,
  fetchBoard as fetchBoardApi,
  updateList,
} from '../../services/notoliApiClient';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

jest.mock('../../services/notoliApiClient', () => ({
  createList: jest.fn(),
  deleteList: jest.fn(),
  fetchLists: jest.fn(),
  fetchBoard: jest.fn(),
  reorderLists: jest.fn(),
  updateList: jest.fn(),
}));

async function renderLists() {
  const setAppBarHeader = jest.fn();
  const view = renderWithProviders(<BoardListsPage setAppBarHeader={setAppBarHeader} />);

  await waitFor(() => {
    expect(fetchListsApi).toHaveBeenCalledWith('1', 'token');
  });
  await waitForLoadingToFinish();

  return { ...view, setAppBarHeader };
}

function setMobilePullViewport() {
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 1, configurable: true });
}

describe('BoardListsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    mockUseParams.mockReturnValue({ boardId: '1' });
    fetchListsApi.mockResolvedValue({
      ok: true,
      json: async () => listFixtures,
    });
    fetchBoardApi.mockResolvedValue({
      ok: true,
      json: async () => boardFixtures[0],
    });
  });

  test('when the page loads, it shows a loading state', async () => {
    const deferred = createDeferred();
    fetchListsApi.mockReturnValueOnce(deferred.promise);

    renderWithProviders(<BoardListsPage setAppBarHeader={jest.fn()} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /lists/i })).not.toBeInTheDocument();

    deferred.resolve({ ok: true, json: async () => [] });
    expect(await screen.findByText(/no lists found/i)).toBeInTheDocument();
  });

  test('when the board fetch succeeds, it shows the board name as the page title', async () => {
    await renderLists();

    expect(fetchBoardApi).toHaveBeenCalledWith('1', 'token');
    expect(screen.getByRole('heading', { name: 'test_board_01' })).toBeInTheDocument();
  });

  test('when the fetch succeeds, it renders the list items', async () => {
    await renderLists();

    expect(await screen.findByText('test_list_01')).toBeInTheDocument();
    expect(screen.getByText('test_list_02')).toBeInTheDocument();
  });

  test('when the fetch fails, it shows an error message', async () => {
    fetchListsApi.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderLists();

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when the boardId is missing, it does not fetch the lists', async () => {
    mockUseParams.mockReturnValue({ boardId: undefined });

    renderWithProviders(<BoardListsPage setAppBarHeader={jest.fn()} />);

    await waitFor(() => {
      expect(fetchListsApi).not.toHaveBeenCalled();
    });
  });

  test('when the fetch succeeds with empty data, it shows the empty state message', async () => {
    fetchListsApi.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await renderLists();

    expect(await screen.findByText(/no lists found/i)).toBeInTheDocument();
  });

  test('when the add flow is opened, it shows the input', async () => {
    await renderLists();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    expect(screen.getByPlaceholderText(/new list name/i)).toBeInTheDocument();
  });

  test('when a valid add is submitted, it creates and renders the new item', async () => {
    createList.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 12, name: 'test_list_03' }),
    });

    await renderLists();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new list name/i);
    await userEvent.type(input, 'test_list_03{enter}');

    await waitFor(() => {
      expect(createList).toHaveBeenCalledWith(
        '1',
        { name: 'test_list_03', board: '1', description: '' },
        'token',
      );
    });
    expect(await screen.findByText('test_list_03')).toBeInTheDocument();
  });

  test('when create fails, it shows an error message', async () => {
    createList.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderLists();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new list name/i);
    await userEvent.type(input, 'test_list_03{enter}');

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when add is opened and Escape is pressed, it closes the add input', async () => {
    await renderLists();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new list name/i);
    await userEvent.type(input, 'test_list_03{Escape}');

    expect(screen.queryByPlaceholderText(/new list name/i)).not.toBeInTheDocument();
  });

  test('when rename is opened, it shows the edit input prefilled', async () => {
    await renderLists();

    await userEvent.click(
      await screen.findByRole('button', { name: /list actions for test_list_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test_list_01');
  });

  test('when row actions are opened, edit, reorder, and delete actions include icons', async () => {
    await renderLists();

    await userEvent.click(
      await screen.findByRole('button', { name: /list actions for test_list_01/i }),
    );

    expect(screen.getByRole('menuitem', { name: /rename/i })).toContainElement(
      screen.getByTestId('EditIcon'),
    );
    expect(screen.getByRole('menuitem', { name: /reorder/i })).toContainElement(
      screen.getByTestId('ReorderIcon'),
    );
    expect(screen.getByRole('menuitem', { name: /remove/i })).toContainElement(
      screen.getByTestId('DeleteIcon'),
    );
  });

  test('when a valid edit is submitted, it updates the item', async () => {
    updateList.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 10, name: 'test_list_01 Updated' }),
    });

    await renderLists();

    await userEvent.click(
      await screen.findByRole('button', { name: /list actions for test_list_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_list_01 Updated{enter}');

    await waitFor(() => {
      expect(updateList).toHaveBeenCalledWith(10, { name: 'test_list_01 Updated' }, 'token');
    });
    expect(await screen.findByText('test_list_01 Updated')).toBeInTheDocument();
  });

  test('when update fails, it shows an error message', async () => {
    updateList.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderLists();

    await userEvent.click(
      await screen.findByRole('button', { name: /list actions for test_list_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_list_01 Updated{enter}');

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when rename is opened and Escape is pressed, it closes the edit input', async () => {
    await renderLists();

    await userEvent.click(
      await screen.findByRole('button', { name: /list actions for test_list_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('when delete is confirmed, it removes the item', async () => {
    deleteList.mockResolvedValueOnce({ ok: true });

    await renderLists();

    await userEvent.click(
      await screen.findByRole('button', { name: /list actions for test_list_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /remove/i }));

    await waitFor(() => {
      expect(deleteList).toHaveBeenCalledWith(10, 'token');
    });
    await waitFor(() => {
      expect(screen.queryByText('test_list_01')).not.toBeInTheDocument();
    });
  });

  test('when delete fails, it shows an error message', async () => {
    deleteList.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderLists();

    await userEvent.click(
      await screen.findByRole('button', { name: /list actions for test_list_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /remove/i }));

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when reorder mode is opened, it shows drag handles and hides row actions and add', async () => {
    await renderLists();

    expect(screen.queryByRole('button', { name: /list page actions/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('list-list')).toHaveStyle('gap: 8px');
    const normalRowStartPixels = collectRowStartPixels(screen.getByTestId('list-list'), [
      'list-row-10',
      'list-row-11',
    ]);

    await userEvent.click(
      await screen.findByRole('button', { name: /list actions for test_list_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /^reorder$/i }));

    expect(screen.getByRole('heading', { name: /reorder lists/i })).toBeInTheDocument();
    expect(screen.getByTestId('list-reorder-list')).toHaveStyle('gap: 8px');
    const reorderRowStartPixels = collectRowStartPixels(screen.getByTestId('list-reorder-list'), [
      'list-reorder-row-10',
      'list-reorder-row-11',
    ]);
    expect([
      reorderRowStartPixels['list-reorder-row-10'],
      reorderRowStartPixels['list-reorder-row-11'],
    ]).toEqual([normalRowStartPixels['list-row-10'], normalRowStartPixels['list-row-11']]);
    expect(screen.getByTestId('list-drag-handle-10')).toBeInTheDocument();
    expect(screen.getByTestId('list-drag-handle-10').style.touchAction).toBe('none');
    expect(screen.getByTestId('list-drag-handle-11')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /list actions for test_list_01/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add new/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /done reordering/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /done reordering/i }));

    expect(screen.getByRole('heading', { name: 'test_board_01' })).toBeInTheDocument();
  });

  test('when an item is clicked, it navigates to the expected route', async () => {
    await renderLists();

    await userEvent.click(await screen.findByText('test_list_01'));

    expect(mockNavigate).toHaveBeenCalledWith('/board/1/list/10');
  });

  test('when the boardId changes, it refetches the lists', async () => {
    const { rerender } = renderWithProviders(<BoardListsPage setAppBarHeader={jest.fn()} />);

    await waitFor(() => {
      expect(fetchListsApi).toHaveBeenCalledWith('1', 'token');
    });

    mockUseParams.mockReturnValue({ boardId: '2' });
    fetchListsApi.mockResolvedValueOnce({ ok: true, json: async () => [] });

    rerender(<BoardListsPage setAppBarHeader={jest.fn()} />);

    await waitFor(() => {
      expect(fetchListsApi).toHaveBeenCalledWith('2', 'token');
    });
  });

  test('when a mobile user pulls down from the top, it refreshes the lists', async () => {
    setMobilePullViewport();
    await renderLists();

    const list = screen.getByTestId('list-list');
    fireEvent.touchStart(list, { touches: [{ clientX: 120, clientY: 20 }] });
    fireEvent.touchMove(list, { touches: [{ clientX: 124, clientY: 112 }] });

    expect(await screen.findByRole('status', { name: /release to refresh/i })).toBeInTheDocument();

    fireEvent.touchEnd(list, { changedTouches: [{ clientX: 124, clientY: 112 }] });

    await waitFor(() => {
      expect(fetchListsApi).toHaveBeenCalledTimes(2);
    });
  });

  test('when a mobile user pulls down from page whitespace, it refreshes the lists', async () => {
    setMobilePullViewport();
    await renderLists();

    fireEvent.touchStart(document.body, { touches: [{ clientX: 20, clientY: 20 }] });
    fireEvent.touchMove(document.body, { touches: [{ clientX: 22, clientY: 112 }] });
    fireEvent.touchEnd(document.body, { changedTouches: [{ clientX: 22, clientY: 112 }] });

    await waitFor(() => {
      expect(fetchListsApi).toHaveBeenCalledTimes(2);
    });
  });

  test('when editing a list, pull down does not refresh', async () => {
    setMobilePullViewport();
    await renderLists();

    await userEvent.click(
      await screen.findByRole('button', { name: /list actions for test_list_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    fireEvent.touchStart(input, { touches: [{ clientX: 120, clientY: 20 }] });
    fireEvent.touchMove(input, { touches: [{ clientX: 120, clientY: 120 }] });
    fireEvent.touchEnd(input, { changedTouches: [{ clientX: 120, clientY: 120 }] });

    await waitFor(() => {
      expect(fetchListsApi).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
