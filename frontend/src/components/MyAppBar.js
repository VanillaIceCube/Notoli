import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton
} from '@mui/material';
import { Menu as MenuIcon, AccountCircle, Notifications, ChevronLeft } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';

export default function MyAppBar({ appBarHeader, setDrawerOpen }) {
  const location = useLocation();
  const navigate = useNavigate();

  const getParentPath = (path) => {
    //  todolist <-- notes
    //  /workspace/:wid/todolist/:tlid*
    const todolistPath = path.match(/^(\/workspace\/[^/]+)\/todolist\/[^/]+$/);
    if (todolistPath) return `${todolistPath[1]}`;

    //  workspace <-- todolists
    //  /workspace/:wid
    const workspacePath = path.match(/^\/workspace\/[^/]+$/);
    if (workspacePath) return '/';
  };

  const goBackToParent = () => {
    const target = getParentPath(location.pathname);
    navigate(target, { replace: true }); // replace prevents stacking history
  };

  // Don't render in login page
  if (location.pathname === '/login') return null;

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ color: 'var(--secondary-background-color)', background: 'var(--background-color)', boxShadow: 'none' }}>
        <Toolbar>
          {
            // Don't render back button on the base page
            location.pathname !== '/' && (
              <IconButton size="large" edge="start" color="inherit" aria-label="back button"
                onClick={goBackToParent}
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
          <IconButton size="large" edge="end" color="inherit" aria-label="menu"
            onClick={() => setDrawerOpen(previous => !previous)}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
    </Box>
  );
}
