import useBoardList from '../../hooks/notepad/useBoardList';
import useSession from '../../hooks/authentication/useSession';
import {
  getSessionVersion,
  rotateSessionTokens,
  startSession,
} from '../../services/authentication/sessionState';
vi.mock('@mui/material', async () => await vi.importActual('@mui/material'));
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BoardNavigationDrawer from './BoardNavigationDrawer';
import { boardFixtures } from '../../test-helpers/fixtures';
import { createDeferred, renderWithProviders } from '../../test-helpers/utils';
import {
  addBoardCollaborator,
  createBoard,
  deleteBoard,
  fetchBoard as fetchBoardApi,
  fetchBoards as fetchBoardsApi,
  removeBoardCollaborator,
  updateBoard,
} from '../../services/notepad/notoliApiClient';
const { mockNavigate, mockUseLocation } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseLocation: vi.fn(),
}));
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
}));
vi.mock('../../services/notepad/notoliApiClient', () => ({
  addBoardCollaborator: vi.fn(),
  createBoard: vi.fn(),
  deleteBoard: vi.fn(),
  fetchBoard: vi.fn(),
  fetchBoards: vi.fn(),
  removeBoardCollaborator: vi.fn(),
  updateBoard: vi.fn(),
}));
const defaultBoards = boardFixtures;
function DrawerWithBoards(props) {
  const boardList = useBoardList();
  return <BoardNavigationDrawer {...props} boardList={boardList} />;
}
function SessionDrawer(props) {
  const { version } = useSession();
  return <DrawerWithBoards key={version} {...props} />;
}
async function renderDrawer({ open = true, showSnackbar = vi.fn() } = {}) {
  const setDrawerOpen = vi.fn();
  const view = renderWithProviders(
    <SessionDrawer open={open} setDrawerOpen={setDrawerOpen} showSnackbar={showSnackbar} />,
  );
  await waitFor(() => {
    expect(fetchBoardsApi).toHaveBeenCalledWith();
  });
  return { ...view, setDrawerOpen, showSnackbar };
}
async function openBoardList() {
  await userEvent.click(
    screen.getByRole('button', {
      name: /^Board(?: |$)/,
    }),
  );
}
describe('BoardNavigationDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    sessionStorage.setItem('refreshToken', 'refresh');
    sessionStorage.setItem('username', 'owner');
    sessionStorage.setItem('email', 'owner@example.com');
    mockUseLocation.mockReturnValue({ pathname: '/' });
    fetchBoardsApi.mockResolvedValue(defaultBoards);
  });
  test('when the drawer is closed, it keeps components hidden', async () => {
    await renderDrawer({
      open: false,
    });
    expect(screen.getByText('notoli')).not.toBeVisible();
  });
  test('when the drawer is open and the board list is expanded, it renders fetched boards', async () => {
    await renderDrawer();
    await openBoardList();
    expect(await screen.findByText('test_board_01')).toBeInTheDocument();
    expect(screen.getByText('test_board_02')).toBeInTheDocument();
  });
  test('when fetching boards fails, it shows an error message', async () => {
    fetchBoardsApi.mockRejectedValueOnce(new Error('HTTP 500'));
    await renderDrawer();
    await openBoardList();
    expect(await screen.findByText('Error: HTTP 500')).toBeInTheDocument();
  });
  test('when refreshing boards fails, it keeps the existing board list visible', async () => {
    await renderDrawer();
    await openBoardList();
    expect(await screen.findByText('test_board_01')).toBeInTheDocument();
    const deferred = Promise.withResolvers();
    fetchBoardsApi.mockReturnValueOnce(deferred.promise);
    act(() => {
      rotateSessionTokens({ access: 'token-2' }, getSessionVersion(), 'refresh');
    });
    await waitFor(() => {
      expect(fetchBoardsApi).toHaveBeenCalledWith();
    });
    expect(screen.getByText('test_board_01')).toBeInTheDocument();
    expect(screen.getByText('test_board_02')).toBeInTheDocument();
    deferred.reject(new Error('HTTP 500'));
    expect(await screen.findByText('Error: HTTP 500')).toBeInTheDocument();
    expect(screen.getByText('test_board_01')).toBeInTheDocument();
    expect(screen.getByText('test_board_02')).toBeInTheDocument();
  });
  test('when the Board header is clicked, it expands the list', async () => {
    await renderDrawer();
    await openBoardList();
    expect(await screen.findByText('test_board_01')).toBeInTheDocument();
  });
  test('when the Board header is clicked again, it collapses the list', async () => {
    await renderDrawer();
    const toggleButton = screen.getByRole('button', {
      name: /^Board(?: |$)/,
    });
    await userEvent.click(toggleButton);
    expect(await screen.findByText('test_board_01')).toBeInTheDocument();
    await userEvent.click(toggleButton);
    await waitFor(() => {
      expect(screen.queryByText('test_board_01')).not.toBeInTheDocument();
    });
  });
  test('when a board item is clicked, it navigates to the board route', async () => {
    await renderDrawer();
    await openBoardList();
    await userEvent.click(await screen.findByText('test_board_01'));
    expect(mockNavigate).toHaveBeenCalledWith('/board/1');
  });
  test('when the owner opens a board menu, Share, Rename, and Remove are visible', async () => {
    await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    expect(
      screen.getByRole('menuitem', {
        name: /share/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {
        name: /remove/i,
      }),
    ).toBeInTheDocument();
  });
  test('when a collaborator opens a shared board menu, only Share is visible', async () => {
    sessionStorage.setItem('username', 'collab');
    sessionStorage.setItem('email', 'collab@example.com');
    await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    expect(
      screen.getByRole('menuitem', {
        name: /share/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', {
        name: /rename/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', {
        name: /remove/i,
      }),
    ).not.toBeInTheDocument();
  });
  test('when Add New is clicked, it shows the new board input', async () => {
    await renderDrawer();
    await openBoardList();
    await userEvent.click(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    );
    expect(screen.getByPlaceholderText('New Board Name...')).toBeInTheDocument();
  });
  test('when a valid new name is submitted, it creates and renders the board', async () => {
    createBoard.mockResolvedValueOnce({
      id: 3,
      name: 'Gamma',
    });
    await renderDrawer();
    await openBoardList();
    await userEvent.click(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    );
    const input = screen.getByPlaceholderText('New Board Name...');
    await userEvent.type(input, 'Gamma{enter}');
    await waitFor(() => {
      expect(createBoard).toHaveBeenCalledWith({
        name: 'Gamma',
        description: '',
      });
    });
    expect(await screen.findByText('Gamma')).toBeInTheDocument();
  });
  test('when Rename is selected from the menu, it shows the edit input prefilled', async () => {
    await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test_board_01');
  });
  test('labels a list route from the boards already loaded by the drawer', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/board/2/list/10' });
    await renderDrawer();

    expect(await screen.findByRole('button', { name: 'Board test_board_02' })).toBeVisible();
    expect(fetchBoardsApi).toHaveBeenCalledTimes(1);
    expect(fetchBoardApi).not.toHaveBeenCalled();
  });

  test('when an edit is saved, it updates the active board name in the header and list', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/board/1' });
    updateBoard.mockResolvedValueOnce({
      id: 1,
      name: 'test_board_01 Updated',
    });
    await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    );
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_board_01 Updated{enter}');
    await waitFor(() => {
      expect(updateBoard).toHaveBeenCalledWith(1, {
        name: 'test_board_01 Updated',
      });
    });
    expect(await screen.findByRole('button', { name: 'test_board_01 Updated' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Board test_board_01 Updated' })).toBeVisible();
  });
  test('when Remove is selected from the menu, it removes the board', async () => {
    deleteBoard.mockResolvedValueOnce(undefined);
    await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /remove/i,
      }),
    );
    await waitFor(() => {
      expect(deleteBoard).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('test_board_01')).not.toBeInTheDocument();
    });
  });
  test('when Share is selected from the menu, it opens the owner sharing modal with controls', async () => {
    await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /share/i,
      }),
    );
    expect(
      screen.getByRole('heading', {
        name: /share.*test_board_01/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Invite a collaborator')).toBeInTheDocument();
    expect(screen.getByText('People with access')).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByText('OW')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('collab')).toBeInTheDocument();
    expect(screen.getByText('collab@example.com')).toBeInTheDocument();
    expect(screen.getByText('CO')).toBeInTheDocument();
    expect(screen.getByText('Collaborator')).toBeInTheDocument();
    expect(screen.queryByText(/username:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email:/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/username or email address/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /^add$/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: /remove collab/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /remove owner/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /close sharing dialog/i,
      }),
    ).toBeInTheDocument();
  });
  test('when the owner adds a collaborator from the drawer share modal, the modal list updates', async () => {
    addBoardCollaborator.mockResolvedValueOnce({
      ...boardFixtures[1],
      collaborators_details: [
        {
          id: 3,
          username: 'new-user',
          email: 'new@example.com',
          display_name: 'new-user',
        },
      ],
    });
    await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[1]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /share/i,
      }),
    );
    await userEvent.type(screen.getByLabelText(/username or email address/i), 'new@example.com');
    await userEvent.click(
      screen.getByRole('button', {
        name: /^add$/i,
      }),
    );
    await waitFor(() => {
      expect(addBoardCollaborator).toHaveBeenCalledWith(2, {
        identifier: 'new@example.com',
      });
    });
    expect(await screen.findByText('new-user')).toBeInTheDocument();
  });
  test('when adding a missing collaborator fails, it shows the error in a snackbar', async () => {
    const showSnackbar = vi.fn();
    addBoardCollaborator.mockRejectedValueOnce(
      new Error('No user found for that username or email.'),
    );
    await renderDrawer({
      showSnackbar,
    });
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[1]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /share/i,
      }),
    );
    await userEvent.type(
      screen.getByLabelText(/username or email address/i),
      'missing@example.com',
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: /^add$/i,
      }),
    );
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith(
        'error',
        'No user found for that username or email.',
      );
    });
    expect(screen.queryByText('No user found for that username or email.')).not.toBeInTheDocument();
  });
  test('when the owner removes a collaborator from the drawer share modal, the modal list updates', async () => {
    removeBoardCollaborator.mockResolvedValueOnce({
      ...boardFixtures[0],
      collaborators_details: [],
    });
    await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /share/i,
      }),
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: /remove collab/i,
      }),
    );
    await waitFor(() => {
      expect(removeBoardCollaborator).toHaveBeenCalledWith(1, 2);
    });
    await waitFor(() => {
      expect(screen.queryByText('collab')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });
  test('when a non-owner opens Share from the drawer, the access list is read-only', async () => {
    sessionStorage.setItem('username', 'collab');
    sessionStorage.setItem('email', 'collab@example.com');
    await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /share/i,
      }),
    );
    expect(screen.getByText('Sharing is read-only for collaborators.')).toBeInTheDocument();
    expect(screen.queryByText('Invite a collaborator')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/username or email address/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /^add$/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /remove collab/i,
      }),
    ).not.toBeInTheDocument();
  });
  test('when creating a board fails with a custom backend error, it shows snackbar and drawer error', async () => {
    const showSnackbar = vi.fn();
    createBoard.mockRejectedValueOnce(new Error('Board limit reached.'));
    await renderDrawer({
      showSnackbar,
    });
    await openBoardList();
    await userEvent.click(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    );
    const input = screen.getByPlaceholderText('New Board Name...');
    await userEvent.type(input, 'New Board{enter}');
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('error', 'Board limit reached.');
    });
    expect(await screen.findByText('Error: Board limit reached.')).toBeInTheDocument();
  });
  test('when creating a board succeeds, it notifies via snackbar', async () => {
    const showSnackbar = vi.fn();
    createBoard.mockResolvedValueOnce({
      id: 99,
      name: 'Fresh Board',
    });
    await renderDrawer({
      showSnackbar,
    });
    await openBoardList();
    await userEvent.click(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    );
    const input = screen.getByPlaceholderText('New Board Name...');
    await userEvent.type(input, 'Fresh Board{enter}');
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('success', 'Board "Fresh Board" created!');
    });
  });
  test('when renaming a board fails with a custom backend error, it shows snackbar', async () => {
    const showSnackbar = vi.fn();
    updateBoard.mockRejectedValueOnce(new Error('Only the owner can rename this board.'));
    await renderDrawer({
      showSnackbar,
    });
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    );
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed Board{enter}');
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('error', 'Only the owner can rename this board.');
    });
  });
  test('when renaming a board succeeds, it notifies via snackbar', async () => {
    const showSnackbar = vi.fn();
    updateBoard.mockResolvedValueOnce({
      id: 1,
      name: 'Renamed Board',
    });
    await renderDrawer({
      showSnackbar,
    });
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /rename/i,
      }),
    );
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed Board{enter}');
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('success', 'Board renamed to "Renamed Board".');
    });
  });
  test('when removing a board fails with a custom backend error, it shows snackbar', async () => {
    const showSnackbar = vi.fn();
    deleteBoard.mockRejectedValueOnce(new Error('Cannot delete primary board.'));
    await renderDrawer({
      showSnackbar,
    });
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /remove/i,
      }),
    );
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('error', 'Cannot delete primary board.');
    });
  });
  test('when the active board is removed, it redirects to root route and notifies via snackbar', async () => {
    const showSnackbar = vi.fn();
    deleteBoard.mockResolvedValueOnce(undefined);

    mockUseLocation.mockReturnValue({ pathname: '/board/1' });
    await renderDrawer({
      showSnackbar,
    });
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /remove/i,
      }),
    );
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('success', 'Board deleted.');
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
  test('when unauthenticated, it does not call board API endpoints', async () => {
    sessionStorage.removeItem('accessToken');
    renderWithProviders(<SessionDrawer open setDrawerOpen={vi.fn()} showSnackbar={vi.fn()} />);
    await waitFor(() => {
      expect(fetchBoardsApi).not.toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(fetchBoardApi).not.toHaveBeenCalled();
    });
  });
  test('when token is removed before submission, onAdd does not call createBoard', async () => {
    const showSnackbar = vi.fn();
    await renderDrawer({
      showSnackbar,
    });
    await openBoardList();
    await userEvent.click(
      screen.getByRole('button', {
        name: /add new/i,
      }),
    );
    const input = screen.getByPlaceholderText('New Board Name...');
    await userEvent.type(input, 'New Unauth Board');
    sessionStorage.removeItem('accessToken');

    // Trigger onAdd via enter or button
    await userEvent.keyboard('{enter}');
    expect(createBoard).not.toHaveBeenCalled();
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Authentication required.');
  });
  test('a late board list response cannot replace the new account board label', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/board/1' });
    const pending = createDeferred();
    fetchBoardsApi
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue([{ id: 1, name: 'New account board' }]);

    await renderDrawer();
    act(() => startSession({ access: 'new', refresh: 'new-r' }));
    expect(await screen.findByRole('button', { name: 'Board New account board' })).toBeVisible();

    await act(async () => {
      pending.resolve([{ id: 1, name: 'Old account board' }]);
    });
    expect(screen.getByRole('button', { name: 'Board New account board' })).toBeVisible();
    expect(screen.queryByText('Old account board')).not.toBeInTheDocument();
  });

  test('a delete finishing after account replacement cannot navigate or show a stale snackbar', async () => {
    const pending = createDeferred();
    deleteBoard.mockReturnValueOnce(pending.promise);
    const { showSnackbar } = await renderDrawer();
    await openBoardList();
    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /remove/i }));
    expect(deleteBoard).toHaveBeenCalledWith(1);
    act(() => startSession({ access: 'new', refresh: 'new-r' }));
    await act(async () => {
      pending.resolve(undefined);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(showSnackbar).not.toHaveBeenCalled();
  });
});

