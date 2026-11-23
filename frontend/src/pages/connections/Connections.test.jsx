import { startSession } from '../../services/sessionState';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '../../test-helpers/utils';
import AuthenticatedRoute from '../../components/app-core/AuthenticatedRoute';
import ConnectedApps, { OAuthConsent } from './Connections';
import Login from '../authentication/Login';
import * as connections from '../../services/connectionsClient';
import { login } from '../../services/authApiClient';
import { fetchBoards } from '../../services/notoliApiClient';
vi.mock('../../services/connectionsClient');
vi.mock('../../services/notoliApiClient', () => ({
  fetchBoards: vi.fn(),
}));
vi.mock('../../services/authApiClient', () => ({
  login: vi.fn(),
}));
const query =
  '?client_id=notoli-chatgpt&state=a%26b%3D%3F&resource=https%3A%2F%2Fnotoli.example%2Fmcp';
const readDescription =
  'Read your accessible Notoli boards, lists, and items, including board owner and collaborator IDs, usernames, and email addresses';
const consent = {
  application: {
    name: 'Notoli for ChatGPT',
    client_id: 'notoli-chatgpt',
  },
  user: {
    username: 'alice',
  },
  permissions: [
    {
      scope: 'notoli:read',
      description: readDescription,
    },
    {
      scope: 'notoli:write',
      description: 'Add and update items',
    },
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
        <Route path="/login" element={<Login showSnackbar={vi.fn()} />} />
      </Routes>
      <LocationDisplay />
    </>,
    {
      routeEntries: [route],
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem('accessToken', 'JWT');
  connections.loadConsent.mockResolvedValue(consent);
  connections.decideConsent.mockResolvedValue({
    redirect_url: 'https://chatgpt.com/callback?code=CODE&state=STATE',
  });
  connections.loadConnections.mockResolvedValue({
    applications: [
      {
        id: 1,
        name: 'ChatGPT',
        client_id: 'gpt',
      },
    ],
  });
  connections.revokeConnection.mockResolvedValue({
    revoked: true,
  });
  login.mockResolvedValue({
    access: 'NEW-JWT',
    refresh: 'REFRESH',
    username: 'alice',
  });
});
test('an authenticated user goes directly to consent with application, identity and permissions', async () => {
  renderFlow();
  expect(await screen.findByText('Signed in as alice')).toBeInTheDocument();
  expect(screen.getByText('Notoli for ChatGPT')).toBeInTheDocument();
  expect(screen.getByText('Application ID: notoli-chatgpt')).toBeInTheDocument();
  expect(screen.getByText(readDescription)).toBeInTheDocument();
  expect(screen.getByText('Add and update items')).toBeInTheDocument();
  expect(connections.loadConsent).toHaveBeenCalledWith(query);
  expect(login).not.toHaveBeenCalled();
});
test('expanded consent explains sharing, organization, notifications and permanent deletion', async () => {
  const permissions = [
    {
      scope: 'notoli:share',
      description:
        'Add and remove collaborators on boards you own, granting access to every list and item in those boards',
    },
    {
      scope: 'notoli:organize',
      description:
        'Create and edit boards and lists, reorder lists and items, and change which lists contain items',
    },
    {
      scope: 'notoli:notifications',
      description: 'Read your activity notifications and mark them read or unread',
    },
    {
      scope: 'notoli:delete',
      description:
        'Permanently delete accessible items and lists, boards you own with all their contents, and your notifications',
    },
  ];
  connections.loadConsent.mockResolvedValue({
    ...consent,
    permissions: [...consent.permissions, ...permissions],
  });
  renderFlow();
  for (const permission of permissions) {
    expect(await screen.findByText(permission.description)).toBeInTheDocument();
  }
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Allow',
    }),
  );
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
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Login',
    }),
  );
  expect(await screen.findByText('Signed in as alice')).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent(`/connections/authorize${query}`);
  expect(sessionStorage.getItem('accessToken')).toBe('NEW-JWT');
  expect(fetchBoards).not.toHaveBeenCalled();
});
test('an external login next parameter cannot redirect the user off-site', async () => {
  sessionStorage.clear();
  renderFlow('/login?next=https%3A%2F%2Fattacker.example%2Fconnections');
  await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'password');
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Login',
    }),
  );
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
  await userEvent.click(
    screen.getByRole('button', {
      name: label,
    }),
  );
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
  expect(
    screen.queryByRole('button', {
      name: 'Allow',
    }),
  ).not.toBeInTheDocument();
  expect(connections.followOAuthCallback).not.toHaveBeenCalled();
});
test('failed approval displays the server error without following a callback', async () => {
  connections.decideConsent.mockRejectedValue(new Error('invalid_consent'));
  renderFlow();
  await screen.findByText('Signed in as alice');
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Allow',
    }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid_consent');
  expect(connections.followOAuthCallback).not.toHaveBeenCalled();
});
test('Connected Apps lists and revokes an application', async () => {
  renderFlow('/connections');
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Revoke ChatGPT',
    }),
  );
  expect(await screen.findByText('No connected apps.')).toBeInTheDocument();
  expect(connections.revokeConnection).toHaveBeenCalledWith(1);
});
test('Connected Apps can revoke a pending-only authorization before token exchange', async () => {
  connections.loadConnections.mockResolvedValue({
    applications: [
      {
        id: 7,
        name: 'Pending app',
        client_id: 'pending-client',
      },
    ],
  });
  renderFlow('/connections');
  expect(await screen.findByText('pending-client')).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Revoke Pending app',
    }),
  );
  expect(await screen.findByText('No connected apps.')).toBeInTheDocument();
  expect(connections.revokeConnection).toHaveBeenCalledWith(7);
});
test('failed revocation keeps the connection visible', async () => {
  connections.revokeConnection.mockRejectedValue(new Error('Network error'));
  renderFlow('/connections');
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'Revoke ChatGPT',
    }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
  expect(screen.getByText('ChatGPT')).toBeInTheDocument();
});

