import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  SwipeableDrawer,
  Typography,
  Button,
  TextField,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import MoreVert from '@mui/icons-material/MoreVert';
import Share from '@mui/icons-material/Share';
import Divider from '@mui/material/Divider';
import { getBoardId } from '../utils/Navigation';
import { useLocation, useNavigate } from 'react-router-dom';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import BoardShareDialog from './BoardShareDialog';

import {
  createBoard,
  deleteBoard,
  fetchBoard as fetchBoardApi,
  fetchBoards as fetchBoardsApi,
  updateBoard,
} from '../services/notoliApiClient';

export default function BoardNavigationDrawer({
  open,
  setDrawerOpen,
  drawerBoardsLabel,
  setDrawerBoardsLabel,
  showSnackbar,
}) {
  // Navigate using Drawer
  const navigate = useNavigate();

  // Fetch Board Name
  const location = useLocation();

  const boardId = getBoardId(location.pathname);

  const token = sessionStorage.getItem('accessToken');
  const currentUsername = sessionStorage.getItem('username');
  const currentEmail = sessionStorage.getItem('email');

  const fetchBoardName = useCallback(async () => {
    if (!boardId) return '';
    try {
      const response = await fetchBoardApi(boardId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const boardData = await response.json();
      return boardData?.name ?? '';
    } catch (error) {
      return error.toString() ?? '';
    }
  }, [boardId, token]);

  useEffect(() => {
    (async () => {
      try {
        const name = await fetchBoardName();
        setDrawerBoardsLabel(name);
      } catch {
        setDrawerBoardsLabel('');
      }
    })();
  }, [fetchBoardName, setDrawerBoardsLabel]);

  // Fetch Board List
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchBoardsApi(token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setBoards(data);
      setError(null);
    } catch (err) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  // Add New Board
  const [isAdding, setIsAdding] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  const onAdd = async () => {
    if (!newBoardName.trim()) return;
    setError(null);

    try {
      const response = await createBoard(
        {
          name: newBoardName,
          description: '',
        },
        token,
      );

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json();
      setBoards((prev) => [...prev, created]);

      setIsAdding(false);
      setNewBoardName('');
    } catch (err) {
      setError(err.toString());
    }
  };

  // Triple Dot Menu Functions
  const [tripleDotAnchorElement, setTripleDotAnchorElement] = useState(null);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const tripleDotOpen = Boolean(tripleDotAnchorElement);
  const selectedBoardOwner = selectedBoard?.owner_details;
  const selectedBoardIsOwner =
    selectedBoardOwner &&
    ((currentUsername && selectedBoardOwner.username === currentUsername) ||
      (currentEmail && selectedBoardOwner.email === currentEmail));

  const handleTripleDotClick = (event, boards) => {
    event.stopPropagation();
    setTripleDotAnchorElement(event.currentTarget);
    setSelectedBoard(boards);
  };

  const handleTripleDotClose = () => {
    setTripleDotAnchorElement(null);
    setSelectedBoard(null);
  };

  // Rename board
  const [isEditing, setIsEditing] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState(null);
  const [editBoardName, setEditBoardName] = useState('');

  const startEditing = () => {
    setIsEditing(true);
    setEditingBoardId(selectedBoard.id);
    setEditBoardName(selectedBoard.name);
    handleTripleDotClose();
  };

  const onEdit = async () => {
    if (!editBoardName.trim()) return;
    setError(null);

    try {
      const response = await updateBoard(editingBoardId, { name: editBoardName }, token);

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setBoards((prev) => prev.map((board) => (board.id === updated.id ? updated : board)));

      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  const closeEdit = () => {
    setIsEditing(false);
    setEditingBoardId(null);
    setEditBoardName('');
  };

  // Share Board
  const [sharingBoard, setSharingBoard] = useState(null);

  const openShareDialog = (board) => {
    setSharingBoard(board);
    handleTripleDotClose();
  };

  const updateSharedBoard = (updatedBoard) => {
    setBoards((prev) => prev.map((board) => (board.id === updatedBoard.id ? updatedBoard : board)));
    setSharingBoard(updatedBoard);
  };

  // Remove board
  const onDelete = async (id) => {
    setError(null);

    try {
      const response = await deleteBoard(id, token);

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setBoards((prev) => prev.filter((board) => board.id !== id));
    } catch (err) {
      setError(err.toString());
    } finally {
      handleTripleDotClose();
    }
  };

  // Manage Drawer
  const [boardDrawerOpen, setBoardDrawerOpen] = useState(false);
  const toggleBoardDrawer = () => setBoardDrawerOpen((prev) => !prev);
  const [drawerWidth, setDrawerWidth] = useState(180);

  useEffect(() => {
    setDrawerWidth(isAdding || isEditing ? 300 : 200);
  }, [isAdding, isEditing]);

  return (
    <SwipeableDrawer
      open={open}
      onClose={() => setDrawerOpen(false)}
      onOpen={() => setDrawerOpen(true)}
      anchor="right"
      disableSwipeToOpen={false}
      swipeAreaWidth={10}
      hysteresis={0.08}
      minFlingVelocity={220}
      disableBackdropTransition
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
              onClick={toggleBoardDrawer}
              aria-expanded={boardDrawerOpen}
              sx={{ py: 0 }}
            >
              <ListItemText primary="Board" secondary={drawerBoardsLabel} />
              {boardDrawerOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>

            {/* Nested content that opens/closes */}
            <Collapse in={boardDrawerOpen} timeout="auto" unmountOnExit>
              <List sx={{ pb: 0 }}>
                <Divider
                  sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--secondary-color)' }}
                />

                {/* Loading */}
                {loading && boards.length === 0 && (
                  <Typography align="left" sx={{ pl: 3, py: 1, pt: 2 }}>
                    Loading...
                  </Typography>
                )}

                {/* Error */}
                {error && (
                  <Typography color="error" align="left" sx={{ pl: 3, py: 1, pt: 2 }}>
                    {error}
                  </Typography>
                )}

                {/* Data */}
                {(!error || boards.length > 0) &&
                  boards.map((board, i) => (
                    <React.Fragment key={board.id}>
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
                      {editingBoardId === board.id ? (
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
                              value={editBoardName}
                              onChange={(event) => setEditBoardName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') onEdit();
                                if (event.key === 'Escape') closeEdit();
                              }}
                            />
                            <IconButton
                              size="small"
                              onClick={onEdit}
                              disabled={!editBoardName.trim()}
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
                            sx={{ pl: 3, py: 0.75 }}
                            onClick={() => {
                              navigate(`/board/${board.id}`);
                            }}
                          >
                            <ListItemText primary={board.name} />
                            <MoreVert onClick={(event) => handleTripleDotClick(event, board)} />
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

              {/* Add New */}
              {!isAdding ? (
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
              ) : (
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
                    placeholder="New Board Name..."
                    value={newBoardName}
                    onChange={(event) => setNewBoardName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onAdd();
                      if (event.key === 'Escape') setIsAdding(false);
                    }}
                  />
                  <IconButton size="small" onClick={onAdd} disabled={!newBoardName.trim()}>
                    <Add />
                  </IconButton>
                  <IconButton size="small" onClick={() => setIsAdding(false)}>
                    <Close />
                  </IconButton>
                </Box>
              )}
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
          onClick={() => openShareDialog(selectedBoard)}
        >
          <Share sx={{ mr: 1, fontSize: 18 }} />
          Share
        </MenuItem>
        {selectedBoardIsOwner && (
          <React.Fragment>
            <Divider
              variant="middle"
              sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }}
            />
            <MenuItem
              sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
              onClick={startEditing}
            >
              <Edit sx={{ mr: 1, fontSize: 18 }} />
              Rename
            </MenuItem>
            <Divider
              variant="middle"
              sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }}
            />
            <MenuItem
              sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
              onClick={() => onDelete(selectedBoard.id)}
            >
              <Delete sx={{ mr: 1, fontSize: 18 }} />
              Remove
            </MenuItem>
          </React.Fragment>
        )}
      </Menu>
      <BoardShareDialog
        open={Boolean(sharingBoard)}
        board={sharingBoard}
        token={token}
        onClose={() => setSharingBoard(null)}
        onBoardUpdated={updateSharedBoard}
        showSnackbar={showSnackbar}
      />
    </SwipeableDrawer>
  );
}
