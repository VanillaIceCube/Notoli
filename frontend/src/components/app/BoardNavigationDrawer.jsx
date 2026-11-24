import useSession, { useSessionGuard } from '../../hooks/authentication/useSession';
import { getSessionSnapshot } from '../../services/authentication/sessionState';
import React, { useState, useEffect } from 'react';
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
import { getBoardId } from '../../utils/navigation';
import { useLocation, useNavigate } from 'react-router';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import BoardShareDialog from './BoardShareDialog';

import { createBoard, deleteBoard, updateBoard } from '../../services/boards/notoliApiClient';

export default function BoardNavigationDrawer({ boardList, open, setDrawerOpen, showSnackbar }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const boardId = getBoardId(pathname);
  const { accessToken: token, username: currentUsername, email: currentEmail } = useSession();
  const isCurrentSession = useSessionGuard();

  const { boards, loading, loadError, updateBoards } = boardList;
  const [actionError, setError] = useState(null);
  const error = actionError || loadError?.toString();
  const activeBoardName = boards.find((board) => String(board.id) === boardId)?.name;

  // Add New Board
  const [isAdding, setIsAdding] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  useEffect(() => {
    if (!token) {
      setIsAdding(false);
      setEditingBoardId(null);
    }
  }, [token]);

  const onAdd = async () => {
    if (!newBoardName.trim()) return;
    if (!getSessionSnapshot().accessToken) {
      const message = 'Authentication required.';
      setError(message);
      if (typeof showSnackbar === 'function') {
        showSnackbar('error', message);
      }
      return;
    }
    if (!isCurrentSession()) return;
    setError(null);

    try {
      const created = await createBoard({ name: newBoardName, description: '' });
      if (!isCurrentSession()) return;
      updateBoards((prev) =>
        prev.some((board) => board.id === created.id) ? prev : [...prev, created],
      );

      setIsAdding(false);
      setNewBoardName('');
      if (typeof showSnackbar === 'function') {
        showSnackbar('success', `Board "${created.name}" created!`);
      }
    } catch (err) {
      if (!isCurrentSession()) return;
      const message = err?.message || err?.toString() || 'Unable to create board.';
      setError(err?.toString() || message);
      if (typeof showSnackbar === 'function') {
        showSnackbar('error', message);
      }
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
    // Keep permission-dependent items mounted until the whole menu finishes exiting.
  };

  // Rename board
  const [editingBoardId, setEditingBoardId] = useState(null);
  const [editBoardName, setEditBoardName] = useState('');

  const startEditing = () => {
    setEditingBoardId(selectedBoard.id);
    setEditBoardName(selectedBoard.name);
    handleTripleDotClose();
  };

  const onEdit = async () => {
    if (!editBoardName.trim()) return;
    if (!getSessionSnapshot().accessToken) {
      const message = 'Authentication required.';
      setError(message);
      if (typeof showSnackbar === 'function') {
        showSnackbar('error', message);
      }
      return;
    }
    if (!isCurrentSession()) return;
    setError(null);

    try {
      const updated = await updateBoard(editingBoardId, { name: editBoardName });
      if (!isCurrentSession()) return;
      updateBoards((prev) => prev.map((board) => (board.id === updated.id ? updated : board)));

      closeEdit();
      if (typeof showSnackbar === 'function') {
        showSnackbar('success', `Board renamed to "${updated.name}".`);
      }
    } catch (err) {
      if (!isCurrentSession()) return;
      const message = err?.message || err?.toString() || 'Unable to update board.';
      setError(err?.toString() || message);
      if (typeof showSnackbar === 'function') {
        showSnackbar('error', message);
      }
    }
  };

  const closeEdit = () => {
    setEditingBoardId(null);
    setEditBoardName('');
  };

  // Share Board
  const [sharingBoard, setSharingBoard] = useState(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const openShareDialog = (board) => {
    setSharingBoard(board);
    setShareDialogOpen(true);
    handleTripleDotClose();
  };

  const updateSharedBoard = (updatedBoard) => {
    updateBoards((prev) =>
      prev.map((board) => (board.id === updatedBoard.id ? updatedBoard : board)),
    );
    setSharingBoard(updatedBoard);
  };

  const closeShareDialog = () => {
    setShareDialogOpen(false);
  };

  // Remove board
  const onDelete = async (id) => {
    if (!getSessionSnapshot().accessToken) {
      const message = 'Authentication required.';
      setError(message);
      if (typeof showSnackbar === 'function') {
        showSnackbar('error', message);
      }
      handleTripleDotClose();
      return;
    }
    if (!isCurrentSession()) return;
    setError(null);

    try {
      await deleteBoard(id);
      if (!isCurrentSession()) return;

      updateBoards((prev) => prev.filter((board) => board.id !== id));
      if (typeof showSnackbar === 'function') {
        showSnackbar('success', 'Board deleted.');
      }
      if (String(id) === String(boardId)) {
        navigate('/');
      }
    } catch (err) {
      if (!isCurrentSession()) return;
      const message = err?.message || err?.toString() || 'Unable to delete board.';
      setError(err?.toString() || message);
      if (typeof showSnackbar === 'function') {
        showSnackbar('error', message);
      }
    } finally {
      handleTripleDotClose();
    }
  };

  // Manage Drawer
  const [boardDrawerOpen, setBoardDrawerOpen] = useState(false);
  const toggleBoardDrawer = () => setBoardDrawerOpen((prev) => !prev);
  const drawerWidth = isAdding || editingBoardId !== null ? 300 : 200;

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
          bgcolor: 'var(--surface-background)',
          color: 'var(--surface-text)',
          borderTopLeftRadius: 15,
          borderBottomLeftRadius: 15,
        })}
      >
        <Typography
          variant="h4"
          align="center"
          gutterBottom
          sx={{ mt: 2, mx: 1.5, fontWeight: 'bold', color: 'var(--surface-text)' }}
        >
          notoli
        </Typography>

        <Box role="navigation">
          <Divider sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--surface-text)' }} />

          <List disablePadding sx={{ mt: 1, mb: 1 }}>
            {/* Header row that toggles the nested content */}
            <ListItemButton
              onClick={toggleBoardDrawer}
              aria-expanded={boardDrawerOpen}
              sx={{ py: 0 }}
            >
              <ListItemText primary="Board" secondary={activeBoardName} />
              {boardDrawerOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>

            {/* Nested content that opens/closes */}
            <Collapse in={boardDrawerOpen} timeout="auto" unmountOnExit>
              <List sx={{ pb: 0 }}>
                <Divider
                  sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--surface-text)' }}
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
                            bgcolor: 'var(--surface-text)',
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
                                color: 'var(--surface-text)',
                              }}
                              slotProps={{
                                input: {
                                  sx: {
                                    color: 'var(--surface-text)',
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
                          <Box sx={{ display: 'flex', alignItems: 'center', pl: 3, pr: 1 }}>
                            <ListItemButton
                              dense
                              sx={{ pl: 0, py: 0.75 }}
                              onClick={() => {
                                navigate(`/board/${board.id}`);
                              }}
                            >
                              <ListItemText primary={board.name} />
                            </ListItemButton>
                            <IconButton
                              size="small"
                              sx={{ color: 'inherit' }}
                              aria-label={`Board actions for ${board.name}`}
                              aria-haspopup="menu"
                              aria-expanded={tripleDotOpen && selectedBoard?.id === board.id}
                              onClick={(event) => handleTripleDotClick(event, board)}
                            >
                              <MoreVert />
                            </IconButton>
                          </Box>
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
                  bgcolor: 'var(--surface-text)',
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
                    background: 'var(--surface-background)',
                    color: 'var(--surface-text)',
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
                      color: 'var(--surface-text)',
                    }}
                    slotProps={{
                      input: {
                        sx: {
                          color: 'var(--surface-text)',
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
          <Divider sx={{ borderBottomWidth: 2, mx: 1, my: 0.1, bgcolor: 'var(--surface-text)' }} />
        </Box>
      </Box>
      {/* Triple dot menu */}
      <Menu
        slotProps={{
          transition: {
            onExited: () => {
              if (!tripleDotOpen) setSelectedBoard(null);
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
        {selectedBoardIsOwner && [
          <Divider
            key="rename-divider"
            variant="middle"
            sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--surface-text)' }}
          />,
          <MenuItem
            key="rename"
            sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
            onClick={startEditing}
          >
            <Edit sx={{ mr: 1, fontSize: 18 }} />
            Rename
          </MenuItem>,
          <Divider
            key="remove-divider"
            variant="middle"
            sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--surface-text)' }}
          />,
          <MenuItem
            key="remove"
            sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
            onClick={() => onDelete(selectedBoard.id)}
          >
            <Delete sx={{ mr: 1, fontSize: 18 }} />
            Remove
          </MenuItem>,
        ]}
      </Menu>
      <BoardShareDialog
        open={shareDialogOpen}
        board={sharingBoard}
        onClose={closeShareDialog}
        onExited={() => setSharingBoard(null)}
        onBoardUpdated={updateSharedBoard}
        showSnackbar={showSnackbar}
      />
    </SwipeableDrawer>
  );
}
