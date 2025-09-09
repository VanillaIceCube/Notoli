import React, { useEffect } from 'react';
import {
  Drawer,
  Toolbar,
  Box,
  List,
  ListItemButton,
  ListItemText,
  Typography
} from '@mui/material';
import Divider from '@mui/material/Divider';
import { useLocation } from 'react-router-dom';
import { getParentPath } from "../utils/Navigation";

export default function MyDrawer({ open, setDrawerOpen, drawerWorkspacesLabel, setDrawerWorkspacesLabel }) {
  const location = useLocation();

  // Get Parent Path
  const fetchWorkspace = () => {
    return getParentPath(location.pathname);
  };

  useEffect(() => {
    setDrawerWorkspacesLabel(fetchWorkspace)
  }, [fetchWorkspace, setDrawerWorkspacesLabel]);

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
