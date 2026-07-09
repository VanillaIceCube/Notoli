import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-support/utils';
import BoardShareDialog from './BoardShareDialog';
import { addBoardCollaborator, removeBoardCollaborator } from '../services/notoliApiClient';

jest.mock('../services/notoliApiClient', () => ({
  addBoardCollaborator: jest.fn(),
  removeBoardCollaborator: jest.fn(),
}));

const board = {
  id: 4,
  name: 'Home',
  owner_details: {
    id: 1,
    username: 'owner',
    email: 'owner@example.com',
    display_name: 'Owner User',
  },
  collaborators_details: [
    {
      id: 2,
      username: 'collab',
      email: 'collab@example.com',
      display_name: 'Collaborator User',
    },
  ],
};

function renderDialog(props = {}) {
  return renderWithProviders(
    <BoardShareDialog
      open
      board={board}
      token="token"
      onClose={jest.fn()}
      onBoardUpdated={jest.fn()}
      showSnackbar={jest.fn()}
      {...props}
    />,
  );
}

describe('BoardShareDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('username', 'owner');
    sessionStorage.setItem('email', 'owner@example.com');
  });

  test('renders owner and collaborator access rows', () => {
    renderDialog();

    expect(screen.getByText('Owner User')).toBeInTheDocument();
    expect(screen.getByText('Collaborator User')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Collaborator')).toBeInTheDocument();
  });

  test('does not flash an empty access message after the selected board is cleared', () => {
    renderDialog({ open: false, board: null });

    expect(screen.queryByText('No people have access yet.')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('allows the owner to add a collaborator', async () => {
    const updatedBoard = {
      ...board,
      collaborators_details: [
        ...board.collaborators_details,
        { id: 3, username: 'newuser', email: 'new@example.com' },
      ],
    };
    const onBoardUpdated = jest.fn();
    addBoardCollaborator.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedBoard,
    });

    renderDialog({ onBoardUpdated });

    await userEvent.type(screen.getByLabelText('Username or email address'), 'newuser');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(addBoardCollaborator).toHaveBeenCalledWith(4, { identifier: 'newuser' }, 'token');
    });

    expect(onBoardUpdated).toHaveBeenCalledWith(updatedBoard);
    expect(screen.getByLabelText('Username or email address')).toHaveValue('');
  });

  test('shows an error instead of adding duplicate collaborators', async () => {
    const showSnackbar = jest.fn();
    renderDialog({ showSnackbar });

    await userEvent.type(screen.getByLabelText('Username or email address'), 'collab');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(addBoardCollaborator).not.toHaveBeenCalled();
    expect(showSnackbar).toHaveBeenCalledWith('error', 'That user is already a collaborator.');
  });

  test('allows the owner to remove a collaborator', async () => {
    const updatedBoard = { ...board, collaborators_details: [] };
    const onBoardUpdated = jest.fn();
    removeBoardCollaborator.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedBoard,
    });

    renderDialog({ onBoardUpdated });

    await userEvent.click(screen.getByRole('button', { name: /remove collaborator user/i }));

    await waitFor(() => {
      expect(removeBoardCollaborator).toHaveBeenCalledWith(4, 2, 'token');
    });

    expect(onBoardUpdated).toHaveBeenCalledWith(updatedBoard);
  });

  test('renders read-only access for non-owners without sharing controls', () => {
    sessionStorage.setItem('username', 'collab');
    sessionStorage.setItem('email', 'collab@example.com');

    renderDialog();

    expect(screen.getByText('Sharing is read-only for collaborators.')).toBeInTheDocument();
    expect(screen.queryByText('Invite a collaborator')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Username or email address')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove collaborator user/i }),
    ).not.toBeInTheDocument();
  });
});