test.each(['account change', 'unmount'])(
  'does not follow an old consent decision after %s',
  async (change) => {
    startSession({ access: 'a', refresh: 'r' });
    let finish;
    connections.decideConsent.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { unmount } = renderFlow();
    await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));
    if (change === 'account change') act(() => startSession({ access: 'new', refresh: 'new-r' }));
    else unmount();
    await act(async () => {
      finish({ redirect_url: 'https://example.com/old-callback' });
    });
    expect(connections.followOAuthCallback).not.toHaveBeenCalled();
  },
);
const actionQuery = '?approval_id=opaque-reference';
const actionPreview = {
  ticket: 'SIGNED-ACTION',
  approval: {
    status: 'prepared',
    action: 'sample.delete',
    target_id: 42,
    application: { name: 'Requested client', client_id: 'requested-client' },
    user: { username: 'alice' },
    expires_at: '2026-11-15T10:05:00Z',
    changes: { name: '<img src=x onerror=alert(1)>' },
    current: { name: 'Current record', notes: 'N'.repeat(2200) },
    destructive: true,
    paid: true,
  },
};

test.each([
  ['Approve this action', 'allow', 'approved'],
  ['Cancel action', 'cancel', 'cancelled'],
])(
  'action review requires an explicit %s with the signed exact ticket',
  async (label, decision, status) => {
    connections.loadActionApproval.mockResolvedValue(actionPreview);
    connections.decideActionApproval.mockResolvedValue({
      approval: { ...actionPreview.approval, status },
    });
    renderFlow(`/connections/authorize${actionQuery}`);
    await screen.findByText('Application ID: requested-client');
    expect(screen.getByText('Signed in as alice')).toBeInTheDocument();
    expect(screen.getByText('Target ID: 42')).toBeInTheDocument();
    expect(screen.getByText(/permanently delete or archive/)).toBeInTheDocument();
    expect(screen.getByText(/spend AI credits/)).toBeInTheDocument();
    expect(screen.getByText(/<img src=x onerror=alert/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/Current record/, { selector: 'pre' }).textContent).toContain(
      'N'.repeat(2200),
    );
    expect(connections.loadActionApproval).toHaveBeenCalledWith('opaque-reference', actionQuery);
    expect(connections.decideActionApproval).not.toHaveBeenCalled();
    expect(connections.loadConsent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: label }));
    await screen.findByText(`Status: ${status}`);
    expect(connections.decideActionApproval).toHaveBeenCalledWith(
      'SIGNED-ACTION',
      decision,
      actionQuery,
    );
    expect(connections.followOAuthCallback).not.toHaveBeenCalled();
  },
);