/* eslint-disable testing-library/no-node-access -- Real MUI portal/exit layout must be measured and its backdrop clicked. */
describe('BoardNavigationDrawer menu transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockUseLocation.mockReturnValue({ pathname: '/' });
    fetchBoardsApi.mockResolvedValue(boardFixtures);
  });

  afterEach(() => vi.restoreAllMocks());

  async function openMenu() {
    sessionStorage.setItem('accessToken', 'fixture');
    sessionStorage.setItem('username', 'owner');
    renderWithProviders(<SessionDrawer open setDrawerOpen={vi.fn()} showSnackbar={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    const icon = (await screen.findAllByTestId('MoreVertIcon'))[0];
    const trigger = icon.closest('button') || icon;
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 20,
      left: 20,
      right: 40,
      bottom: 40,
      width: 20,
      height: 20,
    });
    await userEvent.click(trigger);
    return trigger;
  }

  test.each(['escape', 'outside'])(
    'all owner actions survive the entire %s dismissal transition',
    async (method) => {
      const trigger = await openMenu();
      const menu = screen.getByRole('menu');
      const actions = screen.getAllByRole('menuitem');
      expect(actions.map((item) => item.textContent)).toEqual(['Share', 'Rename', 'Remove']);
      // Force a measurable exit interval in jsdom (it does not lay out the paper).
      vi.spyOn(menu.parentElement, 'clientHeight', 'get').mockReturnValue(180);
      if (method === 'escape') fireEvent.keyDown(menu, { key: 'Escape' });
      else fireEvent.click(menu.closest('.MuiModal-root').querySelector('.MuiBackdrop-root'));
      for (const action of actions) expect(menu).toContainElement(action);
      await waitFor(() => expect(menu).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    },
  );

  test('rapid reopen cancels exit cleanup and keyboard actions stay available', async () => {
    const trigger = await openMenu();
    const menu = screen.getByRole('menu');
    vi.spyOn(menu.parentElement, 'clientHeight', 'get').mockReturnValue(180);
    // Reopen while the previous exit is pending, without waiting for its timeout.
    fireEvent.keyDown(menu, { key: 'Escape' });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeVisible());
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('textbox')).toHaveValue('test_board_01');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
/* eslint-enable testing-library/no-node-access */
