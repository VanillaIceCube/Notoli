import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import ListTasksPage from './ListTasksPage';
import { taskFixtures, boardFixtures } from '../../test-helpers/fixtures';
import { collectRowStartPixels } from '../../test-helpers/layout';
import {
  createDeferred,
  renderWithProviders,
  waitForLoadingToFinish,
} from '../../test-helpers/utils';
import {
  createTask,
  deleteTask,
  fetchTasks,
  fetchList as fetchListApi,
  fetchBoard as fetchBoardApi,
  updateTask,
} from '../../services/notepad/notoliApiClient';
const { mockUseParams } = vi.hoisted(() => ({
  mockUseParams: vi.fn(),
}));
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockUseParams(),
}));
vi.mock('../../services/notepad/notoliApiClient', () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  fetchTasks: vi.fn(),
  fetchList: vi.fn(),
  fetchBoard: vi.fn(),
  reorderTasks: vi.fn(),
  updateTask: vi.fn(),
}));
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}
async function renderTaskPage(routeEntries = ['/board/1/list/5']) {
  const setAppBarHeader = vi.fn();
  const view = renderWithProviders(
    <>
      <ListTasksPage setAppBarHeader={setAppBarHeader} />
      <LocationDisplay />
    </>,
    {
      routeEntries,
    },
  );
  await waitFor(() => {
    expect(fetchTasks).toHaveBeenCalledWith('5');
  });
  await waitForLoadingToFinish();
  return {
    ...view,
    setAppBarHeader,
  };
}
function setMobilePullViewport() {
  Object.defineProperty(window, 'innerWidth', {
    value: 390,
    configurable: true,
  });
  Object.defineProperty(window, 'scrollY', {
    value: 0,
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: 1,
    configurable: true,
  });
}
describe('ListTasksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    mockUseParams.mockReturnValue({
      boardId: '1',
      listId: '5',
    });
    fetchTasks.mockResolvedValue(taskFixtures);
    fetchListApi.mockResolvedValue({
      name: 'List 5',
    });
    fetchBoardApi.mockResolvedValue(boardFixtures[0]);
  });
  test('when the page loads, it shows a loading state', async () => {
    const deferred = createDeferred();
    fetchTasks.mockReturnValueOnce(deferred.promise);
    renderWithProviders(<ListTasksPage setAppBarHeader={vi.fn()} />, {
      routeEntries: ['/board/1/list/5'],
    });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: /^tasks$/i,
      }),
    ).not.toBeInTheDocument();
    deferred.resolve([]);
    expect(await screen.findByText(/no tasks found/i)).toBeInTheDocument();
  });
  test('activating a loaded list updates the header without fetching its data again', async () => {
    const setAppBarHeader = vi.fn();
    const { rerender } = render(
      <ListTasksPage active={false} setAppBarHeader={setAppBarHeader} />,
      {
        wrapper: MemoryRouter,
      },
    );

    await screen.findByText('test_task_01');
    expect(setAppBarHeader).not.toHaveBeenCalled();
    rerender(<ListTasksPage active setAppBarHeader={setAppBarHeader} />);

    expect(setAppBarHeader).toHaveBeenLastCalledWith('test_board_01');
    expect(fetchTasks).toHaveBeenCalledTimes(1);
    expect(fetchListApi).toHaveBeenCalledTimes(1);
    expect(fetchBoardApi).toHaveBeenCalledTimes(1);
  });
  test('when the list fetch succeeds, it shows the list name as the page title', async () => {
    await renderTaskPage();
    expect(
      screen.getByRole('heading', {
        name: 'List 5',
      }),
    ).toBeInTheDocument();
  });
  test('when the fetch succeeds, it renders the list items', async () => {
    await renderTaskPage();
    expect(await screen.findByText('test_task_01')).toBeInTheDocument();
    expect(screen.getByText('test_task_02')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: /mark test_task_01 complete/i,
      }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: /mark test_task_02 complete/i,
      }),
    ).toBeChecked();
  });
  test('when the fetch fails, it shows an error message', async () => {
    fetchTasks.mockRejectedValueOnce(new Error('HTTP 500'));
    await renderTaskPage();
    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });
  test('when the add flow is opened, it shows the input', async () => {
    await renderTaskPage();
    await userEvent.click(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    );
    expect(screen.getByPlaceholderText(/new task/i)).toBeInTheDocument();
  });
  test('when a valid add is submitted, it creates and renders the new item', async () => {
    createTask.mockResolvedValueOnce({
      id: 103,
      text: 'test_task_03',
    });
    await renderTaskPage();
    await userEvent.click(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    );
    const input = screen.getByPlaceholderText(/new task/i);
    await userEvent.type(input, 'test_task_03{enter}');
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith('5', 'test_task_03');
    });
    expect(await screen.findByText('test_task_03')).toBeInTheDocument();
  });
  test('when rename is opened, it shows the edit input prefilled', async () => {
    await renderTaskPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test_task_01');
  });
  test('when row actions are opened, edit, reorder, and delete actions include icons', async () => {
    await renderTaskPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    );
    expect(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    ).toContainElement(screen.getByTestId('EditIcon'));
    expect(
      screen.getByRole('menuitem', {
        name: /reorder/i,
      }),
    ).toContainElement(screen.getByTestId('ReorderIcon'));
    expect(
      screen.getByRole('menuitem', {
        name: /remove/i,
      }),
    ).toContainElement(screen.getByTestId('DeleteIcon'));
  });
  test('when a valid edit is submitted, it updates the item', async () => {
    updateTask.mockResolvedValueOnce({
      id: 101,
      text: 'test_task_01 Updated',
      status: 'Not Started',
    });
    await renderTaskPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    );
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_task_01 Updated{enter}');
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith(101, {
        text: 'test_task_01 Updated',
      });
    });
    expect(await screen.findByText('test_task_01 Updated')).toBeInTheDocument();
  });
  test('when a checkbox is toggled, it updates the status immediately', async () => {
    updateTask.mockResolvedValueOnce({
      id: 101,
      text: 'test_task_01',
      status: 'Complete',
    });
    await renderTaskPage();
    const checkbox = screen.getByRole('checkbox', {
      name: /mark test_task_01 complete/i,
    });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith(101, {
        status: 'Complete',
      });
    });
    expect(screen.getByText('test_task_01')).toHaveStyle('text-decoration: line-through');
  });
  test('when delete is confirmed, it removes the item', async () => {
    deleteTask.mockResolvedValueOnce(undefined);
    await renderTaskPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /remove/i,
      }),
    );
    await waitFor(() => {
      expect(deleteTask).toHaveBeenCalledWith(101);
    });
    await waitFor(() => {
      expect(screen.queryByText('test_task_01')).not.toBeInTheDocument();
    });
  });
  test('when an item is clicked, it keeps the current route', async () => {
    await renderTaskPage();
    const locationBefore = screen.getByTestId('location').textContent;
    await userEvent.click(await screen.findByText('test_task_01'));
    expect(screen.getByTestId('location')).toHaveTextContent(locationBefore);
  });
  test('when reorder mode is opened, it shows drag handles and hides task actions and add', async () => {
    await renderTaskPage();
    expect(
      screen.queryByRole('button', {
        name: /tasks page actions/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('task-list')).toHaveStyle('gap: 8px');
    const normalRowStartPixels = collectRowStartPixels(screen.getByTestId('task-list'), [
      'task-row-101',
      'task-row-102',
    ]);
    await userEvent.click(
      await screen.findByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /^reorder$/i,
      }),
    );
    expect(
      screen.getByRole('heading', {
        name: /reorder tasks/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('task-reorder-list')).toHaveStyle('gap: 8px');
    const reorderRowStartPixels = collectRowStartPixels(screen.getByTestId('task-reorder-list'), [
      'task-reorder-row-101',
      'task-reorder-row-102',
    ]);
    expect([
      reorderRowStartPixels['task-reorder-row-101'],
      reorderRowStartPixels['task-reorder-row-102'],
    ]).toEqual([normalRowStartPixels['task-row-101'], normalRowStartPixels['task-row-102']]);
    expect(screen.getByTestId('task-drag-handle-101')).toBeInTheDocument();
    expect(screen.getByTestId('task-drag-handle-101').style.touchAction).toBe('none');
    expect(screen.getByTestId('task-drag-handle-102')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /add new/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /done reordering/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: /mark test_task_01 complete/i,
      }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: /mark test_task_02 complete/i,
      }),
    ).toBeChecked();
    expect(screen.getByText('test_task_02')).toHaveStyle('text-decoration: line-through');
    expect(screen.getByTestId('task-reorder-row-102')).toHaveStyle('opacity: 0.72');
    await userEvent.click(
      screen.getByRole('button', {
        name: /done reordering/i,
      }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'List 5',
      }),
    ).toBeInTheDocument();
  });
  test('when the board fetch succeeds, it sets the app bar header to the parent board', async () => {
    const setAppBarHeader = vi.fn();
    renderWithProviders(<ListTasksPage setAppBarHeader={setAppBarHeader} />, {
      routeEntries: ['/board/1/list/5'],
    });
    await waitFor(() => {
      expect(fetchBoardApi).toHaveBeenCalledWith('1');
    });
    await waitFor(() => {
      expect(setAppBarHeader).toHaveBeenCalledWith('test_board_01');
    });
    await waitFor(() => {
      expect(document.title).toBe('Notoli - test_board_01 - List 5');
    });
  });
  test('when navigation provides a board name, it sets the app bar header before the fallback request returns', async () => {
    const deferred = createDeferred();
    fetchBoardApi.mockReturnValueOnce(deferred.promise);
    const setAppBarHeader = vi.fn();
    renderWithProviders(<ListTasksPage setAppBarHeader={setAppBarHeader} />, {
      routeEntries: [
        {
          pathname: '/board/1/list/5',
          state: {
            boardName: 'Project board',
            listName: 'Inbox',
          },
        },
      ],
    });
    expect(setAppBarHeader).toHaveBeenCalledWith('Project board');
    expect(document.title).toBe('Notoli - Project board - Inbox');
    await waitForLoadingToFinish();
  });
  test('when the list fetch fails, it shows an error and does not show the old hardcoded title', async () => {
    const deferred = createDeferred();
    fetchTasks.mockReturnValueOnce(deferred.promise);
    fetchListApi.mockRejectedValueOnce(new Error('HTTP 500'));
    const setAppBarHeader = vi.fn();
    renderWithProviders(<ListTasksPage setAppBarHeader={setAppBarHeader} />, {
      routeEntries: ['/board/1/list/5'],
    });
    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: /^tasks$/i,
      }),
    ).not.toBeInTheDocument();
    await act(async () => {
      deferred.resolve(taskFixtures);
    });
    await waitForLoadingToFinish();
  });
  test('when add is opened and Escape is pressed, it closes the add input', async () => {
    await renderTaskPage();
    await userEvent.click(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    );
    const input = screen.getByPlaceholderText(/new task/i);
    await userEvent.type(input, 'test_task_03{Escape}');
    expect(screen.queryByPlaceholderText(/new task/i)).not.toBeInTheDocument();
  });
  test('when rename is opened and Escape is pressed, it closes the edit input', async () => {
    await renderTaskPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    );
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  test('when create fails, it shows an error message', async () => {
    createTask.mockRejectedValueOnce(new Error('HTTP 500'));
    await renderTaskPage();
    await userEvent.click(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    );
    const input = screen.getByPlaceholderText(/new task/i);
    await userEvent.type(input, 'test_task_03{enter}');
    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });
  test('when update fails, it shows an error message', async () => {
    updateTask.mockRejectedValueOnce(new Error('HTTP 500'));
    await renderTaskPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    );
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_task_01 Updated{enter}');
    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });
  test('when delete fails, it shows an error message', async () => {
    deleteTask.mockRejectedValueOnce(new Error('HTTP 500'));
    await renderTaskPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /remove/i,
      }),
    );
    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });
  test('when the last task is gone, the empty row keeps Add New at one complete task-item height', async () => {
    fetchTasks.mockResolvedValueOnce([]);
    await renderTaskPage();
    expect(await screen.findByText(/no tasks found/i)).toBeInTheDocument();
    expect(screen.getByTestId('task-empty-state')).toHaveStyle({
      minHeight: '52px',
      boxSizing: 'border-box',
    });
    expect(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    ).toBeInTheDocument();
  });
  test('when a mobile user pulls down from the top, it refreshes the tasks', async () => {
    setMobilePullViewport();
    await renderTaskPage();
    const list = screen.getByTestId('task-list');
    fireEvent.touchStart(list, {
      touches: [
        {
          clientX: 120,
          clientY: 20,
        },
      ],
    });
    fireEvent.touchMove(list, {
      touches: [
        {
          clientX: 122,
          clientY: 112,
        },
      ],
    });
    expect(
      await screen.findByRole('status', {
        name: /release to refresh/i,
      }),
    ).toBeInTheDocument();
    fireEvent.touchEnd(list, {
      changedTouches: [
        {
          clientX: 122,
          clientY: 112,
        },
      ],
    });
    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledTimes(2);
    });
  });
  test('when a mobile refresh is pending, it keeps existing tasks visible', async () => {
    setMobilePullViewport();
    await renderTaskPage();
    const deferred = createDeferred();
    fetchTasks.mockReturnValueOnce(deferred.promise);
    const list = screen.getByTestId('task-list');
    fireEvent.touchStart(list, {
      touches: [
        {
          clientX: 120,
          clientY: 20,
        },
      ],
    });
    fireEvent.touchMove(list, {
      touches: [
        {
          clientX: 122,
          clientY: 112,
        },
      ],
    });
    fireEvent.touchEnd(list, {
      changedTouches: [
        {
          clientX: 122,
          clientY: 112,
        },
      ],
    });
    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText('test_task_01')).toBeInTheDocument();
    expect(screen.getByText('test_task_02')).toBeInTheDocument();
    expect(screen.queryByText(/^loading/i)).not.toBeInTheDocument();
    deferred.resolve([
      {
        id: 103,
        text: 'test_task_03',
        status: 'Not Started',
      },
    ]);
    expect(await screen.findByText('test_task_03')).toBeInTheDocument();
  });
  test('when a mobile refresh fails, it keeps existing tasks visible with the error', async () => {
    setMobilePullViewport();
    await renderTaskPage();
    fetchTasks.mockRejectedValueOnce(new Error('HTTP 500'));
    const list = screen.getByTestId('task-list');
    fireEvent.touchStart(list, {
      touches: [
        {
          clientX: 120,
          clientY: 20,
        },
      ],
    });
    fireEvent.touchMove(list, {
      touches: [
        {
          clientX: 122,
          clientY: 112,
        },
      ],
    });
    fireEvent.touchEnd(list, {
      changedTouches: [
        {
          clientX: 122,
          clientY: 112,
        },
      ],
    });
    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
    expect(screen.getByText('test_task_01')).toBeInTheDocument();
    expect(screen.getByText('test_task_02')).toBeInTheDocument();
  });
  test('when a mobile user pulls down from page whitespace, it refreshes the tasks', async () => {
    setMobilePullViewport();
    await renderTaskPage();
    fireEvent.touchStart(document.body, {
      touches: [
        {
          clientX: 20,
          clientY: 20,
        },
      ],
    });
    fireEvent.touchMove(document.body, {
      touches: [
        {
          clientX: 22,
          clientY: 112,
        },
      ],
    });
    fireEvent.touchEnd(document.body, {
      changedTouches: [
        {
          clientX: 22,
          clientY: 112,
        },
      ],
    });
    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledTimes(2);
    });
  });
  test('when editing a task, pull down does not refresh', async () => {
    setMobilePullViewport();
    await renderTaskPage();
    await userEvent.click(
      await screen.findByRole('button', {
        name: /task actions for test_task_01/i,
      }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    );
    const input = screen.getByRole('textbox');
    fireEvent.touchStart(input, {
      touches: [
        {
          clientX: 120,
          clientY: 20,
        },
      ],
    });
    fireEvent.touchMove(input, {
      touches: [
        {
          clientX: 120,
          clientY: 120,
        },
      ],
    });
    fireEvent.touchEnd(input, {
      changedTouches: [
        {
          clientX: 120,
          clientY: 120,
        },
      ],
    });
    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
