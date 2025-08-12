import React from 'react';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton
} from '@mui/material';
import { Menu as MenuIcon, AccountCircle, Notifications } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';

export default function MyAppBar() {
  // Don't render in login page
  const location = useLocation();
  if (location.pathname === '/login') return null;

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ color: 'var(--secondary-background-color)', background: 'var(--background-color)', boxShadow: 'none' }}>
        <Toolbar>
          <IconButton size="large" edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            MyAppBar
          </Typography>
          <IconButton size="large" color="inherit" aria-label="notifications">
            <Notifications />
          </IconButton>
          <IconButton size="large" edge="end" color="inherit" aria-label="user profile">
            <AccountCircle />
          </IconButton>
        </Toolbar>
      </AppBar>
    </Box>
  );
}

