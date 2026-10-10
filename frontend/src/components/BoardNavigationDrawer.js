import React from 'react';
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
import { useNavigate } from 'react-router-dom';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import BoardShareDialog from './BoardShareDialog';
import { useBoardNavigationDrawer } from '../hooks/useBoardNavigationDrawer';

export default function BoardNavigationDrawer({
  open,
  setDrawerOpen,
  drawerBoardsLabel,
  setDrawerBoardsLabel,
  showSnackbar,
}) {
  const navigate = useNavigate();
  const {
    token,
    boards,
    loading,
    error,
    isAdding,
    setIsAdding,
    newBoardName,
    setNewBoardName,
    onAdd,
    tripleDotAnchorElement,
    tripleDotOpen,
    handleTripleDotClick,
    handleTripleDotClose,
    selectedBoard,
    selectedBoardIsOwner,
    editingBoardId,
    editBoardName,
    setEditBoardName,
    startEditing,
    closeEdit,
    onEdit,
    sharingBoard,
    setSharingBoard,
    shareDialogOpen,
    openShareDialog,
    updateSharedBoard,
    closeShareDialog,
    onDelete,
    boardDrawerOpen,
    toggleBoardDrawer,
    drawerWidth,
  } = useBoardNavigationDrawer({ setDrawerBoardsLabel });

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
                          {/* Editing Mode */}
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
        open={shareDialogOpen}
        board={sharingBoard}
        token={token}
        onClose={closeShareDialog}
        onExited={() => setSharingBoard(null)}
        onBoardUpdated={updateSharedBoard}
        showSnackbar={showSnackbar}
      />
    </SwipeableDrawer>
  );
}
