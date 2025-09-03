import React from 'react';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton
} from '@mui/material';
import { Menu as MenuIcon, AccountCircle, Notifications, ChevronLeft } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';

export default function MyAppBar({ appBarHeader }) {
  // Don't render in login page
  const location = useLocation();
  if (location.pathname === '/login') return null;

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ color: 'var(--secondary-background-color)', background: 'var(--background-color)', boxShadow: 'none' }}>
        <Toolbar>
          {
            // Don't render back button on the base page
            location.pathname !== '/' && (
              <IconButton size="large" edge="start" color="inherit" aria-label="back button">
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
          <IconButton size="large" edge="end" color="inherit" aria-label="menu">
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
    </Box>
  );
}
