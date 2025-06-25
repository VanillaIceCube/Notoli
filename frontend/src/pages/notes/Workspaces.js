import React, { useState, useEffect } from 'react';
import {
  Typography,
  Container,
  Paper,
  Stack,
  Button,
  Menu,
  MenuItem
} from '@mui/material';
import { Add, MoreVert } from '@mui/icons-material';
import Divider from '@mui/material/Divider';

export default function Workspaces() {
  // For authentication
  const token = sessionStorage.getItem('accessToken');

  // For the workspace list
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // For the triple dot menu
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const open = Boolean(anchorEl);

  // Fetch the workspaces list from the backend
  useEffect(() => {
    fetch('http://localhost:8000/api/workspaces/', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => setLists(data))
      .catch(err => setError(err.toString()))
      .finally(() => setLoading(false));
  }, []);

  // Create a new workspace
  const handleAddNew = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/workspaces/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: 'New Workspace',
          description: 'Test Description',
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const newList = await response.json();
      setLists([...lists, newList]);
    } catch (err) {
      setError(err.toString());
    }
  };
  
  // Triple dot menu functions
  const handleClick = (event, list) => {
    setAnchorEl(event.currentTarget);
    setSelectedList(list);
  };

  // Reset anchor + selectedList
  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedList(null);
  };

  return (
    <Container maxWidth="sm" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', py: 2 }}>
      <Paper elevation={3} sx={{ px: 1.5, py: 1.5, width: '100%', background:'var(--secondary-background-color)' }}>
        {/* Header */}
        <Typography variant="h4" align="center" gutterBottom sx={{ mt: 1.5, fontWeight: 'bold', color: 'var(--secondary-color)'}}>
          Workspaces
        </Typography>

        {/* This is for loading */}
        {loading && (
          <Typography align="center"> Loading… </Typography>
        )}
        
        {/* This is for errors */}
        {error && (
          <Typography color="error" align="center">
            Error: {error}
          </Typography>
        )}

        {/* If we're done loading and there are no errors */}
        <Divider sx={{ borderBottomWidth: 2, marginBottom: 1 }} />
        {!loading && !error && (
          <Stack spacing={1}>
            {lists.length ? lists.map(list => (
              <React.Fragment key={list.id}>
                <Button sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background:'var(--secondary-background-color)', color: 'var(--secondary-color)' }}
                  variant="text"
                >
                  <Typography variant="body1" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                    {list.name}
                  </Typography>
                  <MoreVert onClick={(event) => handleClick(event, list)} />
                </Button>
                <Divider sx={{ borderBottomWidth: 2 }} />
              </React.Fragment>
            )) : (
              <Typography align="center" variant="body1" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                No to-do lists found.
              </Typography>
            )}
            
            <Button sx={{ display: 'flex', alignItems: 'center', justifyContent: 'left', background:'var(--secondary-background-color)', color: 'var(--secondary-color)' }}
              variant="text"
              startIcon={<Add/>}
              onClick={handleAddNew}
            >
              <Typography align="center" variant="body1" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                Add New
              </Typography>
            </Button>
          </Stack>
        )}

        {/* Triple dot menu */}
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => console.log(`Edit ${selectedList?.name}`)}> Edit </MenuItem>
          <MenuItem onClick={() => console.log(`Delete ${selectedList?.name}`)}> Delete </MenuItem>
        </Menu>
      </Paper>
    </Container>
  );
}