test('stale action decisions clear approval controls and require a fresh review', async () => {
  connections.loadActionApproval.mockResolvedValue(actionPreview);
  connections.decideActionApproval.mockRejectedValue(new Error('Action changed or expired.'));
  renderFlow(`/connections/authorize${actionQuery}`);
  await userEvent.click(await screen.findByRole('button', { name: 'Approve this action' }));
  expect(await screen.findByText(/Reload this page to review/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve this action' })).not.toBeInTheDocument();
  expect(connections.decideActionApproval).toHaveBeenCalledTimes(1);
});

test('framed action approval cannot load a ticket or offer approval', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'self');
  Object.defineProperty(window, 'self', { configurable: true, value: {} });
  try {
    renderFlow(`/connections/authorize${actionQuery}`);
    expect(screen.getByText(/Open this page directly/)).toBeInTheDocument();
    expect(connections.loadActionApproval).not.toHaveBeenCalled();
    expect(connections.decideActionApproval).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(window, 'self', original);
  }
});

test('signed-out action review returns through existing login with only the opaque reference', async () => {
  sessionStorage.clear();
  connections.loadActionApproval.mockResolvedValue(actionPreview);
  renderFlow(`/connections/authorize${actionQuery}`);
  expect(connections.loadActionApproval).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'password');
  await userEvent.click(screen.getByRole('button', { name: 'Login' }));
  await screen.findByText('Signed in as alice');
  expect(screen.getByTestId('location')).toHaveTextContent(`/connections/authorize${actionQuery}`);
  expect(connections.decideActionApproval).not.toHaveBeenCalled();
});

test('an approved action can be cancelled immediately with its new signed ticket', async () => {
  connections.loadActionApproval.mockResolvedValue(actionPreview);
  connections.decideActionApproval
    .mockResolvedValueOnce({
      ticket: 'SIGNED-APPROVED-ACTION',
      approval: { ...actionPreview.approval, status: 'approved' },
    })
    .mockResolvedValueOnce({ approval: { ...actionPreview.approval, status: 'cancelled' } });
  renderFlow(`/connections/authorize${actionQuery}`);
  await userEvent.click(await screen.findByRole('button', { name: 'Approve this action' }));
  await screen.findByText('Status: approved');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
  await screen.findByText('Status: cancelled');
  expect(connections.decideActionApproval).toHaveBeenNthCalledWith(
    1,
    'SIGNED-ACTION',
    'allow',
    actionQuery,
  );
  expect(connections.decideActionApproval).toHaveBeenNthCalledWith(
    2,
    'SIGNED-APPROVED-ACTION',
    'cancel',
    actionQuery,
  );
  expect(connections.loadActionApproval).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Cancel action' })).not.toBeInTheDocument();
  expect(connections.followOAuthCallback).not.toHaveBeenCalled();
});

test.each(
  ['account change', 'unmount'].flatMap((change) =>
    ['preview', 'decision'].flatMap((operation) =>
      ['success', 'failure'].map((outcome) => [change, operation, outcome]),
    ),
  ),
)('ignores action approval %s during a pending %s %s', async (change, operation, outcome) => {
  startSession({ access: 'old-access', refresh: 'old-refresh' });
  let resolve;
  let reject;
  const pending = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  connections.loadActionApproval.mockResolvedValue(actionPreview);
  if (operation === 'preview') connections.loadActionApproval.mockReturnValueOnce(pending);
  else connections.decideActionApproval.mockReturnValueOnce(pending);
  const { unmount } = renderFlow(`/connections/authorize${actionQuery}`);
  if (operation === 'decision') {
    await userEvent.click(await screen.findByRole('button', { name: 'Approve this action' }));
  } else {
    await waitFor(() => expect(connections.loadActionApproval).toHaveBeenCalledTimes(1));
  }
  if (change === 'account change') {
    connections.loadActionApproval.mockResolvedValue({
      ...actionPreview,
      ticket: 'NEW-ACCOUNT-TICKET',
      approval: { ...actionPreview.approval, user: { username: 'bob' } },
    });
    act(() => startSession({ access: 'new-access', refresh: 'new-refresh' }));
    await screen.findByText('Signed in as bob');
  } else {
    unmount();
  }
  await act(async () => {
    if (outcome === 'failure') reject(new Error('Old account action failure.'));
    else {
      resolve({
        ...actionPreview,
        approval: {
          ...actionPreview.approval,
          status: operation === 'decision' ? 'approved' : 'prepared',
        },
      });
    }
  });
  expect(screen.queryByText('Signed in as alice')).not.toBeInTheDocument();
  expect(screen.queryByText('Status: approved')).not.toBeInTheDocument();
  expect(screen.queryByText(/Old account action failure/)).not.toBeInTheDocument();
  expect(connections.decideActionApproval).toHaveBeenCalledTimes(operation === 'decision' ? 1 : 0);
  expect(connections.followOAuthCallback).not.toHaveBeenCalled();
});
