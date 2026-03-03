import { useState } from 'react';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  ListItemText,
  TextField,
  Button,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircle from '@mui/icons-material/AccountCircle';
import Notifications from '@mui/icons-material/Notifications';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import { useLocation, useNavigate } from 'react-router-dom';
import { goBackToParent } from '../utils/Navigation';
import { logout } from '../services/requestClient';
import { updateProfileUsername } from '../services/notoliApiClient';
import { readOkJson } from '../services/authSession';

function safeGetSessionItem(key) {
  try {
    return sessionStorage.getItem(key) || '';
  } catch (_err) {
    return '';
  }
}

export default function MyAppBar({ appBarHeader, setDrawerOpen }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Profile menu
  const [profileAnchorEl, setProfileAnchorEl] = useState(null);
  const profileMenuOpen = Boolean(profileAnchorEl);
  const [showEditUsernamePanel, setShowEditUsernamePanel] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const profileUsername = safeGetSessionItem('username');
  const profileEmail = safeGetSessionItem('email');
  const profilePrimary = profileUsername || profileEmail.split?.('@')?.[0] || 'username';
  const profileSecondary =
    profileEmail || (profilePrimary === 'username' ? 'username@gmail.com' : null);
  const accessToken = safeGetSessionItem('accessToken');

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

  const closeProfileMenu = () => {
    setProfileAnchorEl(null);
    setShowEditUsernamePanel(false);
    setUsernameError('');
  };

  const openEditUsername = () => {
    setUsernameError('');
    setUsernameDraft(profileUsername || '');
    setShowEditUsernamePanel(true);
  };

  const cancelEditUsername = () => {
    setUsernameError('');
    setUsernameDraft(profileUsername || '');
    setShowEditUsernamePanel(false);
  };

  const handleSaveUsername = async () => {
    const nextUsername = usernameDraft.trim();
    if (!nextUsername) {
      setUsernameError('Username is required.');
      return;
    }
    if (!accessToken) {
      setUsernameError('No active session. Please log in again.');
      return;
    }

    try {
      const response = await updateProfileUsername(nextUsername, accessToken);
      const data = await readOkJson(response, 'Username update failed.');
      try {
        sessionStorage.setItem('username', data?.username || nextUsername);
      } catch (_err) {
        // ignore blocked storage
      }
      setShowEditUsernamePanel(false);
    } catch (err) {
      setUsernameError(err?.message || 'Username update failed.');
    }
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
            location.pathname.includes('/todolist') && (
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
          <IconButton size="large" color="inherit" aria-label="notifications">
            <Notifications />
          </IconButton>
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
            onClose={closeProfileMenu}
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
            {!showEditUsernamePanel && (
              <MenuItem
                sx={{ py: 0.5, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
                onClick={openEditUsername}
              >
                Edit Username
              </MenuItem>
            )}
            {showEditUsernamePanel && (
              <MenuItem
                disableRipple
                sx={{
                  py: 0.5,
                  px: 1.25,
                  cursor: 'default',
                  '&:hover': { backgroundColor: 'transparent' },
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <TextField
                    autoFocus
                    size="small"
                    label="Username"
                    fullWidth
                    value={usernameDraft}
                    onChange={(event) => setUsernameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSaveUsername();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelEditUsername();
                      }
                    }}
                    error={Boolean(usernameError)}
                    helperText={usernameError || ''}
                    slotProps={{
                      formHelperText: {
                        sx: {
                          mt: 0.5,
                          color: usernameError ? '#d32f2f' : 'var(--secondary-color)',
                        },
                      },
                    }}
                    sx={{
                      '& .MuiInputBase-root': {
                        backgroundColor: 'white',
                        borderRadius: 1.25,
                      },
                      '& .MuiInputLabel-root': {
                        color: 'var(--secondary-color)',
                      },
                    }}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75, mt: 0.5 }}>
                    <Button
                      size="small"
                      sx={{
                        color: 'var(--secondary-color)',
                        px: 1.25,
                        py: 0.1,
                        minWidth: 0,
                      }}
                      onClick={cancelEditUsername}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      sx={{
                        color: 'var(--secondary-background-color)',
                        bgcolor: 'var(--secondary-color)',
                        borderRadius: 999,
                        px: 1.25,
                        py: 0.1,
                        minWidth: 0,
                        '&:hover': { bgcolor: 'var(--secondary-color)', opacity: 0.9 },
                      }}
                      onClick={handleSaveUsername}
                    >
                      Save
                    </Button>
                  </Box>
                </Box>
              </MenuItem>
            )}
            <MenuItem
              sx={{ py: 0.5, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
              onClick={() => {
                closeProfileMenu();
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
