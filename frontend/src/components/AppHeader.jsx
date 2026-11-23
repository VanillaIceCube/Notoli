import useSession from '../hooks/useSession';
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
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { goBackToParent } from '../utils/Navigation';
import { logout } from '../services/requestClient';
import NotificationsMenu from './NotificationsMenu';

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

export default function AppHeader({ appBarHeader, setDrawerOpen }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [profileAnchorEl, setProfileAnchorEl] = useState(null);
  const profileMenuOpen = Boolean(profileAnchorEl);
  const session = useSession();
  const { username: profileUsername, email: profileEmail } = session;
  const profilePrimary = profileUsername || profileEmail.split?.('@')?.[0] || 'username';
  const profileSecondary =
    profileEmail || (profilePrimary === 'username' ? 'username@gmail.com' : null);
  if (AUTH_PATHS.includes(location.pathname)) return null;

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
                onClick={() => goBackToParent(location.pathname, navigate)}
              >
                <ChevronLeft />
              </IconButton>
            )
          }
          <Typography variant="h6" edge="start" component="div" noWrap sx={{ flexGrow: 1 }}>
            {appBarHeader}
          </Typography>
          <NotificationsMenu />
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
                  primary: { sx: { fontWeight: 'bold', color: 'var(--surface-text)' } },
                  secondary: { sx: { color: 'var(--surface-text)', opacity: 1 } },
                }}
              />
            </MenuItem>
            <Divider
              variant="middle"
              sx={{ my: 0.25, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--surface-text)' }}
            />
            {import.meta.env.VITE_MCP_ENABLED === '1' && (
              <MenuItem
                sx={{ py: 0.5, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
                component={RouterLink}
                to="/connections"
                onClick={() => setProfileAnchorEl(null)}
              >
                Connected Apps
              </MenuItem>
            )}
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
