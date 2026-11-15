import useNotifications from '../hooks/useNotifications';
import useSession from '../hooks/useSession';
import { getSessionVersion } from '../services/sessionState';
import { useState } from 'react';
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
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { goBackToParent } from '../utils/Navigation';
import { logout } from '../services/requestClient';
import {
  clearAllNotifications,
  clearNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notoliApiClient';

const notificationApi = {
  fetchNotifications,
  markNotificationRead,
  clearNotification,
  markAllNotificationsRead,
  clearAllNotifications,
};

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
  const session = useSession();
  const { username: profileUsername, email: profileEmail } = session;
  const notificationsOpen = Boolean(notificationAnchorEl);
  const profilePrimary = profileUsername || profileEmail.split?.('@')?.[0] || 'username';
  const profileSecondary =
    profileEmail || (profilePrimary === 'username' ? 'username@gmail.com' : null);
  const {
    notifications,
    notificationsLoading,
    notificationError,
    actionPending,
    pendingIds,
    unreadCount,
    loadNotifications,
    markRead,
    clearNotification: handleClearNotification,
    markAllRead: handleMarkAllRead,
    clearAll: handleClearAllNotifications,
  } = useNotifications(notificationApi);

  const handleOpenNotification = async (notification) => {
    if (!(await markRead(notification)) || getSessionVersion() !== session.version) return;
    if (notification.target_path) {
      setNotificationAnchorEl(null);
      navigate(notification.target_path);
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
      <AppBar position="static">
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
                    sx={{ color: 'var(--secondary-color)', fontWeight: 'bold' }}
                    onClick={unreadCount > 0 ? handleMarkAllRead : handleClearAllNotifications}
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
                          onClick={() => handleOpenNotification(notification)}
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
                              disabled={actionPending || pendingIds.has(notification.id)}
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
              component={RouterLink}
              to="/connections"
              onClick={() => setProfileAnchorEl(null)}
            >
              Connected Apps
            </MenuItem>
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
