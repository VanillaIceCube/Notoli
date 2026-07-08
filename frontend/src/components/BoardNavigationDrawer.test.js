import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BoardNavigationDrawer from './BoardNavigationDrawer';
import { boardFixtures } from '../test-support/fixtures';
import { renderWithProviders } from '../test-support/utils';
import { getBoardId } from '../utils/Navigation';
import {
  addBoardCollaborator,
  createBoard,
  deleteBoard,
  fetchBoard as fetchBoardApi,
  fetchBoards as fetchBoardsApi,
  removeBoardCollaborator,
  updateBoard,
} from '../services/notoliApiClient';

const mockNavigate = jest.fn();
const mockUseLocation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
}));

jest.mock('../utils/Navigation', () => ({
  getBoardId: jest.fn(),
}));

jest.mock('../services/notoliApiClient', () => ({
  addBoardCollaborator: jest.fn(),
  createBoard: jest.fn(),
  deleteBoard: jest.fn(),
  fetchBoard: jest.fn(),
  fetchBoards: jest.fn(),
  removeBoardCollaborator: jest.fn(),
  updateBoard: jest.fn(),
}));

const defaultBoards = boardFixtures;

async function renderDrawer({
  open = true,
  drawerBoardsLabel = '',
  setDrawerBoardsLabel,
  showSnackbar = jest.fn(),
} = {}) {
  const setDrawerOpen = jest.fn();
  const labelSetter = setDrawerBoardsLabel || jest.fn();

  const view = renderWithProviders(
    <BoardNavigationDrawer
      open={open}
      setDrawerOpen={setDrawerOpen}
      drawerBoardsLabel={drawerBoardsLabel}
      setDrawerBoardsLabel={labelSetter}
      showSnackbar={showSnackbar}
    />,
  );

  await waitFor(() => {
    expect(fetchBoardsApi).toHaveBeenCalledWith('token');
  });

  return { ...view, setDrawerOpen, setDrawerBoardsLabel: labelSetter, showSnackbar };
}

async function openBoardList() {
  await userEvent.click(screen.getByRole('button', { name: /board/i }));
}

describe('BoardNavigationDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    sessionStorage.setItem('username', 'owner');
    sessionStorage.setItem('email', 'owner@example.com');
    mockUseLocation.mockReturnValue({ pathname: '/boards/1' });
    getBoardId.mockReturnValue('1');
    fetchBoardApi.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Main' }),
    });
    fetchBoardsApi.mockResolvedValue({
      ok: true,
      json: async () => defaultBoards,
    });
  });

  test('when the drawer is closed, it keeps components hidden', async () => {
    await renderDrawer({ open: false });

    expect(screen.getByText('notoli')).not.toBeVisible();
  });

  test('when the drawer is open and the board list is expanded, it renders fetched boards', async () => {
    await renderDrawer();

    await openBoardList();

    expect(await screen.findByText('test_board_01')).toBeInTheDocument();
    expect(screen.getByText('test_board_02')).toBeInTheDocument();
  });

  test('when fetching boards fails, it shows an error message', async () => {
    fetchBoardsApi.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderDrawer();

    await openBoardList();

    expect(await screen.findByText('Error: HTTP 500')).toBeInTheDocument();
  });

  test('when the Board header is clicked, it expands the list', async () => {
    await renderDrawer();

    await openBoardList();

    expect(await screen.findByText('test_board_01')).toBeInTheDocument();
  });

  test('when the Board header is clicked again, it collapses the list', async () => {
    await renderDrawer();

    const toggleButton = screen.getByRole('button', { name: /board/i });
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

  test('when Add New is clicked, it shows the new board input', async () => {
    await renderDrawer();

    await openBoardList();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    expect(screen.getByPlaceholderText('New Board Name...')).toBeInTheDocument();
  });

  test('when a valid new name is submitted, it creates and renders the board', async () => {
    createBoard.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 3, name: 'Gamma' }),
    });

    await renderDrawer();

    await openBoardList();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText('New Board Name...');
    await userEvent.type(input, 'Gamma{enter}');

    await waitFor(() => {
      expect(createBoard).toHaveBeenCalledWith({ name: 'Gamma', description: '' }, 'token');
    });
    expect(await screen.findByText('Gamma')).toBeInTheDocument();
  });

  test('when Rename is selected from the menu, it shows the edit input prefilled', async () => {
    await renderDrawer();

    await openBoardList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test_board_01');
  });

  test('when an edit is saved, it updates the board name', async () => {
    updateBoard.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: 'test_board_01 Updated' }),
    });

    await renderDrawer();

    await openBoardList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_board_01 Updated{enter}');

    await waitFor(() => {
      expect(updateBoard).toHaveBeenCalledWith(1, { name: 'test_board_01 Updated' }, 'token');
    });
    expect(await screen.findByText('test_board_01 Updated')).toBeInTheDocument();
  });

  test('when Remove is selected from the menu, it removes the board', async () => {
    deleteBoard.mockResolvedValueOnce({ ok: true });

    await renderDrawer();

    await openBoardList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /remove/i }));

    await waitFor(() => {
      expect(deleteBoard).toHaveBeenCalledWith(1, 'token');
    });
    await waitFor(() => {
      expect(screen.queryByText('test_board_01')).not.toBeInTheDocument();
    });
  });

  test('when Share is selected from the menu, it opens the owner sharing modal with controls', async () => {
    await renderDrawer();

    await openBoardList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /share/i }));

    expect(screen.getByRole('heading', { name: /share.*test_board_01/i })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /remove collab/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove owner/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close sharing dialog/i })).toBeInTheDocument();
  });

  test('when the owner adds a collaborator from the drawer share modal, the modal list updates', async () => {
    addBoardCollaborator.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...boardFixtures[1],
        collaborators_details: [
          { id: 3, username: 'new-user', email: 'new@example.com', display_name: 'new-user' },
        ],
      }),
    });

    await renderDrawer();

    await openBoardList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[1]);
    await userEvent.click(screen.getByRole('menuitem', { name: /share/i }));
    await userEvent.type(screen.getByLabelText(/username or email address/i), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(addBoardCollaborator).toHaveBeenCalledWith(
        2,
        { identifier: 'new@example.com' },
        'token',
      );
    });
    expect(await screen.findByText('new-user')).toBeInTheDocument();
  });

  test('when adding a missing collaborator fails, it shows the error in a snackbar', async () => {
    const showSnackbar = jest.fn();
    addBoardCollaborator.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'No user found for that username or email.' }),
    });

    await renderDrawer({ showSnackbar });

    await openBoardList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[1]);
    await userEvent.click(screen.getByRole('menuitem', { name: /share/i }));
    await userEvent.type(
      screen.getByLabelText(/username or email address/i),
      'missing@example.com',
    );
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));

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
      ok: true,
      json: async () => ({ ...boardFixtures[0], collaborators_details: [] }),
    });

    await renderDrawer();

    await openBoardList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /share/i }));
    await userEvent.click(screen.getByRole('button', { name: /remove collab/i }));

    await waitFor(() => {
      expect(removeBoardCollaborator).toHaveBeenCalledWith(1, 2, 'token');
    });
    await waitFor(() => {
      expect(screen.queryByText('collab')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  test('when a non-owner opens Share from the drawer, add and remove controls are hidden', async () => {
    sessionStorage.setItem('username', 'collab');
    sessionStorage.setItem('email', 'collab@example.com');

    await renderDrawer();

    await openBoardList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /share/i }));

    expect(screen.queryByText(/only owners can manage sharing/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/username or email address/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /remove collab/i })).not.toBeInTheDocument();
  });
});
