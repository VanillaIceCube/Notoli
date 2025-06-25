import React, { useState, useEffect } from 'react';
import {
  Typography,
  Container,
  Paper,
  Stack,
  Button,
  Menu,
  MenuItem,
  Box,
  TextField,
  IconButton
} from '@mui/material';
import { Add, Close, MoreVert } from '@mui/icons-material';
import Divider from '@mui/material/Divider';

export default function Workspaces() {
  // For authentication
  const token = sessionStorage.getItem('accessToken');

  // For the workspace list
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // For adding a new workspace
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const onStartAdding = () => {
    setIsAdding(true);
    setNewName('');
  }

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
  const onSaveNew = async () => {
    if (!newName.trim()) return;
    try {
      const response = await fetch('http://localhost:8000/api/workspaces/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: JSON.stringify({
          name: newName,
          description: ''
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const created = await response.json();
      setLists([...lists, created]);
    } catch (err) {
      setError(err.toString());
    } finally {
      setIsAdding(false);
      setNewName('');
    }
  }

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
        <Divider sx={{ borderBottomWidth: 2, marginBottom: 1, bgcolor: 'var(--secondary-color)' }} />
        {!loading && !error && (
          <Stack spacing={1}>
            {lists.length ? lists.map(list => (
              <React.Fragment key={list.id}>
                <Button variant="text" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background:'var(--secondary-background-color)', color: 'var(--secondary-color)' }}>
                  <Typography variant="body1" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                    {list.name}
                  </Typography>
                  <MoreVert onClick={(event) => handleClick(event, list)} />
                </Button>
                <Divider sx={{ borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }} />
              </React.Fragment>
            )) : (
              <Typography variant="body1" align="center" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                No to-do lists found.
              </Typography>
            )}
            {/* By default show the Add New button, otherwise show a TextField & save Workspace*/}
            { !isAdding ? (
              <Button variant="text" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'left', background:'var(--secondary-background-color)', color: 'var(--secondary-color)' }}
                startIcon={<Add/>}
                onClick={() => setIsAdding(true)}
              >
                <Typography variant="body1" align="center" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                  Add New
                </Typography>
              </Button>
            ) : (
              <Box sx={{ display:'flex', alignItems:'center', px:1, py:0.5 }}>
                <TextField autoFocus variant="standard" size="small" sx={{ flexGrow:1, mr:1, justifyContent: 'space-between', color: 'var(--secondary-color)' }}
                  placeholder="New Workspace Name…"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') onSaveNew();
                    if (e.key === 'Escape') setIsAdding(false);
                  }}
                />
                <IconButton size="small" onClick={onSaveNew}disabled={!newName.trim()}>
                  <Add />
                </IconButton>
                <IconButton size="small" onClick={() => setIsAdding(false)}>
                  <Close />
                </IconButton>
              </Box>
            )}
          </Stack>
        )}

        {/* Triple dot menu */}
        <Menu slotProps={{ paper: { sx: { backgroundColor: 'var(--secondary-background-color)', color: 'var(--secondary-color)', boxShadow: 3, border: '2.5px solid var(--background-color)', borderRadius: 1.5, }}}}
          anchorEl={anchorEl}
          open={open}
          onClose={handleMenuClose}
        >
          <MenuItem sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight:"bold" }}
            onClick={() => console.log(`Edit ${selectedList?.name}`)}
          >
            Edit
          </MenuItem>
          <Divider variant="middle" sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }} />
          <MenuItem sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight:"bold" }}
            onClick={() => console.log(`Delete ${selectedList?.name}`)}
          >
            Delete
          </MenuItem>
        </Menu>
      </Paper>
    </Container>
  );
}
