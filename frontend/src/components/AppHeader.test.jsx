vi.mock('@mui/material', async () => await vi.importActual('@mui/material'));
import { Route, Routes } from 'react-router';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppHeader from './AppHeader';
import { renderWithProviders } from '../test-helpers/utils';
import { goBackToParent } from '../utils/Navigation';
import { setNavigate } from '../services/navigationService';
import {
  clearAllNotifications,
  clearNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notoliApiClient';
const { mockNavigate, mockUseLocation, mockNavigateHook } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseLocation: vi.fn(),
  mockNavigateHook: vi.fn(),
}));
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useLocation: mockUseLocation,
  useNavigate: mockNavigateHook,
}));
vi.mock('../utils/Navigation', () => ({
  goBackToParent: vi.fn(),
}));
vi.mock('../services/notoliApiClient', () => ({
  clearAllNotifications: vi.fn(),
  clearNotification: vi.fn(),
  fetchNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));
describe('AppHeader', () => {
  test('supports profile menu keyboard navigation, dismissal, and logout', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppHeader appBarHeader="Notoli" setDrawerOpen={setDrawerOpen} />);

    await user.click(screen.getByLabelText('user profile'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText('user profile'));
    await user.keyboard('{End}{Enter}');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  test.each(['0', '1'])('shows Connected Apps only for enabled MCP (%s)', async (enabled) => {
    vi.stubEnv('VITE_MCP_ENABLED', enabled);
    renderWithProviders(<AppHeader appBarHeader="Notoli" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    if (enabled === '1') {
      const connectionLink = screen.getByRole('menuitem', { name: 'Connected Apps' });
      expect(connectionLink).toHaveAttribute('href', '/connections');
      await userEvent.click(connectionLink);
      expect(mockNavigate).not.toHaveBeenCalled();
    } else {
      expect(screen.queryByRole('menuitem', { name: 'Connected Apps' })).not.toBeInTheDocument();
    }
  });
  const setDrawerOpen = vi.fn();
  const jsonResponse = (body, ok = true) => ({
    ok,
    json: vi.fn().mockResolvedValue(body),
  });
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockNavigateHook.mockReturnValue(mockNavigate);
    setNavigate(mockNavigate);
    mockUseLocation.mockReturnValue({
      pathname: '/',
    });
    fetchNotifications.mockResolvedValue(jsonResponse([]));
    clearAllNotifications.mockResolvedValue({
      ok: true,
    });
    clearNotification.mockResolvedValue({
      ok: true,
    });
    markNotificationRead.mockResolvedValue(
      jsonResponse({
        id: 1,
        title: 'New note in Shared Board',
        message: 'collaborator created "Plan".',
        is_read: true,
        board_name: 'Shared Board',
      }),
    );
    markAllNotificationsRead.mockResolvedValue(
      jsonResponse({
        updated: 1,
      }),
    );
  });
  test('when the route is /login, it does not render the app bar', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/login',
    });
    renderWithProviders(<AppHeader appBarHeader="Header" setDrawerOpen={setDrawerOpen} />);
    expect(screen.queryByText('Header')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('menu')).not.toBeInTheDocument();
  });
  test('when the route is /register, it does not render the app bar', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/register',
    });
    renderWithProviders(<AppHeader appBarHeader="Header" setDrawerOpen={setDrawerOpen} />);
    expect(screen.queryByText('Header')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('menu')).not.toBeInTheDocument();
  });
  test('when the route is /forgot-password, it does not render the app bar', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/forgot-password',
    });
    renderWithProviders(<AppHeader appBarHeader="Header" setDrawerOpen={setDrawerOpen} />);
    expect(screen.queryByText('Header')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('menu')).not.toBeInTheDocument();
  });
  test('when the route is /reset-password, it does not render the app bar', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/reset-password',
    });
    renderWithProviders(<AppHeader appBarHeader="Header" setDrawerOpen={setDrawerOpen} />);
    expect(screen.queryByText('Header')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('menu')).not.toBeInTheDocument();
  });
  test('when the path includes /list, it shows the back button', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/boards/1/list/2',
    });
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    expect(screen.getByLabelText('back button')).toBeInTheDocument();
  });
  test('when the path does not include /list, it does not show the back button', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/boards/1',
    });
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    expect(screen.queryByLabelText('back button')).not.toBeInTheDocument();
  });
  test('when the back button is clicked, it calls goBackToParent', async () => {
    mockUseLocation.mockReturnValue({
      pathname: '/boards/1/list/2',
    });
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('back button'));
    expect(goBackToParent).toHaveBeenCalledWith('/boards/1/list/2', mockNavigate);
  });
  test('when the menu icon is clicked, it toggles setDrawerOpen', async () => {
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('menu'));
    expect(setDrawerOpen).toHaveBeenCalled();
    const [updater] = setDrawerOpen.mock.calls[0];
    expect(typeof updater).toBe('function');
  });
  test('when the user profile icon is clicked, it opens the profile menu', async () => {
    sessionStorage.setItem('username', 'judea');
    sessionStorage.setItem('email', 'judea@example.com');
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
    expect(screen.getByText('judea')).toBeInTheDocument();
    expect(screen.getByText('judea@example.com')).toBeInTheDocument();
  });
  test('when notifications are unread, it shows a badge and notification panel', async () => {
    sessionStorage.setItem('accessToken', 'ACCESS');
    fetchNotifications.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          title: 'New note in Shared Board',
          message: 'collaborator created "Plan" in Ideas.',
          is_read: false,
          board_name: 'Shared Board',
          list_name: 'Ideas',
        },
      ]),
    );
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    expect(await screen.findByText('1')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('notifications'));
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('collaborator created "Plan".')).toBeInTheDocument();
    expect(screen.getByText('Shared Board · Ideas')).toBeInTheDocument();
    expect(screen.queryByText('collaborator created "Plan" in Ideas.')).toBeNull();
    expect(screen.queryByText('New note in Shared Board')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: /clear notification/i,
      }),
    ).toBeInTheDocument();
  });
  test('when there are no notifications, it shows the empty state', async () => {
    sessionStorage.setItem('accessToken', 'ACCESS');
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledWith('ACCESS'));
    await userEvent.click(screen.getByLabelText('notifications'));
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
  });
  test('when a notification is cleared, it removes the notification from the panel', async () => {
    sessionStorage.setItem('accessToken', 'ACCESS');
    fetchNotifications.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          title: 'New note in Shared Board',
          message: 'collaborator created "Plan".',
          is_read: false,
          board_name: 'Shared Board',
        },
      ]),
    );
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await screen.findByText('1');
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(
      screen.getByRole('button', {
        name: /clear notification/i,
      }),
    );
    expect(clearNotification).toHaveBeenCalledWith(1, 'ACCESS');
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: /clear notification/i,
        }),
      ).toBeNull(),
    );
  });
  test('when a notification row is clicked, it marks read and navigates to the target path', async () => {
    sessionStorage.setItem('accessToken', 'ACCESS');
    fetchNotifications.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          title: 'New note in Shared Board',
          message: 'collaborator added "Plan".',
          is_read: false,
          board_name: 'Shared Board',
          list_name: 'Ideas',
          target_path: '/board/12/list/34',
        },
      ]),
    );
    markNotificationRead.mockResolvedValue(
      jsonResponse({
        id: 1,
        title: 'New note in Shared Board',
        message: 'collaborator added "Plan".',
        is_read: true,
        board_name: 'Shared Board',
        list_name: 'Ideas',
        target_path: '/board/12/list/34',
      }),
    );
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await screen.findByText('1');
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(screen.getByText('collaborator added "Plan".'));
    expect(markNotificationRead).toHaveBeenCalledWith(1, 'ACCESS');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/board/12/list/34'));
  });
  test('when mark all read is clicked, it updates all notifications', async () => {
    sessionStorage.setItem('accessToken', 'ACCESS');
    fetchNotifications.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          title: 'New note in Shared Board',
          message: 'collaborator created "Plan".',
          is_read: false,
          board_name: 'Shared Board',
        },
        {
          id: 2,
          title: 'New list in Shared Board',
          message: 'owner created "Ideas".',
          is_read: false,
          board_name: 'Shared Board',
        },
      ]),
    );
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    expect(await screen.findByText('2')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(
      screen.getByRole('button', {
        name: /mark all read/i,
      }),
    );
    expect(markAllNotificationsRead).toHaveBeenCalledWith('ACCESS');
    expect(
      await screen.findByRole('button', {
        name: /clear all/i,
      }),
    ).toBeInTheDocument();
  });
  test('when all notifications are read, Clear all removes them from the panel', async () => {
    sessionStorage.setItem('accessToken', 'ACCESS');
    fetchNotifications.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          title: 'New note in Shared Board',
          message: 'collaborator created "Plan".',
          is_read: true,
          board_name: 'Shared Board',
        },
      ]),
    );
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(
      await screen.findByRole('button', {
        name: /clear all/i,
      }),
    );
    expect(clearAllNotifications).toHaveBeenCalledWith('ACCESS');
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
  });
  test('when no profile info exists, it falls back to username + username@gmail.com', async () => {
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    expect(screen.getByText('username')).toBeInTheDocument();
    expect(screen.getByText('username@gmail.com')).toBeInTheDocument();
  });
  test('when sessionStorage reads throw, it still renders fallback profile values', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    expect(screen.getByText('username')).toBeInTheDocument();
    expect(screen.getByText('username@gmail.com')).toBeInTheDocument();
    getItem.mockRestore();
  });
  test('when Logout is clicked, it clears tokens and redirects to /login', async () => {
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    sessionStorage.setItem('username', 'judea');
    sessionStorage.setItem('email', 'judea@example.com');
    window.history.replaceState({}, '', '/');
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /logout/i,
      }),
    );
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(sessionStorage.getItem('username')).toBeNull();
    expect(sessionStorage.getItem('email')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('pendingSnackbar'))).toEqual({
      severity: 'success',
      message: 'Logout Successful :)',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      replace: true,
    });
  });
  test.each(['network', 'malformed'])(
    'retries a failed load without reporting an empty inbox (%s)',
    async (failure) => {
      sessionStorage.setItem('accessToken', 'access');
      if (failure === 'network') fetchNotifications.mockRejectedValueOnce(new Error('offline'));
      else
        fetchNotifications.mockResolvedValueOnce(
          jsonResponse({
            invalid: true,
          }),
        );
      fetchNotifications.mockResolvedValueOnce(jsonResponse([]));
      renderWithProviders(<AppHeader appBarHeader="Notoli" setDrawerOpen={setDrawerOpen} />);
      await userEvent.click(screen.getByLabelText('notifications'));
      expect(
        await screen.findByText('Notifications are unavailable right now.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('No notifications yet.')).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', {
          name: 'Retry',
        }),
      );
      expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
      expect(fetchNotifications).toHaveBeenCalledTimes(2);
    },
  );
  test('keeps failed clear actions visible and allows retry', async () => {
    sessionStorage.setItem('accessToken', 'access');
    fetchNotifications.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          title: 'Parity notice',
          message: 'Parity message',
          is_read: false,
        },
      ]),
    );
    clearNotification
      .mockResolvedValueOnce({
        ok: false,
      })
      .mockResolvedValueOnce({
        ok: true,
      });
    renderWithProviders(<AppHeader appBarHeader="Notoli" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('notifications'));
    await screen.findByText('Parity message');
    await userEvent.click(screen.getByLabelText('Clear notification'));
    expect(await screen.findByText('Could not clear that notification.')).toBeInTheDocument();
    expect(screen.getByText('Parity message')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Clear notification'));
    await waitFor(() => expect(screen.queryByText('Parity message')).not.toBeInTheDocument());
  });
  test.each(['http', 'json', 'wrong-id'])(
    'keeps unread records and the popover after failed mark-read (%s)',
    async (failure) => {
      sessionStorage.setItem('accessToken', 'access');
      fetchNotifications.mockResolvedValue(
        jsonResponse([
          {
            id: 1,
            title: 'Parity notice',
            message: 'Parity message',
            is_read: false,
            target_path: '/must-not-navigate',
          },
        ]),
      );
      markNotificationRead.mockResolvedValue(
        failure === 'http'
          ? {
              ok: false,
            }
          : {
              ok: true,
              json: async () => {
                if (failure === 'json') throw new Error('Invalid JSON');
                return {
                  id: 99,
                  is_read: true,
                };
              },
            },
      );
      renderWithProviders(<AppHeader appBarHeader="Notoli" setDrawerOpen={setDrawerOpen} />);
      await userEvent.click(screen.getByLabelText('notifications'));
      await userEvent.click(await screen.findByText('Parity message'));
      expect(await screen.findByText('Could not update that notification.')).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Mark all read',
        }),
      ).toBeEnabled();
      expect(mockNavigate).not.toHaveBeenCalledWith('/must-not-navigate');
    },
  );
  test('blocks item and bulk actions through mark-read response parsing', async () => {
    sessionStorage.setItem('accessToken', 'access');
    const notification = {
      id: 1,
      title: 'Parity notice',
      message: 'Parity message',
      is_read: false,
    };
    fetchNotifications.mockResolvedValue(jsonResponse([notification]));
    let resolveJson;
    markNotificationRead.mockResolvedValue({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    });
    renderWithProviders(<AppHeader appBarHeader="Notoli" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(await screen.findByText('Parity message'));
    expect(screen.getByLabelText('Clear notification')).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Mark all read',
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Clear notification'));
    expect(clearNotification).not.toHaveBeenCalled();
    resolveJson({
      ...notification,
      is_read: true,
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Clear all',
        }),
      ).toBeEnabled(),
    );
  });
  test('blocks item actions while a bulk clear is pending and preserves records on failure', async () => {
    sessionStorage.setItem('accessToken', 'access');
    fetchNotifications.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          title: 'Parity notice',
          message: 'Parity message',
          is_read: true,
        },
      ]),
    );
    let resolveClear;
    clearAllNotifications.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveClear = resolve;
      }),
    );
    renderWithProviders(<AppHeader appBarHeader="Notoli" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Clear all',
      }),
    );
    expect(screen.getByLabelText('Clear notification')).toBeDisabled();
    resolveClear({
      ok: false,
    });
    expect(await screen.findByText('Could not clear notifications.')).toBeInTheDocument();
    expect(screen.getByText('Parity message')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Clear all',
      }),
    ).toBeEnabled();
  });
});

