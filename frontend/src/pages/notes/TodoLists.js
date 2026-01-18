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
import { Add, Close, MoreVert } from '@mui/icons-material';
import Divider from '@mui/material/Divider';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  createTodoList,
  deleteTodoList,
  fetchTodoLists as fetchTodoListsApi,
  updateTodoList,
} from '../../services/BackendClient';

export default function TodoLists({ setAppBarHeader }) {
  // Misc
  const navigate = useNavigate();

  // Clear Appbar Header when landing on page (and a bunch of other times too)
  useEffect(() => {
    setAppBarHeader('');
  }, [setAppBarHeader]);

  // Pull Workspace ID
  const { workspaceId } = useParams();

  // Pull TodoList List
  const token = sessionStorage.getItem('accessToken');
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTodoLists = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchTodoListsApi(workspaceId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLists(data);
      setError(null);
    } catch (err) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      fetchTodoLists();
    }
  }, [workspaceId, fetchTodoLists]);

  // Triple Dot Menu Functions
  const [tripleDotAnchorElement, setTripleDotAnchorElement] = useState(null);
  const [selectedTodoList, setSelectedTodoList] = useState(null);
  const open = Boolean(tripleDotAnchorElement);

  const handleTripleDotClick = (event, list) => {
    event.stopPropagation();
    setTripleDotAnchorElement(event.currentTarget);
    setSelectedTodoList(list);
  };

  const handleTripleDotClose = () => {
    setTripleDotAnchorElement(null);
    setSelectedTodoList(null);
  };

  // Add New TodoList
  const [isAdding, setIsAdding] = useState(false);
  const [newTodoListName, setNewTodoListName] = useState('');

  const onAdd = async () => {
    if (!newTodoListName.trim()) return;
    setError(null);

    try {
      const response = await createTodoList(
        workspaceId,
        {
          name: newTodoListName,
          workspace: workspaceId,
          description: '',
        },
        token,
      );

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json();
      setLists((prev) => [...prev, created]);

      setIsAdding(false);
      setNewTodoListName('');
    } catch (err) {
      setError(err.toString());
    }
  };

  // Edit TodoList
  const [editingTodoListId, setEditingTodoListId] = useState(null);
  const [editTodoListName, setEditTodoListName] = useState('');

  const startEditing = () => {
    setEditingTodoListId(selectedTodoList.id);
    setEditTodoListName(selectedTodoList.name);
    handleTripleDotClose();
  };

  const onEdit = async () => {
    if (!editTodoListName.trim()) return;
    setError(null);

    try {
      const response = await updateTodoList(
        editingTodoListId,
        { name: editTodoListName },
        token,
      );

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setLists((prev) => prev.map((todolist) => (todolist.id === updated.id ? updated : todolist)));

      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  const closeEdit = () => {
    setEditingTodoListId(null);
    setEditTodoListName('');
  };

  // Delete TodoList
  const onDelete = async (id) => {
    setError(null);

    try {
      const response = await deleteTodoList(id, token);

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLists((prev) => prev.filter((todolist) => todolist.id !== id));
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
          TodoLists
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
                  {editingTodoListId === list.id ? (
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
                          value={editTodoListName}
                          onChange={(event) => setEditTodoListName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') onEdit();
                            if (event.key === 'Escape') closeEdit();
                          }}
                        />
                        <IconButton
                          size="small"
                          onClick={onEdit}
                          disabled={!editTodoListName.trim()}
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
                        onClick={() => navigate(`/workspace/${workspaceId}/todolist/${list.id}`)}
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
            {/* By default show the Add New button, otherwise show a TextField & save TodoList*/}
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
                  placeholder="New TodoList Name…"
                  value={newTodoListName}
                  onChange={(event) => setNewTodoListName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onAdd();
                    if (event.key === 'Escape') setIsAdding(false);
                  }}
                />
                <IconButton size="small" onClick={onAdd} disabled={!newTodoListName.trim()}>
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
            onClick={() => onDelete(selectedTodoList.id)}
          >
            Delete
          </MenuItem>
        </Menu>
      </Paper>
    </Container>
  );
}
