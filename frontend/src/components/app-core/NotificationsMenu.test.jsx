vi.mock('@mui/material', async () => await vi.importActual('@mui/material'));
import { Route, Routes } from 'react-router';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsMenu from './NotificationsMenu';
import { renderWithProviders } from '../../test-helpers/utils';
import {
  clearAllNotifications,
  clearNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationApiClient';

const { mockNavigate, mockNavigateHook } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockNavigateHook: vi.fn(),
}));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: mockNavigateHook,
}));

vi.mock('../../services/notificationApiClient', () => ({
  clearAllNotifications: vi.fn(),
  clearNotification: vi.fn(),
  fetchNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));

describe('NotificationsMenu', () => {
  const jsonResponse = (body, ok = true) => ({
    ok,
    json: vi.fn().mockResolvedValue(body),
  });
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockNavigateHook.mockReturnValue(mockNavigate);
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
    renderWithProviders(<NotificationsMenu />);
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
    renderWithProviders(<NotificationsMenu />);
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledWith());
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
    renderWithProviders(<NotificationsMenu />);
    await screen.findByText('1');
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(
      screen.getByRole('button', {
        name: /clear notification/i,
      }),
    );
    expect(clearNotification).toHaveBeenCalledWith(1);
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
    renderWithProviders(<NotificationsMenu />);
    await screen.findByText('1');
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(screen.getByText('collaborator added "Plan".'));
    expect(markNotificationRead).toHaveBeenCalledWith(1);
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
    renderWithProviders(<NotificationsMenu />);
    expect(await screen.findByText('2')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(
      screen.getByRole('button', {
        name: /mark all read/i,
      }),
    );
    expect(markAllNotificationsRead).toHaveBeenCalledWith();
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
    renderWithProviders(<NotificationsMenu />);
    await userEvent.click(screen.getByLabelText('notifications'));
    await userEvent.click(
      await screen.findByRole('button', {
        name: /clear all/i,
      }),
    );
    expect(clearAllNotifications).toHaveBeenCalledWith();
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument();
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
      renderWithProviders(<NotificationsMenu />);
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
    renderWithProviders(<NotificationsMenu />);
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
      renderWithProviders(<NotificationsMenu />);
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
    renderWithProviders(<NotificationsMenu />);
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
    renderWithProviders(<NotificationsMenu />);
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

describe('NotificationsMenu response and navigation', () => {
  const notification = {
    id: 1,
    title: 'Notification title',
    message: 'Notification message',
    is_read: false,
    target_path: '/notification-target',
  };

  beforeEach(async () => {
    const actual = await vi.importActual('react-router');
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
  ])('keeps the menu usable for malformed notification JSON: %j', async (body) => {
    fetchNotifications
      .mockResolvedValueOnce({ ok: true, json: async () => body })
      .mockResolvedValue({ ok: true, json: async () => [notification] });
    const user = userEvent.setup();
    renderWithProviders(<NotificationsMenu />);
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
          <Route path="/" element={<NotificationsMenu />} />
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
});
