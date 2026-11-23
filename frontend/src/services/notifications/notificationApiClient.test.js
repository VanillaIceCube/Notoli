// @vitest-environment node

import {
  fetchNotifications,
  markNotificationRead,
  clearNotification,
  clearAllNotifications,
  markAllNotificationsRead,
} from './notificationApiClient';
import { apiFetch } from '../http/requestClient';
vi.mock('../http/requestClient', () => ({
  apiFetch: vi.fn(),
}));
describe('notificationApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(Response.json({ id: 1 }));
  });
  test('when fetching notifications, it calls the notifications endpoint', async () => {
    await fetchNotifications();
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/');
  });
  test('when marking a notification read, it patches the notification', async () => {
    await markNotificationRead(4);
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/4/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        is_read: true,
      }),
    });
  });
  test('when clearing a notification, it deletes the notification', async () => {
    await clearNotification(4);
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/4/', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
  test('when clearing all notifications, it deletes the collection action', async () => {
    await clearAllNotifications();
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/clear-all/', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
  test('when marking all notifications read, it patches the collection action', async () => {
    await markAllNotificationsRead();
    expect(apiFetch).toHaveBeenCalledWith('/api/notifications/mark-all-read/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
});
