import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import MyDrawer from './MyDrawer';
import { renderWithProviders } from '../test-utils';
import { getWorkspaceId } from '../utils/Navigation';
import {
  createWorkspace,
  deleteWorkspace,
  fetchWorkspace as fetchWorkspaceApi,
  fetchWorkspaces as fetchWorkspacesApi,
  updateWorkspace,
} from '../services/backendClient';

const mockNavigate = jest.fn();
const mockUseLocation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
}));

jest.mock('../utils/Navigation', () => ({
  getWorkspaceId: jest.fn(),
}));

jest.mock('../services/backendClient', () => ({
  createWorkspace: jest.fn(),
  deleteWorkspace: jest.fn(),
  fetchWorkspace: jest.fn(),
  fetchWorkspaces: jest.fn(),
  updateWorkspace: jest.fn(),
}));

const defaultWorkspaces = [
  { id: 1, name: 'test_workspace_01' },
  { id: 2, name: 'test_workspace_02' },
];

async function renderDrawer({
  open = true,
  drawerWorkspacesLabel = '',
  setDrawerWorkspacesLabel,
} = {}) {
  const setDrawerOpen = jest.fn();
  const labelSetter = setDrawerWorkspacesLabel || jest.fn();

  const view = renderWithProviders(
    <MyDrawer
      open={open}
      setDrawerOpen={setDrawerOpen}
      drawerWorkspacesLabel={drawerWorkspacesLabel}
      setDrawerWorkspacesLabel={labelSetter}
    />,
  );

  await waitFor(() => {
    expect(fetchWorkspacesApi).toHaveBeenCalledWith('token');
  });

  return { ...view, setDrawerOpen, setDrawerWorkspacesLabel: labelSetter };
}

async function openWorkspaceList() {
  await userEvent.click(screen.getByRole('button', { name: /workspace/i }));
}

describe('MyDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    mockUseLocation.mockReturnValue({ pathname: '/workspaces/1' });
    getWorkspaceId.mockReturnValue('1');
    fetchWorkspaceApi.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Main' }),
    });
    fetchWorkspacesApi.mockResolvedValue({
      ok: true,
      json: async () => defaultWorkspaces,
    });
  });

  test('when the drawer is closed, it keeps components hidden', async () => {
    await renderDrawer({ open: false });

    expect(screen.getByText('notoli')).not.toBeVisible();
  });

  test('when the drawer is open and the workspace list is expanded, it renders fetched workspaces', async () => {
    await renderDrawer();

    await openWorkspaceList();

    expect(await screen.findByText('test_workspace_01')).toBeInTheDocument();
    expect(screen.getByText('test_workspace_02')).toBeInTheDocument();
  });

  test('when fetching workspaces fails, it shows an error message', async () => {
    fetchWorkspacesApi.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderDrawer();

    await openWorkspaceList();

    expect(await screen.findByText('Error: HTTP 500')).toBeInTheDocument();
  });

  test('when the Workspace header is clicked, it expands the list', async () => {
    await renderDrawer();

    await openWorkspaceList();

    expect(await screen.findByText('test_workspace_01')).toBeInTheDocument();
  });

  test('when the Workspace header is clicked again, it collapses the list', async () => {
    await renderDrawer();

    const toggleButton = screen.getByRole('button', { name: /workspace/i });
    await userEvent.click(toggleButton);

    expect(await screen.findByText('test_workspace_01')).toBeInTheDocument();

    await userEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.queryByText('test_workspace_01')).not.toBeInTheDocument();
    });
  });

  test('when a workspace item is clicked, it navigates to the workspace route', async () => {
    await renderDrawer();

    await openWorkspaceList();

    await userEvent.click(await screen.findByText('test_workspace_01'));

    expect(mockNavigate).toHaveBeenCalledWith('/workspace/1');
  });

  test('when Add New is clicked, it shows the new workspace input', async () => {
    await renderDrawer();

    await openWorkspaceList();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    expect(screen.getByPlaceholderText('New Workspace Name...')).toBeInTheDocument();
  });

  test('when a valid new name is submitted, it creates and renders the workspace', async () => {
    createWorkspace.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 3, name: 'Gamma' }),
    });

    await renderDrawer();

    await openWorkspaceList();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText('New Workspace Name...');
    await userEvent.type(input, 'Gamma{enter}');

    await waitFor(() => {
      expect(createWorkspace).toHaveBeenCalledWith({ name: 'Gamma', description: '' }, 'token');
    });
    expect(await screen.findByText('Gamma')).toBeInTheDocument();
  });

  test('when Edit is selected from the menu, it shows the edit input prefilled', async () => {
    await renderDrawer();

    await openWorkspaceList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /edit/i }));

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test_workspace_01');
  });

  test('when an edit is saved, it updates the workspace name', async () => {
    updateWorkspace.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: 'test_workspace_01 Updated' }),
    });

    await renderDrawer();

    await openWorkspaceList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /edit/i }));

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_workspace_01 Updated{enter}');

    await waitFor(() => {
      expect(updateWorkspace).toHaveBeenCalledWith(
        1,
        { name: 'test_workspace_01 Updated' },
        'token',
      );
    });
    expect(await screen.findByText('test_workspace_01 Updated')).toBeInTheDocument();
  });

  test('when Delete is selected from the menu, it removes the workspace', async () => {
    deleteWorkspace.mockResolvedValueOnce({ ok: true });

    await renderDrawer();

    await openWorkspaceList();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));

    await waitFor(() => {
      expect(deleteWorkspace).toHaveBeenCalledWith(1, 'token');
    });
    await waitFor(() => {
      expect(screen.queryByText('test_workspace_01')).not.toBeInTheDocument();
    });
  });
});
