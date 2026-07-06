import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

import Notes from './Notes';
import { noteFixtures } from '../../test-support/fixtures';
import { collectRowStartPixels } from '../../test-support/layout';
import {
  createDeferred,
  renderWithProviders,
  waitForLoadingToFinish,
} from '../../test-support/utils';
import {
  createNote,
  deleteNote,
  fetchNotes as fetchNotesApi,
  fetchTodoList as fetchTodoListApi,
  updateNote,
} from '../../services/notoliApiClient';

const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockUseParams(),
}));

jest.mock('../../services/notoliApiClient', () => ({
  createNote: jest.fn(),
  deleteNote: jest.fn(),
  fetchNotes: jest.fn(),
  fetchTodoList: jest.fn(),
  reorderNotes: jest.fn(),
  updateNote: jest.fn(),
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

async function renderNotes(routeEntries = ['/workspace/1/todolist/5']) {
  const setAppBarHeader = jest.fn();
  const view = renderWithProviders(
    <>
      <Notes setAppBarHeader={setAppBarHeader} />
      <LocationDisplay />
    </>,
    { routeEntries },
  );

  await waitFor(() => {
    expect(fetchNotesApi).toHaveBeenCalledWith('5', 'token');
  });
  await waitForLoadingToFinish();

  return { ...view, setAppBarHeader };
}

function setMobilePullViewport() {
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 1, configurable: true });
}

describe('Notes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    mockUseParams.mockReturnValue({ todoListId: '5' });
    fetchNotesApi.mockResolvedValue({
      ok: true,
      json: async () => noteFixtures,
    });
    fetchTodoListApi.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'TodoList 5' }),
    });
  });

  test('when the page loads, it shows a loading state', async () => {
    const deferred = createDeferred();
    fetchNotesApi.mockReturnValueOnce(deferred.promise);

    renderWithProviders(<Notes setAppBarHeader={jest.fn()} />, {
      routeEntries: ['/workspace/1/todolist/5'],
    });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    deferred.resolve({ ok: true, json: async () => [] });
    expect(await screen.findByText(/no notes found/i)).toBeInTheDocument();
  });

  test('when the fetch succeeds, it renders the list items', async () => {
    await renderNotes();

    expect(await screen.findByText('test_note_01')).toBeInTheDocument();
    expect(screen.getByText('test_note_02')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /mark test_note_01 complete/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /mark test_note_02 complete/i })).toBeChecked();
  });

  test('when the fetch fails, it shows an error message', async () => {
    fetchNotesApi.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderNotes();

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when the add flow is opened, it shows the input', async () => {
    await renderNotes();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    expect(screen.getByPlaceholderText(/new note/i)).toBeInTheDocument();
  });

  test('when a valid add is submitted, it creates and renders the new item', async () => {
    createNote.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 103, note: 'test_note_03' }),
    });

    await renderNotes();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new note/i);
    await userEvent.type(input, 'test_note_03{enter}');

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith(
        '5',
        { note: 'test_note_03', todo_list: '5', description: '' },
        'token',
      );
    });
    expect(await screen.findByText('test_note_03')).toBeInTheDocument();
  });

  test('when rename is opened, it shows the edit input prefilled', async () => {
    await renderNotes();

    await userEvent.click(
      await screen.findByRole('button', { name: /note actions for test_note_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test_note_01');
  });

  test('when a valid edit is submitted, it updates the item', async () => {
    updateNote.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 101, note: 'test_note_01 Updated', status: 'Not Started' }),
    });

    await renderNotes();

    await userEvent.click(
      await screen.findByRole('button', { name: /note actions for test_note_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_note_01 Updated{enter}');

    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith(101, { note: 'test_note_01 Updated' }, 'token');
    });
    expect(await screen.findByText('test_note_01 Updated')).toBeInTheDocument();
  });

  test('when a checkbox is toggled, it updates the status immediately', async () => {
    updateNote.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 101, note: 'test_note_01', status: 'Complete' }),
    });

    await renderNotes();

    const checkbox = screen.getByRole('checkbox', { name: /mark test_note_01 complete/i });
    await userEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith(101, { status: 'Complete' }, 'token');
    });
    expect(screen.getByText('test_note_01')).toHaveStyle('text-decoration: line-through');
  });

  test('when delete is confirmed, it removes the item', async () => {
    deleteNote.mockResolvedValueOnce({ ok: true });

    await renderNotes();

    await userEvent.click(
      await screen.findByRole('button', { name: /note actions for test_note_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /remove/i }));

    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledWith(101, 'token');
    });
    await waitFor(() => {
      expect(screen.queryByText('test_note_01')).not.toBeInTheDocument();
    });
  });

  test('when an item is clicked, it keeps the current route', async () => {
    await renderNotes();

    const locationBefore = screen.getByTestId('location').textContent;
    await userEvent.click(await screen.findByText('test_note_01'));

    expect(screen.getByTestId('location')).toHaveTextContent(locationBefore);
  });

  test('when reorder mode is opened, it shows drag handles and hides note actions and add', async () => {
    await renderNotes();

    expect(screen.queryByRole('button', { name: /notes page actions/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('note-list')).toHaveStyle('gap: 8px');
    const normalRowStartPixels = collectRowStartPixels(screen.getByTestId('note-list'), [
      'note-row-101',
      'note-row-102',
    ]);

    await userEvent.click(
      await screen.findByRole('button', { name: /note actions for test_note_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /^reorder$/i }));

    expect(screen.getByRole('heading', { name: /reorder notes/i })).toBeInTheDocument();
    expect(screen.getByTestId('note-reorder-list')).toHaveStyle('gap: 8px');
    const reorderRowStartPixels = collectRowStartPixels(screen.getByTestId('note-reorder-list'), [
      'note-reorder-row-101',
      'note-reorder-row-102',
    ]);
    expect([
      reorderRowStartPixels['note-reorder-row-101'],
      reorderRowStartPixels['note-reorder-row-102'],
    ]).toEqual([normalRowStartPixels['note-row-101'], normalRowStartPixels['note-row-102']]);
    expect(screen.getByTestId('note-drag-handle-101')).toBeInTheDocument();
    expect(screen.getByTestId('note-drag-handle-101').style.touchAction).toBe('none');
    expect(screen.getByTestId('note-drag-handle-102')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /note actions for test_note_01/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add new/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /done reordering/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /mark test_note_01 complete/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /mark test_note_02 complete/i })).toBeChecked();
    expect(screen.getByText('test_note_02')).toHaveStyle('text-decoration: line-through');
    expect(screen.getByTestId('note-reorder-row-102')).toHaveStyle('opacity: 0.72');

    await userEvent.click(screen.getByRole('button', { name: /done reordering/i }));

    expect(screen.getByRole('heading', { name: /^notes$/i })).toBeInTheDocument();
  });

  test('when the todo list fetch succeeds, it sets the app bar header', async () => {
    const setAppBarHeader = jest.fn();

    renderWithProviders(<Notes setAppBarHeader={setAppBarHeader} />, {
      routeEntries: ['/workspace/1/todolist/5'],
    });

    await waitFor(() => {
      expect(fetchTodoListApi).toHaveBeenCalledWith('5', 'token');
    });
    await waitFor(() => {
      expect(setAppBarHeader).toHaveBeenCalledWith('TodoList 5');
    });
  });

  test('when the todo list fetch fails, it shows an error and does not set the header', async () => {
    const deferred = createDeferred();
    fetchNotesApi.mockReturnValueOnce(deferred.promise);
    fetchTodoListApi.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    const setAppBarHeader = jest.fn();

    renderWithProviders(<Notes setAppBarHeader={setAppBarHeader} />, {
      routeEntries: ['/workspace/1/todolist/5'],
    });

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
    expect(setAppBarHeader).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve({ ok: true, json: async () => noteFixtures });
    });
    await waitForLoadingToFinish();
  });

  test('when add is opened and Escape is pressed, it closes the add input', async () => {
    await renderNotes();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new note/i);
    await userEvent.type(input, 'test_note_03{Escape}');

    expect(screen.queryByPlaceholderText(/new note/i)).not.toBeInTheDocument();
  });

  test('when rename is opened and Escape is pressed, it closes the edit input', async () => {
    await renderNotes();

    await userEvent.click(
      await screen.findByRole('button', { name: /note actions for test_note_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('when create fails, it shows an error message', async () => {
    createNote.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderNotes();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new note/i);
    await userEvent.type(input, 'test_note_03{enter}');

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when update fails, it shows an error message', async () => {
    updateNote.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderNotes();

    await userEvent.click(
      await screen.findByRole('button', { name: /note actions for test_note_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_note_01 Updated{enter}');

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when delete fails, it shows an error message', async () => {
    deleteNote.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderNotes();

    await userEvent.click(
      await screen.findByRole('button', { name: /note actions for test_note_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /remove/i }));

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when the notes list is empty, it shows the empty state message', async () => {
    fetchNotesApi.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await renderNotes();

    expect(await screen.findByText(/no notes found/i)).toBeInTheDocument();
  });

  test('when a mobile user pulls down from the top, it refreshes the notes', async () => {
    setMobilePullViewport();
    await renderNotes();

    const list = screen.getByTestId('note-list');
    fireEvent.touchStart(list, { touches: [{ clientX: 120, clientY: 20 }] });
    fireEvent.touchMove(list, { touches: [{ clientX: 122, clientY: 112 }] });

    expect(await screen.findByRole('status', { name: /release to refresh/i })).toBeInTheDocument();

    fireEvent.touchEnd(list, { changedTouches: [{ clientX: 122, clientY: 112 }] });

    await waitFor(() => {
      expect(fetchNotesApi).toHaveBeenCalledTimes(2);
    });
  });

  test('when a mobile user pulls down from page whitespace, it refreshes the notes', async () => {
    setMobilePullViewport();
    await renderNotes();

    fireEvent.touchStart(document.body, { touches: [{ clientX: 20, clientY: 20 }] });
    fireEvent.touchMove(document.body, { touches: [{ clientX: 22, clientY: 112 }] });
    fireEvent.touchEnd(document.body, { changedTouches: [{ clientX: 22, clientY: 112 }] });

    await waitFor(() => {
      expect(fetchNotesApi).toHaveBeenCalledTimes(2);
    });
  });

  test('when editing a note, pull down does not refresh', async () => {
    setMobilePullViewport();
    await renderNotes();

    await userEvent.click(
      await screen.findByRole('button', { name: /note actions for test_note_01/i }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    fireEvent.touchStart(input, { touches: [{ clientX: 120, clientY: 20 }] });
    fireEvent.touchMove(input, { touches: [{ clientX: 120, clientY: 120 }] });
    fireEvent.touchEnd(input, { changedTouches: [{ clientX: 120, clientY: 120 }] });

    await waitFor(() => {
      expect(fetchNotesApi).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
