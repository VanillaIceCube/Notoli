import React, { useState, useEffect, useCallback } from 'react';
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
  IconButton,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import MoreVert from '@mui/icons-material/MoreVert';
import Divider from '@mui/material/Divider';
import { useNavigate } from 'react-router-dom';
import {
  createWorkspace,
  deleteWorkspace,
  fetchWorkspaces as fetchWorkspacesApi,
  updateWorkspace,
} from '../../services/backendClient';

export default function Workspaces({ setAppBarHeader }) {
  // Misc
  const navigate = useNavigate();

  // Pull Workspace List
  const token = sessionStorage.getItem('accessToken');
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWorkspacesApi(token);
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

  useEffect(() => {
    setAppBarHeader('');
    fetchWorkspaces();
  }, [fetchWorkspaces, setAppBarHeader]);

  // Triple Dot Menu Functions
  const [tripleDotAnchorElement, setTripleDotAnchorElement] = useState(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const open = Boolean(tripleDotAnchorElement);

  const handleTripleDotClick = (event, list) => {
    event.stopPropagation();
    setTripleDotAnchorElement(event.currentTarget);
    setSelectedWorkspace(list);
  };

  const handleTripleDotClose = () => {
    setTripleDotAnchorElement(null);
    setSelectedWorkspace(null);
  };

  // Add New Workspace
  const [isAdding, setIsAdding] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const onAdd = async () => {
    if (!newWorkspaceName.trim()) return;
    setError(null);

    try {
      const response = await createWorkspace(
        {
          name: newWorkspaceName,
          description: '',
        },
        token,
      );

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json();
      setLists((prev) => [...prev, created]);

      setIsAdding(false);
      setNewWorkspaceName('');
    } catch (err) {
      setError(err.toString());
    }
  };

  // Edit Workspace
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [editWorkspaceName, setEditWorkspaceName] = useState('');

  const startEditing = () => {
    setEditingWorkspaceId(selectedWorkspace.id);
    setEditWorkspaceName(selectedWorkspace.name);
    handleTripleDotClose();
  };

  const onEdit = async () => {
    if (!editWorkspaceName.trim()) return;
    setError(null);

    try {
      const response = await updateWorkspace(
        editingWorkspaceId,
        { name: editWorkspaceName },
        token,
      );

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setLists((prev) =>
        prev.map((workspace) => (workspace.id === updated.id ? updated : workspace)),
      );

      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  const closeEdit = () => {
    setEditingWorkspaceId(null);
    setEditWorkspaceName('');
  };

  // Delete Workspace
  const onDelete = async (id) => {
    setError(null);

    try {
      const response = await deleteWorkspace(id, token);

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLists((prev) => prev.filter((workspace) => workspace.id !== id));
    } catch (err) {
      setError(err.toString());
    } finally {
      handleTripleDotClose();
    }
  };

  return (
    <Container
      maxWidth="sm"
      sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', py: 2, pt: 0.5 }}
    >
      <Paper
        elevation={3}
        sx={{ px: 1.5, py: 1.5, width: '100%', background: 'var(--secondary-background-color)' }}
      >
        {/* Header */}
        <Typography
          variant="h4"
          align="center"
          gutterBottom
          sx={{ mt: 1.5, fontWeight: 'bold', color: 'var(--secondary-color)' }}
        >
          Workspaces
        </Typography>

        {/* This is for loading */}
        {loading && <Typography align="center"> Loading… </Typography>}

        {/* This is for errors */}
        {error && (
          <Typography color="error" align="center">
            Error: {error}
          </Typography>
        )}

        {/* If we're done loading and there are no errors */}
        <Divider
          sx={{ borderBottomWidth: 2, marginBottom: 1, bgcolor: 'var(--secondary-color)' }}
        />
        {!loading && !error && (
          <Stack spacing={1}>
            {lists.length ? (
              lists.map((list) => (
                <React.Fragment key={list.id}>
                  {editingWorkspaceId === list.id ? (
                    <React.Fragment>
                      {/* Editing Mode */}
                      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5 }}>
                        <TextField
                          autoFocus
                          variant="standard"
                          size="small"
                          sx={{
                            flexGrow: 1,
                            mr: 1,
                            justifyContent: 'space-between',
                            color: 'var(--secondary-color)',
                          }}
                          slotProps={{
                            input: {
                              sx: {
                                color: 'var(--secondary-color)',
                                '&:after': { borderBottomColor: 'var(--secondary-color)' },
                              },
                            },
                          }}
                          value={editWorkspaceName}
                          onChange={(event) => setEditWorkspaceName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') onEdit();
                            if (event.key === 'Escape') closeEdit();
                          }}
                        />
                        <IconButton
                          size="small"
                          onClick={onEdit}
                          disabled={!editWorkspaceName.trim()}
                        >
                          <Add />
                        </IconButton>
                        <IconButton size="small" onClick={closeEdit}>
                          <Close />
                        </IconButton>
                      </Box>
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      {/* Normal Mode */}
                      <Button
                        variant="text"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--secondary-background-color)',
                          color: 'var(--secondary-color)',
                        }}
                        onClick={() => navigate(`/workspace/${list.id}`)}
                      >
                        <Typography
                          variant="body1"
                          fontWeight="bold"
                          sx={{ fontSize: '1.1rem', textAlign: 'left' }}
                        >
                          {list.name}
                        </Typography>
                        <MoreVert onClick={(event) => handleTripleDotClick(event, list)} />
                      </Button>
                    </React.Fragment>
                  )}
                  <Divider sx={{ borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }} />
                </React.Fragment>
              ))
            ) : (
              <Typography
                variant="body1"
                align="center"
                fontWeight="bold"
                sx={{ fontSize: '1.1rem' }}
              >
                No to-do lists found.
              </Typography>
            )}
            {/* By default show the Add New button, otherwise show a TextField & save Workspace*/}
            {!isAdding ? (
              <Button
                variant="text"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'left',
                  background: 'var(--secondary-background-color)',
                  color: 'var(--secondary-color)',
                }}
                startIcon={<Add />}
                onClick={() => setIsAdding(true)}
              >
                <Typography
                  variant="body1"
                  align="center"
                  fontWeight="bold"
                  sx={{ fontSize: '1.1rem' }}
                >
                  Add New
                </Typography>
              </Button>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5 }}>
                <TextField
                  autoFocus
                  variant="standard"
                  size="small"
                  sx={{
                    flexGrow: 1,
                    mr: 1,
                    justifyContent: 'space-between',
                    color: 'var(--secondary-color)',
                  }}
                  slotProps={{
                    input: {
                      sx: {
                        color: 'var(--secondary-color)',
                        '&:after': { borderBottomColor: 'var(--secondary-color)' },
                      },
                    },
                  }}
                  placeholder="New Workspace Name…"
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onAdd();
                    if (event.key === 'Escape') setIsAdding(false);
                  }}
                />
                <IconButton size="small" onClick={onAdd} disabled={!newWorkspaceName.trim()}>
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
        <Menu
          slotProps={{
            paper: {
              sx: {
                backgroundColor: 'var(--secondary-background-color)',
                color: 'var(--secondary-color)',
                boxShadow: 3,
                border: '2.5px solid var(--background-color)',
                borderRadius: 1.5,
              },
            },
          }}
          anchorEl={tripleDotAnchorElement}
          open={open}
          onClose={handleTripleDotClose}
        >
          <MenuItem
            sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
            onClick={startEditing}
          >
            Edit
          </MenuItem>
          <Divider
            variant="middle"
            sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }}
          />
          <MenuItem
            sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
            onClick={() => onDelete(selectedWorkspace.id)}
          >
            Delete
          </MenuItem>
        </Menu>
      </Paper>
    </Container>
  );
}
