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
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircle from '@mui/icons-material/AccountCircle';
import Notifications from '@mui/icons-material/Notifications';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import { useLocation, useNavigate } from 'react-router-dom';
import { goBackToParent } from '../utils/Navigation';
import { logout } from '../services/apiClient';

export default function MyAppBar({ appBarHeader, setDrawerOpen }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Profile menu
  const [profileAnchorEl, setProfileAnchorEl] = useState(null);
  const profileMenuOpen = Boolean(profileAnchorEl);

  const profileUsername = sessionStorage.getItem('username') || '';
  const profileEmail = sessionStorage.getItem('email') || '';
  const profilePrimary = profileUsername || profileEmail.split?.('@')?.[0] || 'username';
  const profileSecondary = profileEmail || (profilePrimary === 'username' ? 'username@gmail.com' : null);

  // Don't render on auth pages
  if (location.pathname === '/login' || location.pathname === '/register') return null;

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
            onClose={() => setProfileAnchorEl(null)}
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
              disabled
              sx={{
                opacity: 1,
                cursor: 'default',
                py: 0.75,
              }}
            >
              <ListItemText
                primary={profilePrimary}
                secondary={profileSecondary}
                slotProps={{
                  primary: { sx: { fontWeight: 'bold' } },
                  secondary: { sx: { color: 'var(--secondary-color)', opacity: 0.85 } },
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
