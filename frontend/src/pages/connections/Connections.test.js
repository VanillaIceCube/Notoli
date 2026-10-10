import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../test-support/utils';
import AuthenticatedRoute from '../../components/AuthenticatedRoute';
import ConnectedApps, { OAuthConsent } from './Connections';
import Login from '../authentication/Login';
import * as connections from '../../services/connectionsClient';
import { fetchBoards, login } from '../../services/notoliApiClient';

jest.mock('../../services/connectionsClient');
jest.mock('../../services/notoliApiClient', () => ({ login: jest.fn(), fetchBoards: jest.fn() }));

const query =
  '?client_id=notoli-chatgpt&state=a%26b%3D%3F&resource=https%3A%2F%2Fnotoli.example%2Fmcp';
const consent = {
  application: { name: 'Notoli for ChatGPT', client_id: 'notoli-chatgpt' },
  user: { username: 'alice' },
  permissions: [
    { scope: 'notoli:read', description: 'Read your lists' },
    { scope: 'notoli:write', description: 'Add and update items' },
  ],
  ticket: 'SIGNED-CONSENT',
};

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderFlow(route = `/connections/authorize${query}`) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/" element={<div>Boards</div>} />
        <Route
          path="/connections/authorize"
          element={
            <AuthenticatedRoute>
              <OAuthConsent />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/connections"
          element={
            <AuthenticatedRoute>
              <ConnectedApps />
            </AuthenticatedRoute>
          }
        />
        <Route path="/login" element={<Login showSnackbar={jest.fn()} />} />
      </Routes>
      <LocationDisplay />
    </>,
    { routeEntries: [route] },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem('accessToken', 'JWT');
  connections.loadConsent.mockResolvedValue(consent);
  connections.decideConsent.mockResolvedValue({
    redirect_url: 'https://chatgpt.com/callback?code=CODE&state=STATE',
  });
  connections.loadConnections.mockResolvedValue({
    applications: [{ id: 1, name: 'ChatGPT', client_id: 'gpt' }],
  });
  connections.revokeConnection.mockResolvedValue({ revoked: true });
  login.mockResolvedValue({
    ok: true,
    json: async () => ({ access: 'NEW-JWT', refresh: 'REFRESH', username: 'alice' }),
  });
});

test('an authenticated user goes directly to consent with application, identity and permissions', async () => {
  renderFlow();
  expect(await screen.findByText('Signed in as alice')).toBeInTheDocument();
  expect(screen.getByText('Notoli for ChatGPT')).toBeInTheDocument();
  expect(screen.getByText('Application ID: notoli-chatgpt')).toBeInTheDocument();
  expect(screen.getByText('Read your lists')).toBeInTheDocument();
  expect(screen.getByText('Add and update items')).toBeInTheDocument();
  expect(connections.loadConsent).toHaveBeenCalledWith(query);
  expect(login).not.toHaveBeenCalled();
});

test('sharing consent explains that collaborators receive access to every list and item in owned boards', async () => {
  const description =
    'Add and remove collaborators on boards you own, granting access to every list and item in those boards';
  connections.loadConsent.mockResolvedValue({
    ...consent,
    permissions: [...consent.permissions, { scope: 'notoli:share', description }],
  });
  renderFlow();
  expect(await screen.findByText(description)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
  await waitFor(() =>
    expect(connections.decideConsent).toHaveBeenCalledWith('SIGNED-CONSENT', 'allow', query),
  );
});

test('signed-out users use existing login, preserve the exact request, and return to consent', async () => {
  sessionStorage.clear();
  renderFlow();
  expect(screen.getByTestId('location')).toHaveTextContent(
    `/login?next=${encodeURIComponent(`/connections/authorize${query}`)}`,
  );
  expect(connections.loadConsent).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'password');
  await userEvent.click(screen.getByRole('button', { name: 'Login' }));
  expect(await screen.findByText('Signed in as alice')).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent(`/connections/authorize${query}`);
  expect(sessionStorage.getItem('accessToken')).toBe('NEW-JWT');
  expect(fetchBoards).not.toHaveBeenCalled();
});

test('an external login next parameter cannot redirect the user off-site', async () => {
  sessionStorage.clear();
  fetchBoards.mockResolvedValue({ ok: true, json: async () => [] });
  renderFlow('/login?next=https%3A%2F%2Fattacker.example%2Fconnections');
  await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'password');
  await userEvent.click(screen.getByRole('button', { name: 'Login' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  expect(connections.loadConsent).not.toHaveBeenCalled();
  expect(connections.followOAuthCallback).not.toHaveBeenCalled();
});

test.each([
  ['Allow', 'allow'],
  ['Cancel', 'cancel'],
])('%s submits the signed request and follows the Django callback', async (label, decision) => {
  renderFlow();
  await screen.findByText('Signed in as alice');
  await userEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() =>
    expect(connections.followOAuthCallback).toHaveBeenCalledWith(
      'https://chatgpt.com/callback?code=CODE&state=STATE',
    ),
  );
  expect(connections.decideConsent).toHaveBeenCalledWith('SIGNED-CONSENT', decision, query);
});

test('invalid consent shows an error and cannot authorize an application', async () => {
  connections.loadConsent.mockRejectedValue(new Error('Invalid redirect URI.'));
  renderFlow();
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid redirect URI.');
  expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument();
  expect(connections.followOAuthCallback).not.toHaveBeenCalled();
});

test('failed approval displays the server error without following a callback', async () => {
  connections.decideConsent.mockRejectedValue(new Error('invalid_consent'));
  renderFlow();
  await screen.findByText('Signed in as alice');
  await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid_consent');
  expect(connections.followOAuthCallback).not.toHaveBeenCalled();
});

test('Connected Apps lists and revokes an application', async () => {
  renderFlow('/connections');
  await userEvent.click(await screen.findByRole('button', { name: 'Revoke ChatGPT' }));
  expect(await screen.findByText('No connected apps.')).toBeInTheDocument();
  expect(connections.revokeConnection).toHaveBeenCalledWith(1);
});

test('failed revocation keeps the connection visible', async () => {
  connections.revokeConnection.mockRejectedValue(new Error('Network error'));
  renderFlow('/connections');
  await userEvent.click(await screen.findByRole('button', { name: 'Revoke ChatGPT' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
  expect(screen.getByText('ChatGPT')).toBeInTheDocument();
});
