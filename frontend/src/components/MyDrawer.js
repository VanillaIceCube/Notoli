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
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';


export default function MyDrawer({ open, setDrawerOpen, drawerWorkspacesLabel, setDrawerWorkspacesLabel }) {
  // Fetch Workspace Name
  const location = useLocation();
  const workspaceId = getWorkspaceId(location.pathname);
  const token = sessionStorage.getItem('accessToken');

  const fetchWorkspaceName  = useCallback(async () => {
    if (!workspaceId) return '';
    try {
      const response = await fetch(`http://localhost:8000/api/workspaces/${workspaceId}/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const workspaceData = await response.json();
      return workspaceData?.name ?? ''
    } catch (error) {
      return error.toString() ?? ''
    }
  }, [workspaceId, token]);


  // Fetch Workspace List
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


  // Manage Drawer
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const toggleWorkspaceDrawer = () => setWorkspaceDrawerOpen(prev => !prev);

  useEffect(() => {
    (async () => {
      try {
        const name = await fetchWorkspaceName();
        setDrawerWorkspacesLabel(name);
      } catch {
        setDrawerWorkspacesLabel('');
      }
    })();

    fetchWorkspaces();
  }, [setDrawerWorkspacesLabel, fetchWorkspaces, fetchWorkspaceName]);


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
        <List disablePadding sx={{ mt: 1, mb: 1 }}>

          {/* Header row that toggles the nested content */}
          <ListItemButton onClick={toggleWorkspaceDrawer} aria-expanded={workspaceDrawerOpen} sx={{ py: 0 }}>
            <ListItemText primary="Workspace" secondary={drawerWorkspacesLabel} />
            {workspaceDrawerOpen ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>

          {/* Nested content that opens/closes */}
          <Collapse in={workspaceDrawerOpen} timeout="auto" unmountOnExit>
            <List sx={{ pb: 0 }}>
              <Divider sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--secondary-color)' }} />

              {/* This is for loading */}
              {loading && (
                <Typography align="left" sx={{ pl: 3, py: 1 }}>
                  Loading…
                </Typography>
              )}
              
              {/* This is for errors */}
              {error && (
                <Typography color="error" align="left" sx={{ pl: 3, py: 1 }}>
                  Error: {error}
                </Typography>
              )}
              {lists.map((workspace, i) => (
                <React.Fragment key={workspace.id}>
                  {i !== 0 && (
                    <Divider sx={{ borderBottomWidth: 2, mr: 2, ml:2, my: 0.1, px: 0, bgcolor: 'var(--secondary-color)' }} />
                  )}
                  <ListItemButton dense sx={{ pl: 3, py: .75 }}>
                    <ListItemText primary={workspace.name} />
                  </ListItemButton>
                </React.Fragment>
              ))}
            </List>
          </Collapse>
        </List>
        <Divider sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--secondary-color)' }} />
      </Box>
    </Drawer>
  );
}
