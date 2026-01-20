import { renderWithProviders } from '../../test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Workspaces from './Workspaces';
import {
  createWorkspace,
  deleteWorkspace,
  fetchWorkspaces,
  updateWorkspace,
} from '../../services/BackendClient';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../../services/BackendClient', () => ({
  createWorkspace: jest.fn(),
  deleteWorkspace: jest.fn(),
  fetchWorkspaces: jest.fn(),
  updateWorkspace: jest.fn(),
}));

describe('Workspaces', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
    sessionStorage.setItem('accessToken', 'token');
  });

  test('when loading, it shows a loading state', () => {
    fetchWorkspaces.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<Workspaces setAppBarHeader={jest.fn()} />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  test('when the workspaces fail to load, it shows the error', async () => {
    fetchWorkspaces.mockResolvedValue({ ok: false, status: 500, json: async () => [] });

    renderWithProviders(<Workspaces setAppBarHeader={jest.fn()} />);

    expect(await screen.findByText(/error: http 500/i)).toBeInTheDocument();
  });

  test('when there are no workspaces, it shows the empty state', async () => {
    fetchWorkspaces.mockResolvedValue({ ok: true, json: async () => [] });

    renderWithProviders(<Workspaces setAppBarHeader={jest.fn()} />);

    expect(await screen.findByText('No to-do lists found.')).toBeInTheDocument();
  });

  test('when a workspace is clicked, it navigates to the workspace', async () => {
    fetchWorkspaces.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 8, name: 'Design' }],
    });

    renderWithProviders(<Workspaces setAppBarHeader={jest.fn()} />);

    await userEvent.click(await screen.findByText('Design'));

    expect(mockNavigate).toHaveBeenCalledWith('/workspace/8');
  });

  test('when adding a workspace, it appends the item', async () => {
    fetchWorkspaces.mockResolvedValue({ ok: true, json: async () => [] });
    createWorkspace.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 5, name: 'New Space' }),
    });

    renderWithProviders(<Workspaces setAppBarHeader={jest.fn()} />);

    await userEvent.click(await screen.findByText('Add New'));

    const input = screen.getByPlaceholderText('New Workspace Name…');
    await userEvent.type(input, 'New Space{enter}');

    expect(await screen.findByText('New Space')).toBeInTheDocument();
  });

  test('when editing and deleting, it updates the list', async () => {
    fetchWorkspaces.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 11, name: 'Old Name' }],
    });
    updateWorkspace.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 11, name: 'Updated Name' }),
    });
    deleteWorkspace.mockResolvedValue({ ok: true });

    renderWithProviders(<Workspaces setAppBarHeader={jest.fn()} />);

    const moreButtons = await screen.findAllByTestId('MoreVertIcon');
    await userEvent.click(moreButtons[0]);
    await userEvent.click(screen.getByText('Edit'));

    const editInput = screen.getByDisplayValue('Old Name');
    await userEvent.clear(editInput);
    await userEvent.type(editInput, 'Updated Name{enter}');

    expect(await screen.findByText('Updated Name')).toBeInTheDocument();

    await userEvent.click(screen.getAllByTestId('MoreVertIcon')[0]);
    await userEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.queryByText('Updated Name')).not.toBeInTheDocument();
    });
  });
});
