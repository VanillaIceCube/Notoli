import ClearIcon from '@mui/icons-material/Clear';
import NotificationsIcon from '@mui/icons-material/Notifications';
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import useNotifications from '../../hooks/useNotifications';
import { useSessionGuard } from '../../hooks/useSession';
import * as notificationApi from '../../services/notificationApiClient';

function formatNotificationMessage(notification) {
  const listSuffix = notification.list_name ? ` in ${notification.list_name}.` : '';
  if (listSuffix && notification.message.endsWith(listSuffix)) {
    return `${notification.message.slice(0, -listSuffix.length)}.`;
  }
  return notification.message;
}

export default function NotificationsMenu() {
  const navigate = useNavigate();
  const isCurrentSession = useSessionGuard();
  const [notificationAnchorEl, setNotificationAnchorEl] = useState(null);
  const {
    notifications,
    notificationsLoading,
    notificationError,
    actionPending,
    pendingIds,
    unreadCount,
    loadNotifications,
    markRead,
    clearNotification,
    markAllRead,
    clearAll,
  } = useNotifications(notificationApi);

  async function openNotification(notification) {
    if (!(await markRead(notification)) || !isCurrentSession() || !notification.target_path) return;

    setNotificationAnchorEl(null);
    navigate(notification.target_path);
  }

  return (
    <>
      <IconButton
        size="large"
        color="inherit"
        aria-label="notifications"
        onClick={(event) => setNotificationAnchorEl(event.currentTarget)}
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Popover
        anchorEl={notificationAnchorEl}
        open={Boolean(notificationAnchorEl)}
        onClose={() => setNotificationAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: 320, sm: 380 },
              maxWidth: 'calc(100vw - 24px)',
            },
          },
        }}
      >
        <Box sx={{ p: 1.5 }}>
          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              Notifications
            </Typography>
            {notifications.length > 0 && (
              <Button
                size="small"
                disabled={actionPending || pendingIds.size > 0}
                sx={{ color: 'var(--surface-text)', fontWeight: 'bold' }}
                onClick={unreadCount > 0 ? markAllRead : clearAll}
              >
                {unreadCount > 0 ? 'Mark all read' : 'Clear all'}
              </Button>
            )}
          </Stack>
          <Divider sx={{ my: 1, borderColor: 'rgba(0, 0, 0, 0.12)' }} />
          {notificationsLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!notificationsLoading && notificationError && (
            <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Typography role="status" variant="body2" sx={{ py: 2 }}>
                {notificationError}
              </Typography>
              {notifications.length === 0 && (
                <Button
                  size="small"
                  color="inherit"
                  disabled={actionPending || pendingIds.size > 0}
                  onClick={loadNotifications}
                >
                  Retry
                </Button>
              )}
            </Stack>
          )}
          {!notificationsLoading && !notificationError && notifications.length === 0 && (
            <Typography variant="body2" sx={{ py: 0.25 }}>
              No notifications yet.
            </Typography>
          )}
          {!notificationsLoading && notifications.length > 0 && (
            <List dense disablePadding sx={{ maxHeight: 360, overflowY: 'auto', mt: 1 }}>
              {notifications.map((notification, index) => {
                const notificationLocation = [notification.board_name, notification.list_name]
                  .filter(Boolean)
                  .join(' · ');
                const notificationMessage = formatNotificationMessage(notification);

                return (
                  <ListItem
                    key={notification.id}
                    disablePadding
                    divider={index < notifications.length - 1}
                    sx={{ borderColor: 'rgba(0, 0, 0, 0.12)' }}
                  >
                    <ListItemButton
                      disabled={actionPending || pendingIds.has(notification.id)}
                      dense
                      onClick={() => openNotification(notification)}
                      sx={{
                        alignItems: 'flex-start',
                        borderRadius: 1,
                        px: 1.5,
                        py: 0.75,
                        my: 0.125,
                        bgcolor: notification.is_read ? 'transparent' : 'rgba(0, 0, 0, 0.06)',
                      }}
                    >
                      <ListItemText
                        primary={notificationMessage}
                        secondary={notificationLocation || null}
                        slotProps={{
                          primary: {
                            sx: {
                              color: 'var(--surface-text)',
                              fontWeight: notification.is_read ? 500 : 'bold',
                            },
                          },
                          secondary: {
                            sx: { color: 'var(--surface-text)', opacity: 0.8 },
                          },
                        }}
                      />
                      <Tooltip title="Clear notification">
                        <IconButton
                          aria-label="Clear notification"
                          disabled={actionPending || pendingIds.has(notification.id)}
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            clearNotification(notification.id);
                          }}
                          sx={{
                            width: 40,
                            height: 40,
                            ml: 1,
                            alignSelf: 'center',
                            flexShrink: 0,
                            color: 'var(--surface-text)',
                          }}
                        >
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
}
