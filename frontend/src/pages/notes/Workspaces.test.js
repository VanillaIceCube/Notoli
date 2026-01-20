import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Workspaces from './Workspaces';
import { renderWithProviders } from '../../test-utils';
import {
  createWorkspace,
  deleteWorkspace,
  fetchWorkspaces as fetchWorkspacesApi,
  updateWorkspace,
} from '../../services/BackendClient';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/BackendClient', () => ({
  createWorkspace: jest.fn(),
  deleteWorkspace: jest.fn(),
  fetchWorkspaces: jest.fn(),
  updateWorkspace: jest.fn(),
}));

const defaultWorkspaces = [
  { id: 1, name: 'test_workspace_01' },
  { id: 2, name: 'test_workspace_02' },
];

function createDeferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function renderWorkspaces() {
  const setAppBarHeader = jest.fn();
  const view = renderWithProviders(<Workspaces setAppBarHeader={setAppBarHeader} />);

  await waitFor(() => {
    expect(fetchWorkspacesApi).toHaveBeenCalledWith('token');
  });

  return { ...view, setAppBarHeader };
}

describe('Workspaces', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('accessToken', 'token');
    fetchWorkspacesApi.mockResolvedValue({
      ok: true,
      json: async () => defaultWorkspaces,
    });
  });

  test('when the page loads, it shows a loading state', async () => {
    const deferred = createDeferred();
    fetchWorkspacesApi.mockReturnValueOnce(deferred.promise);

    renderWithProviders(<Workspaces setAppBarHeader={jest.fn()} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    deferred.resolve({ ok: true, json: async () => [] });
    expect(await screen.findByText(/no to-do lists found/i)).toBeInTheDocument();
  });

  test('when the fetch succeeds, it renders the list items', async () => {
    await renderWorkspaces();

    expect(await screen.findByText('test_workspace_01')).toBeInTheDocument();
    expect(screen.getByText('test_workspace_02')).toBeInTheDocument();
  });

  test('when the fetch fails, it shows an error message', async () => {
    fetchWorkspacesApi.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });

    await renderWorkspaces();

    expect(await screen.findByText('Error: Error: HTTP 500')).toBeInTheDocument();
  });

  test('when the add flow is opened, it shows the input', async () => {
    await renderWorkspaces();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    expect(screen.getByPlaceholderText(/new workspace name/i)).toBeInTheDocument();
  });

  test('when a valid add is submitted, it creates and renders the new item', async () => {
    createWorkspace.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 3, name: 'test_workspace_03' }),
    });

    await renderWorkspaces();

    await userEvent.click(screen.getByRole('button', { name: /add new/i }));

    const input = screen.getByPlaceholderText(/new workspace name/i);
    await userEvent.type(input, 'test_workspace_03{enter}');

    await waitFor(() => {
      expect(createWorkspace).toHaveBeenCalledWith(
        { name: 'test_workspace_03', description: '' },
        'token',
      );
    });
    expect(await screen.findByText('test_workspace_03')).toBeInTheDocument();
  });

  test('when edit is opened, it shows the edit input prefilled', async () => {
    await renderWorkspaces();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /edit/i }));

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('test_workspace_01');
  });

  test('when a valid edit is submitted, it updates the item', async () => {
    updateWorkspace.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: 'test_workspace_01 Updated' }),
    });

    await renderWorkspaces();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /edit/i }));

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'test_workspace_01 Updated{enter}');

    await waitFor(() => {
      expect(updateWorkspace).toHaveBeenCalledWith(1, { name: 'test_workspace_01 Updated' }, 'token');
    });
    expect(await screen.findByText('test_workspace_01 Updated')).toBeInTheDocument();
  });

  test('when delete is confirmed, it removes the item', async () => {
    deleteWorkspace.mockResolvedValueOnce({ ok: true });

    await renderWorkspaces();

    await userEvent.click((await screen.findAllByTestId('MoreVertIcon'))[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));

    await waitFor(() => {
      expect(deleteWorkspace).toHaveBeenCalledWith(1, 'token');
    });
    await waitFor(() => {
      expect(screen.queryByText('test_workspace_01')).not.toBeInTheDocument();
    });
  });

  test('when an item is clicked, it navigates to the expected route', async () => {
    await renderWorkspaces();

    await userEvent.click(await screen.findByText('test_workspace_01'));

    expect(mockNavigate).toHaveBeenCalledWith('/workspace/1');
  });
});
