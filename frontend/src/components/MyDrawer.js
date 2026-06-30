import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  Box,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  Button,
  TextField,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import MoreVert from '@mui/icons-material/MoreVert';
import DragHandle from '@mui/icons-material/DragHandle';
import Divider from '@mui/material/Divider';
import { getWorkspaceId } from '../utils/Navigation';
import { useLocation, useNavigate } from 'react-router-dom';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';

import {
  createWorkspace,
  deleteWorkspace,
  fetchWorkspace as fetchWorkspaceApi,
  fetchWorkspaces as fetchWorkspacesApi,
  updateWorkspace,
} from '../services/notoliApiClient';

export default function MyDrawer({
  open,
  setDrawerOpen,
  drawerWorkspacesLabel,
  setDrawerWorkspacesLabel,
}) {
  // Navigate using Drawer
  const navigate = useNavigate();

  // Fetch Workspace Name
  const location = useLocation();

  const workspaceId = getWorkspaceId(location.pathname);

  const token = sessionStorage.getItem('accessToken');

  const fetchWorkspaceName = useCallback(async () => {
    if (!workspaceId) return '';
    try {
      const response = await fetchWorkspaceApi(workspaceId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const workspaceData = await response.json();
      return workspaceData?.name ?? '';
    } catch (error) {
      return error.toString() ?? '';
    }
  }, [workspaceId, token]);

  useEffect(() => {
    (async () => {
      try {
        const name = await fetchWorkspaceName();
        setDrawerWorkspacesLabel(name);
      } catch {
        setDrawerWorkspacesLabel('');
      }
    })();
  }, [fetchWorkspaceName, setDrawerWorkspacesLabel]);

  // Fetch Workspace List
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderedWorkspaces, setOrderedWorkspaces] = useState([]);
  const [draggedWorkspaceIndex, setDraggedWorkspaceIndex] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWorkspacesApi(token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setWorkspaces(data);
      if (!isOrdering) setOrderedWorkspaces(data);
      setError(null);
    } catch (err) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [token, isOrdering]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

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
      setWorkspaces((prev) => [...prev, created]);
      setOrderedWorkspaces((prev) => [...prev, created]);

      setIsAdding(false);
      setNewWorkspaceName('');
    } catch (err) {
      setError(err.toString());
    }
  };

  // Triple Dot Menu Functions
  const [tripleDotAnchorElement, setTripleDotAnchorElement] = useState(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const tripleDotOpen = Boolean(tripleDotAnchorElement);

  const handleTripleDotClick = (event, workspaces) => {
    event.stopPropagation();
    setTripleDotAnchorElement(event.currentTarget);
    setSelectedWorkspace(workspaces);
  };

  const handleTripleDotClose = () => {
    setTripleDotAnchorElement(null);
    setSelectedWorkspace(null);
  };

  // Edit Workspace
  const [isEditing, setIsEditing] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [editWorkspaceName, setEditWorkspaceName] = useState('');

  const startEditing = () => {
    setIsEditing(true);
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
      setWorkspaces((prev) =>
        prev.map((workspace) => (workspace.id === updated.id ? updated : workspace)),
      );
      setOrderedWorkspaces((prev) =>
        prev.map((workspace) => (workspace.id === updated.id ? updated : workspace)),
      );

      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  const closeEdit = () => {
    setIsEditing(false);
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
      setWorkspaces((prev) => prev.filter((workspace) => workspace.id !== id));
      setOrderedWorkspaces((prev) => prev.filter((workspace) => workspace.id !== id));
    } catch (err) {
      setError(err.toString());
    } finally {
      handleTripleDotClose();
    }
  };

  // Reorder Workspaces
  const startOrdering = () => {
    setOrderedWorkspaces(workspaces);
    setIsOrdering(true);
    setIsAdding(false);
    closeEdit();
    setError(null);
  };

  const cancelOrdering = () => {
    setOrderedWorkspaces(workspaces);
    setDraggedWorkspaceIndex(null);
    setIsOrdering(false);
  };

  const moveWorkspace = (fromIndex, toIndex) => {
    if (fromIndex === null || fromIndex === toIndex || toIndex < 0) return;
    setOrderedWorkspaces((prev) => {
      if (toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDraggedWorkspaceIndex(toIndex);
  };

  const saveWorkspaceOrder = async () => {
    const updatedWorkspaces = orderedWorkspaces.map((workspace, index) => ({
      ...workspace,
      position: index + 1,
    }));
    setSavingOrder(true);
    setError(null);

    try {
      const responses = await Promise.all(
        updatedWorkspaces.map((workspace) =>
          updateWorkspace(workspace.id, { position: workspace.position }, token),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        throw new Error('Unable to save reordered workspaces.');
      }
      setWorkspaces(updatedWorkspaces);
      setOrderedWorkspaces(updatedWorkspaces);
      setIsOrdering(false);
    } catch (err) {
      setError(err.toString());
    } finally {
      setSavingOrder(false);
      setDraggedWorkspaceIndex(null);
    }
  };

  const visibleWorkspaces = isOrdering ? orderedWorkspaces : workspaces;

  // Manage Drawer
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const toggleWorkspaceDrawer = () => setWorkspaceDrawerOpen((prev) => !prev);
  const [drawerWidth, setDrawerWidth] = useState(180);

  useEffect(() => {
    setDrawerWidth(isAdding || isEditing || isOrdering ? 320 : 200);
  }, [isAdding, isEditing, isOrdering]);

  return (
    <Drawer
      open={open}
      onClose={() => setDrawerOpen(false)}
      anchor="right"
      ModalProps={{ keepMounted: true }}
      sx={{
        '& .MuiDrawer-paper': {
          bgcolor: 'var(--secondary-background-color)',
          color: 'var(--secondary-color)',
          borderTopLeftRadius: 15,
          borderBottomLeftRadius: 15,
        },
        '& .MuiListItemText-primary': { fontWeight: 'bold' },
      }}
    >
      {/* Width-animated container */}
      <Box
        sx={(theme) => ({
          width: drawerWidth,
          transition: theme.transitions.create('width', {
            duration: theme.transitions.duration.standard,
            easing: theme.transitions.easing.easeInOut,
          }),
          willChange: 'width',
          overflow: 'hidden',
          height: '100%',
          bgcolor: 'var(--secondary-background-color)',
          color: 'var(--secondary-color)',
          borderTopLeftRadius: 15,
          borderBottomLeftRadius: 15,
        })}
      >
        <Typography
          variant="h4"
          align="center"
          gutterBottom
          sx={{ mt: 2, mx: 1.5, fontWeight: 'bold', color: 'var(--secondary-color)' }}
        >
          notoli
        </Typography>

        <Box role="navigation">
          <Divider
            sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--secondary-color)' }}
          />

          <List disablePadding sx={{ mt: 1, mb: 1 }}>
            {/* Header row that toggles the nested content */}
            <ListItemButton
              onClick={toggleWorkspaceDrawer}
              aria-expanded={workspaceDrawerOpen}
              sx={{ py: 0 }}
            >
              <ListItemText primary="Workspace" secondary={drawerWorkspacesLabel} />
              {workspaceDrawerOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>

            {/* Nested content that opens/closes */}
            <Collapse in={workspaceDrawerOpen} timeout="auto" unmountOnExit>
              <List sx={{ pb: 0 }}>
                <Divider
                  sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--secondary-color)' }}
                />

                {/* Loading */}
                {loading && (
                  <Typography align="left" sx={{ pl: 3, py: 1, pt: 2 }}>
                    Loading…
                  </Typography>
                )}

                {/* Error */}
                {error && (
                  <Typography color="error" align="left" sx={{ pl: 3, py: 1, pt: 2 }}>
                    {error}
                  </Typography>
                )}

                {/* Data */}
                {!error &&
                  !loading &&
                  visibleWorkspaces.map((workspace, i) => (
                    <React.Fragment key={workspace.id}>
                      {i !== 0 && (
                        <Divider
                          sx={{
                            borderBottomWidth: 2,
                            mr: 2,
                            ml: 2,
                            my: 0.1,
                            px: 0,
                            bgcolor: 'var(--secondary-color)',
                          }}
                        />
                      )}
                      {editingWorkspaceId === workspace.id ? (
                        <React.Fragment>
                          {/* Editing  Mode */}
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              pl: 3,
                              pt: 1.5,
                              pb: 0.75,
                              mr: 1,
                            }}
                          >
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
                          <ListItemButton
                            dense
                            draggable={isOrdering}
                            onDragStart={() => setDraggedWorkspaceIndex(i)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              moveWorkspace(draggedWorkspaceIndex, i);
                            }}
                            onDragEnd={() => setDraggedWorkspaceIndex(null)}
                            sx={{
                              pl: 3,
                              py: 0.75,
                              cursor: isOrdering ? 'grab' : 'pointer',
                              opacity: draggedWorkspaceIndex === i ? 0.65 : 1,
                            }}
                            onClick={() => {
                              if (!isOrdering) navigate(`/workspace/${workspace.id}`);
                            }}
                          >
                            {isOrdering && (
                              <DragHandle
                                aria-label={`Drag ${workspace.name} to reorder`}
                                sx={{ mr: 1, cursor: 'grab' }}
                              />
                            )}
                            <ListItemText primary={workspace.name} />
                            {!isOrdering && (
                              <MoreVert onClick={(event) => handleTripleDotClick(event, workspace)} />
                            )}
                          </ListItemButton>
                        </React.Fragment>
                      )}
                    </React.Fragment>
                  ))}
              </List>

              <Divider
                sx={{
                  borderBottomWidth: 2,
                  mr: 2,
                  ml: 2,
                  my: 0.1,
                  px: 0,
                  bgcolor: 'var(--secondary-color)',
                }}
              />

              {!isOrdering ? (
                <Button
                  sx={{
                    pl: 3,
                    pt: 1.5,
                    pb: 0.75,
                    mr: 1,
                    fontWeight: 'bold',
                    background: 'var(--secondary-background-color)',
                    color: 'var(--secondary-color)',
                  }}
                  startIcon={<DragHandle sx={{ fontSize: 20 }} />}
                  onClick={startOrdering}
                  disabled={loading || Boolean(error) || workspaces.length < 2}
                >
                  Edit Order
                </Button>
              ) : (
                <Box sx={{ display: 'flex', gap: 1, px: 2, py: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={saveWorkspaceOrder}
                    disabled={savingOrder}
                  >
                    Confirm Order
                  </Button>
                  <Button size="small" onClick={cancelOrdering} disabled={savingOrder}>
                    Cancel
                  </Button>
                </Box>
              )}

              {/* Add New */}
              {!isOrdering && !isAdding ? (
                <Button
                  sx={{
                    pl: 3,
                    pt: 1.5,
                    pb: 0.75,
                    fontWeight: 'bold',
                    background: 'var(--secondary-background-color)',
                    color: 'var(--secondary-color)',
                  }}
                  startIcon={<Add sx={{ fontSize: 20 }} />}
                  onClick={() => setIsAdding(true)}
                >
                  Add New
                </Button>
              ) : !isOrdering ? (
                <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5 }}>
                  <TextField
                    autoFocus
                    variant="standard"
                    size="small"
                    sx={{
                      pl: 2,
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
                    placeholder="New Workspace Name..."
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
              ) : null}
            </Collapse>
          </List>
          <Divider
            sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--secondary-color)' }}
          />
        </Box>
      </Box>
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
        open={tripleDotOpen}
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
    </Drawer>
  );
}
