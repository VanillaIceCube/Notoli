import { AppBar, Box, Toolbar, Typography, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircle from '@mui/icons-material/AccountCircle';
import Notifications from '@mui/icons-material/Notifications';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import { useLocation, useNavigate } from 'react-router-dom';
import { goBackToParent } from '../utils/Navigation';

export default function MyAppBar({ appBarHeader, setDrawerOpen }) {
  const location = useLocation();
  const navigate = useNavigate();

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
          <IconButton size="large" color="inherit" aria-label="user profile">
            <AccountCircle />
          </IconButton>
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
