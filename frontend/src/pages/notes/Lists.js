import React, { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Box,
  Button,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import Delete from '@mui/icons-material/Delete';
import DragIndicator from '@mui/icons-material/DragIndicator';
import Edit from '@mui/icons-material/Edit';
import MoreVert from '@mui/icons-material/MoreVert';
import Reorder from '@mui/icons-material/Reorder';
import Divider from '@mui/material/Divider';
import { useNavigate, useParams } from 'react-router-dom';
import PullToRefreshIndicator from '../../components/PullToRefreshIndicator';
import {
  createList,
  deleteList,
  fetchLists as fetchListsApi,
  fetchBoard as fetchBoardApi,
  reorderLists,
  updateList,
} from '../../services/notoliApiClient';
import { rememberLastBoard } from '../../services/lastBoard';
import { usePullToRefresh } from '../../hooks/useMobileGestures';

const TODO_LIST_VERTICAL_GAP = '8px';
const TODO_LIST_ROW_MIN_HEIGHT = 42;
const VERTICAL_REORDER_DRAG_MODIFIERS = [
  ({ transform }) => ({
    ...transform,
    x: 0,
  }),
];
const DRAG_HANDLE_TOUCH_STYLE = {
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

function SortableListRow({ list, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
  });

  return (
    <Box
      ref={setNodeRef}
      data-testid={`list-sortable-row-${list.id}`}
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.78 : 1,
        zIndex: isDragging ? 1 : 'auto',
      }}
    >
      {children({ handleProps: { ...attributes, ...listeners } })}
    </Box>
  );
}

