import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppBar,
  Badge,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  ListItemText,
  Popover,
  Stack,
  Tooltip,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircle from '@mui/icons-material/AccountCircle';
import ClearIcon from '@mui/icons-material/Clear';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import { useLocation, useNavigate } from 'react-router-dom';
import { goBackToParent } from '../utils/Navigation';
import { logout } from '../services/requestClient';
import {
  clearNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notoliApiClient';

function safeGetSessionItem(key) {
  try {
    return sessionStorage.getItem(key) || '';
  } catch (_err) {
    return '';
  }
}

function formatNotificationMessage(notification) {
  const listSuffix = notification.list_name ? ` in ${notification.list_name}.` : '';
  if (listSuffix && notification.message.endsWith(listSuffix)) {
    return `${notification.message.slice(0, -listSuffix.length)}.`;
  }
  return notification.message;
}

export default function AppHeader({ appBarHeader, setDrawerOpen }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Profile menu
  const [profileAnchorEl, setProfileAnchorEl] = useState(null);
  const profileMenuOpen = Boolean(profileAnchorEl);
  const [notificationAnchorEl, setNotificationAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const notificationsOpen = Boolean(notificationAnchorEl);

  const profileUsername = safeGetSessionItem('username');
  const profileEmail = safeGetSessionItem('email');
  const accessToken = safeGetSessionItem('accessToken');
  const profilePrimary = profileUsername || profileEmail.split?.('@')?.[0] || 'username';
  const profileSecondary =
    profileEmail || (profilePrimary === 'username' ? 'username@gmail.com' : null);
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  const loadNotifications = useCallback(async () => {
    if (!accessToken) {
      setNotifications([]);
      return;
    }

    setNotificationsLoading(true);
    setNotificationError('');
    try {
      const response = await fetchNotifications(accessToken);
      if (!response.ok) {
        throw new Error('Unable to load notifications.');
      }
      setNotifications(await response.json());
    } catch (_err) {
      setNotificationError('Notifications are unavailable right now.');
    } finally {
      setNotificationsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = async (notificationId) => {
    setNotificationError('');
    try {
      const response = await markNotificationRead(notificationId, accessToken);
      if (!response.ok) {
        throw new Error('Unable to mark notification read.');
      }
      const updatedNotification = await response.json();
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.id === updatedNotification.id ? updatedNotification : notification,
        ),
      );
    } catch (_err) {
      setNotificationError('Could not update that notification.');
    }
  };

  const handleClearNotification = async (notificationId) => {
    setNotificationError('');
    try {
      const response = await clearNotification(notificationId, accessToken);
      if (!response.ok) {
        throw new Error('Unable to clear notification.');
      }
      setNotifications((currentNotifications) =>
        currentNotifications.filter((notification) => notification.id !== notificationId),
      );
    } catch (_err) {
      setNotificationError('Could not clear that notification.');
    }
  };

  const handleOpenNotification = async (notification) => {
    if (!notification.is_read) {
      await handleMarkRead(notification.id);
    }
    if (notification.target_path) {
      setNotificationAnchorEl(null);
      navigate(notification.target_path);
    }
  };

  const handleMarkAllRead = async () => {
    setNotificationError('');
    try {
      const response = await markAllNotificationsRead(accessToken);
      if (!response.ok) {
        throw new Error('Unable to mark all notifications read.');
      }
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) => ({ ...notification, is_read: true })),
      );
    } catch (_err) {
      setNotificationError('Could not update notifications.');
    }
  };

  // Don't render on auth pages
  if (
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/forgot-password' ||
    location.pathname === '/reset-password'
  ) {
    return null;
  }

  // Navigate backwards function
  const handleBack = () => {
    goBackToParent(location.pathname, navigate);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar
        position="static"
        sx={{
          color: 'var(--secondary-background-color)',
          background: 'var(--background-color)',
          boxShadow: 'none',
        }}
      >
        <Toolbar>
          {
            // Don't render back button on the base page
            location.pathname.includes('/list') && (
              <IconButton
                size="large"
                edge="start"
                color="inherit"
                aria-label="back button"
                onClick={handleBack}
              >
                <ChevronLeft />
              </IconButton>
            )
          }
          <Typography variant="h6" edge="start" component="div" noWrap sx={{ flexGrow: 1 }}>
            {appBarHeader}
          </Typography>
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
            open={notificationsOpen}
            onClose={() => setNotificationAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  backgroundColor: 'var(--secondary-background-color)',
                  color: 'var(--secondary-color)',
                  boxShadow: 3,
                  border: '2.5px solid var(--background-color)',
                  borderRadius: 1.5,
                  width: { xs: 320, sm: 380 },
                  maxWidth: 'calc(100vw - 24px)',
                },
              },
            }}
          >
            <Box sx={{ p: 1.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  Notifications
                </Typography>
                {unreadCount > 0 && (
                  <Button
                    size="small"
                    sx={{ color: 'var(--secondary-color)', fontWeight: 'bold' }}
                    onClick={handleMarkAllRead}
                  >
                    Mark all read
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
                <Typography role="status" variant="body2" sx={{ py: 2 }}>
                  {notificationError}
                </Typography>
              )}
              {!notificationsLoading && !notificationError && notifications.length === 0 && (
                <Typography variant="body2" sx={{ py: 2 }}>
                  No notifications yet.
                </Typography>
              )}
              {!notificationsLoading && !notificationError && notifications.length > 0 && (
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
                          dense
                          onClick={() => handleOpenNotification(notification)}
                          sx={{
                          alignItems: 'flex-start',
                          borderRadius: 1,
                          px: 1.5,
                          py: 1,
                            bgcolor: notification.is_read ? 'transparent' : 'rgba(0, 0, 0, 0.06)',
                          }}
                        >
                          <ListItemText
                            primary={notificationMessage}
                            secondary={notificationLocation || null}
                            slotProps={{
                              primary: {
                                sx: {
                                  color: 'var(--secondary-color)',
                                  fontWeight: notification.is_read ? 500 : 'bold',
                                },
                              },
                              secondary: {
                                sx: { color: 'var(--secondary-color)', opacity: 0.8 },
                              },
                            }}
                          />
                          <Tooltip title="Clear notification">
                            <IconButton
                              aria-label="Clear notification"
                              size="small"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleClearNotification(notification.id);
                              }}
                              sx={{
                                width: 40,
                                height: 40,
                                ml: 1,
                                alignSelf: 'center',
                                flexShrink: 0,
                                color: 'var(--secondary-color)',
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
          <IconButton
            size="large"
            color="inherit"
            aria-label="user profile"
            onClick={(event) => setProfileAnchorEl(event.currentTarget)}
          >
            <AccountCircle />
          </IconButton>
          <Menu
            anchorEl={profileAnchorEl}
            open={profileMenuOpen}
            onClose={() => setProfileAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  backgroundColor: 'var(--secondary-background-color)',
                  color: 'var(--secondary-color)',
                  boxShadow: 3,
                  border: '2.5px solid var(--background-color)',
                  borderRadius: 1.5,
                  minWidth: 220,
                },
              },
            }}
          >
            <MenuItem
              disableRipple
              sx={{
                cursor: 'default',
                '&:hover': { backgroundColor: 'transparent' },
                py: 0.75,
              }}
            >
              <ListItemText
                primary={profilePrimary}
                secondary={profileSecondary}
                slotProps={{
                  primary: { sx: { fontWeight: 'bold', color: 'var(--secondary-color)' } },
                  secondary: { sx: { color: 'var(--secondary-color)', opacity: 1 } },
                }}
              />
            </MenuItem>
            <Divider
              variant="middle"
              sx={{ my: 0.25, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }}
            />
            <MenuItem
              sx={{ py: 0.5, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
              onClick={() => {
                setProfileAnchorEl(null);
                logout();
              }}
            >
              Logout
            </MenuItem>
          </Menu>
          <IconButton
            size="large"
            edge="end"
            color="inherit"
            aria-label="menu"
            onClick={() => setDrawerOpen((previous) => !previous)}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
    </Box>
  );
}
