import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionSnapshot } from '../../services/authentication/sessionState';
import useSession from '../authentication/useSession';

const emptyState = (version) => ({
  version,
  notifications: [],
  notificationsLoading: false,
  notificationError: '',
  actionPending: false,
  pendingIds: new Set(),
});
const fallbackError = (_response, fallback) => fallback;

// Validate only fields used by the shared headers; other server metadata stays opaque.
function isNotification(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const validId =
    (typeof item.id === 'number' && Number.isFinite(item.id)) ||
    (typeof item.id === 'string' && item.id.trim() !== '');
  if (
    !validId ||
    typeof item.title !== 'string' ||
    typeof item.message !== 'string' ||
    typeof item.is_read !== 'boolean' ||
    ['board_name', 'list_name', 'target_path'].some(
      (field) => item[field] != null && typeof item[field] !== 'string',
    )
  )
    return false;
  if (!item.target_path) return true;
  try {
    // URL parsing removes these controls and treats backslashes as path separators.
    const normalizedTarget = item.target_path.replace(/[\t\n\r]/g, '').replaceAll('\\', '/');
    return (
      item.target_path.startsWith('/') &&
      !normalizedTarget.startsWith('//') &&
      new URL(item.target_path, 'https://application.invalid').origin ===
        'https://application.invalid'
    );
  } catch (_error) {
    return false;
  }
}

export default function useNotifications(api, getErrorMessage = fallbackError) {
  const { version } = useSession();
  const lifecycleRef = useRef(null);
  const [state, setState] = useState(() => emptyState(version));

  const isCurrent = useCallback(
    (operation) =>
      operation?.active &&
      lifecycleRef.current === operation &&
      getSessionSnapshot().version === operation.version,
    [],
  );

  const update = useCallback(
    (operation, change) => {
      if (isCurrent(operation)) setState((current) => ({ ...current, ...change(current) }));
    },
    [isCurrent],
  );

  const loadNotifications = useCallback(async () => {
    const operation = lifecycleRef.current;
    if (!isCurrent(operation) || operation.bulk || operation.pending.size) return;
    if (!getSessionSnapshot().accessToken) return;
    const request = ++operation.load;
    const canPublish = () => isCurrent(operation) && operation.load === request;
    update(operation, () => ({ notificationsLoading: true, notificationError: '' }));
    try {
      const response = await api.fetchNotifications();
      if (!response?.ok) {
        const message = await getErrorMessage(response, 'Notifications are unavailable right now.');
        if (canPublish()) update(operation, () => ({ notificationError: message }));
        return;
      }
      const data = await response.json();
      if (!Array.isArray(data) || !data.every(isNotification)) {
        throw new Error('Invalid notification response.');
      }
      if (canPublish()) update(operation, () => ({ notifications: data }));
    } catch (_error) {
      if (canPublish()) {
        update(operation, () => ({
          notificationError: 'Notifications are unavailable right now.',
        }));
      }
    } finally {
      if (canPublish()) update(operation, () => ({ notificationsLoading: false }));
    }
  }, [api, getErrorMessage, isCurrent, update]);

  useEffect(() => {
    const operation = { active: true, version, load: 0, pending: new Set(), bulk: false };
    lifecycleRef.current = operation;
    setState(emptyState(version));
    loadNotifications();
    return () => {
      operation.active = false;
    };
  }, [version, loadNotifications]);

  // Locks live outside React state so two events in one render cannot start the same mutation.
  const begin = (id) => {
    const operation = lifecycleRef.current;
    if (
      !isCurrent(operation) ||
      operation.version !== version ||
      !getSessionSnapshot().accessToken ||
      operation.bulk ||
      (id === undefined ? operation.pending.size > 0 : operation.pending.has(id))
    ) {
      return null;
    }
    if (id === undefined) operation.bulk = true;
    else operation.pending.add(id);
    operation.load += 1; // An older list response must not undo this mutation.
    update(operation, () => ({
      notificationError: '',
      notificationsLoading: false,
      actionPending: operation.bulk,
      pendingIds: new Set(operation.pending),
    }));
    return operation;
  };

  const finish = (operation, id) => {
    if (id === undefined) operation.bulk = false;
    else operation.pending.delete(id);
    update(operation, () => ({
      actionPending: operation.bulk,
      pendingIds: new Set(operation.pending),
    }));
  };

  const mutate = async (id, request, apply, fallback) => {
    const operation = begin(id);
    if (!operation) return false;
    try {
      const response = await request();
      if (!response?.ok) {
        const message = await getErrorMessage(response, fallback);
        update(operation, () => ({ notificationError: message }));
        return false;
      }
      const change = await apply(response);
      if (!isCurrent(operation)) return false;
      update(operation, change);
      return true;
    } catch (_error) {
      update(operation, () => ({ notificationError: fallback }));
      return false;
    } finally {
      finish(operation, id);
    }
  };

  const markRead = async (notification) => {
    if (notification.is_read) {
      const operation = lifecycleRef.current;
      return Boolean(
        isCurrent(operation) &&
        operation.version === version &&
        !operation.bulk &&
        !operation.pending.has(notification.id),
      );
    }
    return mutate(
      notification.id,
      () => api.markNotificationRead(notification.id),
      async (response) => {
        const updated = await response.json();
        if (
          !isNotification(updated) ||
          updated.id !== notification.id ||
          updated.is_read !== true
        ) {
          throw new Error('Invalid notification response.');
        }
        return (current) => ({
          notifications: current.notifications.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        });
      },
      'Could not update that notification.',
    );
  };

  const clearNotification = (id) =>
    mutate(
      id,
      () => api.clearNotification(id),
      async () => (current) => ({
        notifications: current.notifications.filter((item) => item.id !== id),
      }),
      'Could not clear that notification.',
    );

  const markAllRead = () =>
    mutate(
      undefined,
      api.markAllNotificationsRead,
      async () => (current) => ({
        notifications: current.notifications.map((item) => ({ ...item, is_read: true })),
      }),
      'Could not update notifications.',
    );

  const clearAll = () =>
    mutate(
      undefined,
      api.clearAllNotifications,
      async () => () => ({ notifications: [] }),
      'Could not clear notifications.',
    );

  // Hide the old account's data on the first render, before the effect resets its work.
  const visible = state.version === version ? state : emptyState(version);
  return {
    ...visible,
    unreadCount: visible.notifications.filter((notification) => !notification.is_read).length,
    loadNotifications,
    markRead,
    clearNotification,
    markAllRead,
    clearAll,
  };
}
