import { apiFetch } from '../http/requestClient';

const jsonHeaders = { 'Content-Type': 'application/json' };

export const fetchNotifications = () => apiFetch('/api/notifications/');

export const markNotificationRead = (notificationId) =>
  apiFetch(`/api/notifications/${notificationId}/`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ is_read: true }),
  });

export const clearNotification = (notificationId) =>
  apiFetch(`/api/notifications/${notificationId}/`, {
    method: 'DELETE',
    headers: jsonHeaders,
  });

export const clearAllNotifications = () =>
  apiFetch('/api/notifications/clear-all/', {
    method: 'DELETE',
    headers: jsonHeaders,
  });

export const markAllNotificationsRead = () =>
  apiFetch('/api/notifications/mark-all-read/', {
    method: 'PATCH',
    headers: jsonHeaders,
  });
