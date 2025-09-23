import React, { useEffect, useCallback } from 'react';
import {
  Drawer,
  Box,
  List,
  ListItemButton,
  ListItemText,
  Typography
} from '@mui/material';
import Divider from '@mui/material/Divider';
import { getWorkspaceId } from '../utils/Navigation';
import { useLocation } from 'react-router-dom';

export default function MyDrawer({ open, setDrawerOpen, drawerWorkspacesLabel, setDrawerWorkspacesLabel }) {
  // Fetch Workspace Name
  const location = useLocation();
  const workspaceId = getWorkspaceId(location.pathname);
  const token = sessionStorage.getItem('accessToken');

  // Fetch Workspace Name
  const fetchWorkspaceName  = useCallback(async () => {
    console.log(workspaceId);
    if (!workspaceId) {
      setDrawerWorkspacesLabel('');
      return;
    };

    try {
      const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const workspaceData = await response.json();
      setDrawerWorkspacesLabel(workspaceData?.name ?? '');
    } catch (error) {
      setDrawerWorkspacesLabel(error.toString() ?? '');
    }
  }, [workspaceId, token, setDrawerWorkspacesLabel]);

  useEffect(() => {
    fetchWorkspaceName()
  }, [fetchWorkspaceName, setDrawerWorkspacesLabel]);

  return (
    <Drawer
      open={open}
      onClose={() => setDrawerOpen(false)}
      anchor="right"
      sx={{
        '& .MuiDrawer-paper': {
          bgcolor: 'var(--secondary-background-color)',
          color: 'var(--secondary-color)',
          width: 180,
          borderTopLeftRadius: 15,
          borderBottomLeftRadius: 15
        },
        '& .MuiListItemText-primary': {
          fontWeight: 'bold'
        },
      }}
    >
      <Typography variant="h4" align="center" gutterBottom sx={{ mt: 2, mx: 1.5, fontWeight: 'bold', color: 'var(--secondary-color)'}}>
        notoli 
      </Typography>
      <Box role="navigation">
        <Divider sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--secondary-color)' }} />
        {/* disablePadding + my: 0 is helping reduce the padding, but not making it smaller like I want */}
        <List disablePadding sx={{ my: 0 }}>
          <ListItemButton>
            <ListItemText primary="Workspace" secondary={ drawerWorkspacesLabel }/> 
          </ListItemButton>
        </List>
        <Divider sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--secondary-color)' }} />
      </Box>
    </Drawer>
  );
}