export default function Lists({ setAppBarHeader }) {
  const navigate = useNavigate();

  useEffect(() => {
    setAppBarHeader('');
  }, [setAppBarHeader]);

  const { boardId } = useParams();
  const token = sessionStorage.getItem('accessToken');
  const [boardName, setBoardName] = useState('');
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReordering, setIsReordering] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const fetchLists = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchListsApi(boardId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLists(data);
      setError(null);
    } catch (err) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [token, boardId]);

  const fetchBoardName = useCallback(async () => {
    setBoardName('');

    if (!boardId) {
      return;
    }

    try {
      const response = await fetchBoardApi(boardId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setBoardName(data?.name ?? '');
    } catch (err) {
      setBoardName('');
      setError(err.toString());
    }
  }, [token, boardId]);

  useEffect(() => {
    if (boardId) {
      rememberLastBoard(boardId);
      fetchLists();
      fetchBoardName();
    }
  }, [boardId, fetchLists, fetchBoardName]);

  const startReordering = () => {
    closeEdit();
    setIsAdding(false);
    handleTripleDotClose();
    setIsReordering(true);
  };

  const stopReordering = () => {
    setIsReordering(false);
  };

  const [tripleDotAnchorElement, setTripleDotAnchorElement] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const open = Boolean(tripleDotAnchorElement);

  const handleTripleDotClick = (event, list) => {
    event.stopPropagation();
    setTripleDotAnchorElement(event.currentTarget);
    setSelectedList(list);
  };

  const handleTripleDotClose = () => {
    setTripleDotAnchorElement(null);
    setSelectedList(null);
  };

  const [isAdding, setIsAdding] = useState(false);
  const [newListName, setNewListName] = useState('');

  const onAdd = async () => {
    if (!newListName.trim()) return;
    setError(null);

    try {
      const response = await createList(
        boardId,
        {
          name: newListName,
          board: boardId,
          description: '',
        },
        token,
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json();
      setLists((prev) => [...prev, created]);

      setIsAdding(false);
      setNewListName('');
    } catch (err) {
      setError(err.toString());
    }
  };

  const [editingListId, setEditingListId] = useState(null);
  const [editListName, setEditListName] = useState('');

  const startEditing = () => {
    setEditingListId(selectedList.id);
    setEditListName(selectedList.name);
    handleTripleDotClose();
  };

  const onEdit = async () => {
    if (!editListName.trim()) return;
    setError(null);

    try {
      const response = await updateList(editingListId, { name: editListName }, token);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setLists((prev) => prev.map((list) => (list.id === updated.id ? updated : list)));

      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  const closeEdit = () => {
    setEditingListId(null);
    setEditListName('');
  };

  const pullToRefreshDisabled =
    loading || isReordering || isAdding || Boolean(editingListId) || open;
  const { isRefreshing, pullDistance, refreshReady } = usePullToRefresh({
    enabled: !pullToRefreshDisabled,
    onRefresh: fetchLists,
  });
  const pullContentOffset = isRefreshing ? 0 : Math.min(pullDistance / 2.5, 36);

  const onDelete = async (id) => {
    setError(null);

    try {
      const response = await deleteList(id, token);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLists((prev) => prev.filter((list) => list.id !== id));
    } catch (err) {
      setError(err.toString());
    } finally {
      handleTripleDotClose();
    }
  };

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;

    const oldIndex = lists.findIndex((list) => list.id === active.id);
    const newIndex = lists.findIndex((list) => list.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousLists = lists;
    const reorderedLists = arrayMove(lists, oldIndex, newIndex);
    setLists(reorderedLists);
    setError(null);

    try {
      const response = await reorderLists(
        boardId,
        reorderedLists.map((list) => list.id),
        token,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updatedLists = await response.json();
      setLists(updatedLists);
    } catch (err) {
      setLists(previousLists);
      setError(err.toString());
    }
  };

  const renderRowContent = (list, handleProps = null) => {
    if (editingListId === list.id) {
      return (
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
            value={editListName}
            onChange={(event) => setEditListName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onEdit();
              if (event.key === 'Escape') closeEdit();
            }}
          />
          <IconButton size="small" onClick={onEdit} disabled={!editListName.trim()}>
            <Add />
          </IconButton>
          <IconButton size="small" onClick={closeEdit}>
            <Close />
          </IconButton>
        </Box>
      );
    }

    const rowSx = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--secondary-background-color)',
      color: 'var(--secondary-color)',
      borderRadius: 1,
      width: '100%',
      minHeight: TODO_LIST_ROW_MIN_HEIGHT,
      boxSizing: 'border-box',
    };

    if (isReordering) {
      return (
        <Box data-testid={`list-reorder-row-${list.id}`} sx={{ ...rowSx, px: 1, py: 0.5 }}>
          <Typography
            variant="body1"
            fontWeight="bold"
            sx={{ fontSize: '1.1rem', textAlign: 'left' }}
          >
            {list.name}
          </Typography>
          <IconButton
            size="small"
            aria-label={`Drag ${list.name}`}
            data-testid={`list-drag-handle-${list.id}`}
            sx={{ color: 'var(--secondary-color)', cursor: 'grab' }}
            style={DRAG_HANDLE_TOUCH_STYLE}
            {...handleProps}
          >
            <DragIndicator />
          </IconButton>
        </Box>
      );
    }

    return (
      <Box data-testid={`list-row-${list.id}`} sx={rowSx}>
        <Button
          variant="text"
          sx={{
            flexGrow: 1,
            justifyContent: 'flex-start',
            color: 'var(--secondary-color)',
            textTransform: 'none',
          }}
          onClick={() => navigate(`/board/${boardId}/list/${list.id}`)}
        >
          <Typography
            variant="body1"
            fontWeight="bold"
            sx={{ fontSize: '1.1rem', textAlign: 'left' }}
          >
            {list.name}
          </Typography>
        </Button>
        <IconButton
          size="small"
          aria-label={`List actions for ${list.name}`}
          onClick={(event) => handleTripleDotClick(event, list)}
          sx={{ color: 'var(--secondary-color)' }}
        >
          <MoreVert />
        </IconButton>
      </Box>
    );
  };

  const renderListRows = () => {
    if (!lists.length) {
      return (
        <Typography variant="body1" align="center" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
          No lists found.
        </Typography>
      );
    }

    if (isReordering) {
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={VERTICAL_REORDER_DRAG_MODIFIERS}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={lists.map((list) => list.id)}
            strategy={verticalListSortingStrategy}
          >
            <Box
              data-testid="list-reorder-list"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: TODO_LIST_VERTICAL_GAP,
              }}
            >
              {lists.map((list) => (
                <SortableListRow key={list.id} list={list}>
                  {({ handleProps }) => (
                    <Box
                      data-testid={`list-reorder-item-${list.id}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: TODO_LIST_VERTICAL_GAP,
                      }}
                    >
                      {renderRowContent(list, handleProps)}
                      <Divider sx={{ borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }} />
                    </Box>
                  )}
                </SortableListRow>
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      );
    }

    return (
      <Box
        data-testid="list-list"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: TODO_LIST_VERTICAL_GAP,
        }}
      >
        {lists.map((list) => (
          <React.Fragment key={list.id}>
            {renderRowContent(list)}
            <Divider sx={{ borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }} />
          </React.Fragment>
        ))}
      </Box>
    );
  };

  return (
    <Container
      maxWidth="sm"
      sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', py: 2, pt: 0.5 }}
    >
      <Paper
        elevation={3}
        sx={{
          px: 1.5,
          pt: 1.5,
          pb: `calc(12px + ${pullContentOffset}px)`,
          width: '100%',
          background: 'var(--secondary-background-color)',
        }}
      >
        <Box
          sx={{
            transform: `translateY(${pullContentOffset}px)`,
            transition: pullDistance > 0 ? 'none' : 'transform 180ms ease-out',
          }}
        >
          <PullToRefreshIndicator
            pullDistance={pullDistance}
            refreshReady={refreshReady}
            isRefreshing={isRefreshing}
          />
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}
          >
            <Box sx={{ width: 40 }} />
            <Typography
              variant="h4"
              align="center"
              gutterBottom
              sx={{ fontWeight: 'bold', color: 'var(--secondary-color)' }}
            >
              {isReordering ? 'Reorder Lists' : boardName}
            </Typography>
            <Box sx={{ width: 40 }} />
          </Box>

          {loading && <Typography align="center"> Loading... </Typography>}

          {error && (
            <Typography color="error" align="center">
              Error: {error}
            </Typography>
          )}

          <Divider
            sx={{ borderBottomWidth: 2, marginBottom: 1, bgcolor: 'var(--secondary-color)' }}
          />
          {!loading && !error && (
            <Stack spacing={1}>
            {renderListRows()}
            {isReordering ? (
              <Button
                variant="text"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'left',
                  background: 'var(--secondary-background-color)',
                  color: 'var(--secondary-color)',
                }}
                onClick={stopReordering}
              >
                <Typography
                  variant="body1"
                  align="center"
                  fontWeight="bold"
                  sx={{ fontSize: '1.1rem' }}
                >
                  Done Reordering
                </Typography>
              </Button>
            ) : !isAdding ? (
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
                  placeholder="New List Name..."
                  value={newListName}
                  onChange={(event) => setNewListName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onAdd();
                    if (event.key === 'Escape') setIsAdding(false);
                  }}
                />
                <IconButton size="small" onClick={onAdd} disabled={!newListName.trim()}>
                  <Add />
                </IconButton>
                <IconButton size="small" onClick={() => setIsAdding(false)}>
                  <Close />
                </IconButton>
              </Box>
            )}
            </Stack>
          )}
        </Box>

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
            <Edit sx={{ mr: 1, fontSize: 18 }} />
            Rename
          </MenuItem>
          <Divider
            variant="middle"
            sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }}
          />
          <MenuItem
            sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
            onClick={startReordering}
            disabled={lists.length < 2}
          >
            <Reorder sx={{ mr: 1, fontSize: 18 }} />
            Reorder
          </MenuItem>
          <Divider
            variant="middle"
            sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }}
          />
          <MenuItem
            sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
            onClick={() => onDelete(selectedList.id)}
          >
            <Delete sx={{ mr: 1, fontSize: 18 }} />
            Remove
          </MenuItem>
        </Menu>
      </Paper>
    </Container>
  );
}