describe('AppHeader response and navigation integration', () => {
  const notification = {
    id: 1,
    title: 'Notification title',
    message: 'Notification message',
    is_read: false,
    target_path: '/notification-target',
  };

  beforeEach(async () => {
    const actual = await vi.importActual('react-router');
    mockUseLocation.mockImplementation(actual.useLocation);
    mockNavigateHook.mockImplementation(actual.useNavigate);
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('accessToken', 'access');
  });
  test.each([
    null,
    {},
    'unexpected',
    1,
    ...['title', 'message'].flatMap((field) =>
      [{ text: 'bad' }, ['bad'], 42, true].map((value) => [{ ...notification, [field]: value }]),
    ),
  ])('keeps the header usable for malformed notification JSON: %j', async (body) => {
    fetchNotifications
      .mockResolvedValueOnce({ ok: true, json: async () => body })
      .mockResolvedValue({ ok: true, json: async () => [notification] });
    const user = userEvent.setup();
    renderWithProviders(<AppHeader appBarHeader="Application" setDrawerOpen={vi.fn()} />);
    await user.click(screen.getByLabelText('notifications'));
    expect(await screen.findByText('Notifications are unavailable right now.')).toBeVisible();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Retry/i }));
    expect(await screen.findByText(notification.message)).toBeVisible();
    expect(screen.queryByText('Notifications are unavailable right now.')).not.toBeInTheDocument();
  });

  test.each([
    ['title', {}],
    ['message', []],
    ['target_path', {}],
    ['is_read', 'true'],
    ['board_name', {}],
    ['list_name', {}],
  ])(
    'keeps the cached row and prevents navigation after malformed %s in mark-read',
    async (field, value) => {
      fetchNotifications.mockResolvedValue({ ok: true, json: async () => [notification] });
      markNotificationRead
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...notification, is_read: true, [field]: value }),
        })
        .mockResolvedValue({ ok: true, json: async () => ({ ...notification, is_read: true }) });
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route
            path="/"
            element={<AppHeader appBarHeader="Application" setDrawerOpen={vi.fn()} />}
          />
          <Route path="/notification-target" element={<h1>Notification destination</h1>} />
        </Routes>,
      );
      await user.click(screen.getByLabelText('notifications'));
      await user.click(await screen.findByText(notification.message));
      expect(await screen.findByText('Could not update that notification.')).toBeVisible();
      expect(screen.getByText(notification.message)).toBeVisible();
      expect(
        screen.queryByRole('heading', { name: 'Notification destination' }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Clear notification')).toBeEnabled();
      await user.click(screen.getByText(notification.message));
      expect(
        await screen.findByRole('heading', { name: 'Notification destination' }),
      ).toBeVisible();
      expect(markNotificationRead).toHaveBeenCalledTimes(2);
    },
  );

  test.each(['click', 'keyboard'])(
    'Connected Apps supports %s navigation through its real link',
    async (activation) => {
      vi.stubEnv('VITE_MCP_ENABLED', '1');
      fetchNotifications.mockResolvedValue({ ok: true, json: async () => [] });
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route
            path="/"
            element={<AppHeader appBarHeader="Application" setDrawerOpen={vi.fn()} />}
          />
          <Route path="/connections" element={<h1>Connected Apps destination</h1>} />
        </Routes>,
      );
      await user.click(screen.getByLabelText('user profile'));
      const link = screen.getByRole('menuitem', { name: 'Connected Apps' });
      expect(link).toHaveAttribute('href', '/connections');
      if (activation === 'keyboard') {
        await screen.findByRole('menu');
        await user.keyboard('{ArrowDown}');
        expect(link).toHaveFocus();
        await user.keyboard('{Enter}');
      } else await user.click(link);
      expect(
        await screen.findByRole('heading', { name: 'Connected Apps destination' }),
      ).toBeVisible();
    },
  );
  afterEach(() => vi.unstubAllEnvs());
});
