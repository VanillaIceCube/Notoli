import React, { useState, useEffect, useCallback } from 'react';
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
  const location = useLocation();
  const workspaceId = getWorkspaceId(location.pathname);

  // Pull Workspace List
  const token = sessionStorage.getItem('accessToken');
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/workspaces/', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLists(data);
      setError(null);
    } catch (err) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchWorkspaceName = useCallback(() => {
    // if no ID or lists isn't an array, return null
    if (!workspaceId || !Array.isArray(lists)) return null;
    
    // Find workspace based in id
    const workspace = lists.find(item => String(item.id) === String(workspaceId));

    // If found, return name
    return workspace?.name ?? null;
  }, [lists, workspaceId]);
  
  useEffect(() => {
    fetchWorkspaces()
    setDrawerWorkspacesLabel(fetchWorkspaceName())
  }, [fetchWorkspaces, fetchWorkspaceName, setDrawerWorkspacesLabel]);

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
            <ListItemText primary={ drawerWorkspacesLabel } /> 
          </ListItemButton>
        </List>
        <Divider sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--secondary-color)' }} />
      </Box>
    </Drawer>
  );
}
