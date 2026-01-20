import { renderWithProviders, setupUserEvent } from '../test-utils';
import { screen, waitFor } from '@testing-library/react';
import MyDrawer from './MyDrawer';
import {
  createWorkspace,
  deleteWorkspace,
  fetchWorkspace,
  fetchWorkspaces,
  updateWorkspace,
} from '../services/BackendClient';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../services/BackendClient', () => ({
  createWorkspace: jest.fn(),
  deleteWorkspace: jest.fn(),
  fetchWorkspace: jest.fn(),
  fetchWorkspaces: jest.fn(),
  updateWorkspace: jest.fn(),
}));

const renderDrawer = (options = {}) =>
  renderWithProviders(
    <MyDrawer
      open
      setDrawerOpen={jest.fn()}
      drawerWorkspacesLabel=""
      setDrawerWorkspacesLabel={jest.fn()}
    />,
    options,
  );

describe('MyDrawer', () => {
  const mockNavigate = jest.fn();
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
    sessionStorage.setItem('accessToken', 'token');
    user = setupUserEvent();
    fetchWorkspace.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Workspace A' }),
    });
  });

  test('when loading, it shows a loading state in the workspace list', async () => {
    fetchWorkspaces.mockReturnValue(new Promise(() => {}));

    renderDrawer();

    await user.click(screen.getByText('Workspace'));

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  test('when the workspace list fails, it shows the error message', async () => {
    fetchWorkspaces.mockResolvedValue({ ok: false, status: 500, json: async () => [] });

    renderDrawer();

    await user.click(screen.getByText('Workspace'));

    expect(await screen.findByText(/error: http 500/i)).toBeInTheDocument();
  });

  test('when workspaces load, clicking a list item navigates to it', async () => {
    fetchWorkspaces.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 3, name: 'Alpha' }],
    });

    renderDrawer();

    await user.click(screen.getByText('Workspace'));

    await user.click(await screen.findByText('Alpha'));

    expect(mockNavigate).toHaveBeenCalledWith('/workspace/3');
  });

  test('when adding a workspace, it appends the new workspace', async () => {
    fetchWorkspaces.mockResolvedValue({ ok: true, json: async () => [] });
    createWorkspace.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 9, name: 'New Workspace' }),
    });

    renderDrawer();

    await user.click(screen.getByText('Workspace'));
    await user.click(await screen.findByText('Add New'));

    const input = screen.getByPlaceholderText('New Workspace Name...');
    await user.type(input, 'New Workspace{enter}');

    expect(await screen.findByText('New Workspace')).toBeInTheDocument();
    expect(createWorkspace).toHaveBeenCalled();
  });

  test('when editing and deleting a workspace, it updates the list', async () => {
    fetchWorkspaces.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 4, name: 'Old Name' }],
    });
    updateWorkspace.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 4, name: 'Updated Name' }),
    });
    deleteWorkspace.mockResolvedValue({ ok: true });

    renderDrawer();

    await user.click(screen.getByText('Workspace'));

    const moreButtons = await screen.findAllByTestId('MoreVertIcon');
    await user.click(moreButtons[0]);
    await user.click(screen.getByText('Edit'));

    const editInput = screen.getByDisplayValue('Old Name');
    await user.clear(editInput);
    await user.type(editInput, 'Updated Name{enter}');

    expect(await screen.findByText('Updated Name')).toBeInTheDocument();

    const updatedMenuIcon = screen.getAllByTestId('MoreVertIcon')[0];
    await user.click(updatedMenuIcon);
    await user.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.queryByText('Updated Name')).not.toBeInTheDocument();
    });
  });
});
