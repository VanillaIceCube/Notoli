// BoardListsPage loads one board's lists and plugs board-specific CRUD/navigation into notepad UI.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { Box, Button, IconButton, Typography } from '@mui/material';
import Add from '@mui/icons-material/Add';
import DragIndicator from '@mui/icons-material/DragIndicator';
import MoreVert from '@mui/icons-material/MoreVert';
import { useNavigate, useParams } from 'react-router-dom';
import InlineTextEditor from '../../components/notepadPages/InlineTextEditor';
import NotepadPageShell from '../../components/notepadPages/NotepadPageShell';
import NotepadRowActionMenu from '../../components/notepadPages/NotepadRowActionMenu';
import SortableNotepadItems, {
  NOTEPAD_ITEM_ROW_MIN_HEIGHT,
  DRAG_HANDLE_TOUCH_STYLE,
} from '../../components/notepadPages/SortableNotepadItems';
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

const rowSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'var(--secondary-background-color)',
  color: 'var(--secondary-color)',
  borderRadius: 1,
  width: '100%',
  minHeight: NOTEPAD_ITEM_ROW_MIN_HEIGHT,
  boxSizing: 'border-box',
};

const pageActionButtonSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'left',
  background: 'var(--secondary-background-color)',
  color: 'var(--secondary-color)',
};

const rowTitleSx = { fontSize: '1.1rem', textAlign: 'left' };

export default function BoardListsPage({ setAppBarHeader }) {
  const navigate = useNavigate();
  const { boardId } = useParams();
  const token = sessionStorage.getItem('accessToken');
  const [boardName, setBoardName] = useState('');
  const [boardNameLoading, setBoardNameLoading] = useState(true);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReordering, setIsReordering] = useState(false);
  const [actionMenuAnchorEl, setActionMenuAnchorEl] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingListId, setEditingListId] = useState(null);
  const [editListName, setEditListName] = useState('');
  const actionMenuOpen = Boolean(actionMenuAnchorEl);

  useLayoutEffect(() => {
    setAppBarHeader('');
  }, [setAppBarHeader]);

  useEffect(() => {
    document.title = boardName ? `Notoli - ${boardName}` : 'Notoli';
  }, [boardName]);

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
    setBoardNameLoading(true);

    if (!boardId) {
      setBoardName('');
      setBoardNameLoading(false);
      return;
    }

    try {
      const response = await fetchBoardApi(boardId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setBoardName(data?.name ?? '');
    } catch (err) {
      setError(err.toString());
    } finally {
      setBoardNameLoading(false);
    }
  }, [token, boardId]);

  useEffect(() => {
    if (boardId) {
      rememberLastBoard(boardId);
      fetchLists();
      fetchBoardName();
    }
  }, [boardId, fetchLists, fetchBoardName]);

  const closeActionMenu = () => {
    setActionMenuAnchorEl(null);
    setSelectedList(null);
  };

  const closeEdit = () => {
    setEditingListId(null);
    setEditListName('');
  };

  const startReordering = () => {
    closeEdit();
    setIsAdding(false);
    closeActionMenu();
    setIsReordering(true);
  };

  const openActionMenu = (event, list) => {
    event.stopPropagation();
    setActionMenuAnchorEl(event.currentTarget);
    setSelectedList(list);
  };

  const onAdd = async () => {
    if (!newListName.trim()) return;
    setError(null);

    try {
      const response = await createList(
        boardId,
        { name: newListName, board: boardId, description: '' },
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

  const startEditing = () => {
    setEditingListId(selectedList.id);
    setEditListName(selectedList.name);
    closeActionMenu();
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

  const pullToRefreshDisabled =
    loading || isReordering || isAdding || Boolean(editingListId) || actionMenuOpen;
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
      closeActionMenu();
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

  const renderListRow = (list, handleProps = null) => {
    if (editingListId === list.id) {
      return (
        <InlineTextEditor
          value={editListName}
          onChange={setEditListName}
          onSubmit={onEdit}
          onCancel={closeEdit}
        />
      );
    }

    if (isReordering) {
      return (
        <Box data-testid={`list-reorder-row-${list.id}`} sx={{ ...rowSx, px: 1, py: 0.5 }}>
          <Typography variant="body1" fontWeight="bold" sx={rowTitleSx}>
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
          data-pull-refresh-start="true"
          data-testid={`list-row-button-${list.id}`}
          sx={{
            flexGrow: 1,
            justifyContent: 'flex-start',
            color: 'var(--secondary-color)',
            textTransform: 'none',
          }}
          onClick={() =>
            navigate(`/board/${boardId}/list/${list.id}`, {
              state: { boardName, listName: list.name },
            })
          }
        >
          <Typography variant="body1" fontWeight="bold" sx={rowTitleSx}>
            {list.name}
          </Typography>
        </Button>
        <IconButton
          size="small"
          aria-label={`List actions for ${list.name}`}
          onClick={(event) => openActionMenu(event, list)}
          sx={{ color: 'var(--secondary-color)' }}
        >
          <MoreVert />
        </IconButton>
      </Box>
    );
  };

  return (
    <>
      <NotepadPageShell
        title={isReordering ? 'Reorder Lists' : boardName}
        titleLoading={!isReordering && boardNameLoading}
        loading={loading}
        error={error}
        hasContent={lists.length > 0}
        pullDistance={pullDistance}
        refreshReady={refreshReady}
        isRefreshing={isRefreshing}
        pullContentOffset={pullContentOffset}
      >
        <SortableNotepadItems
          items={lists}
          emptyMessage="No lists found."
          isReordering={isReordering}
          onDragEnd={onDragEnd}
          renderItem={renderListRow}
          testIdPrefix="list"
        />
        {isReordering ? (
          <Button variant="text" sx={pageActionButtonSx} onClick={() => setIsReordering(false)}>
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
            sx={pageActionButtonSx}
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
          <InlineTextEditor
            placeholder="New List Name..."
            value={newListName}
            onChange={setNewListName}
            onSubmit={onAdd}
            onCancel={() => setIsAdding(false)}
          />
        )}
      </NotepadPageShell>

      <NotepadRowActionMenu
        anchorEl={actionMenuAnchorEl}
        open={actionMenuOpen}
        onClose={closeActionMenu}
        onRename={startEditing}
        onReorder={startReordering}
        onRemove={() => onDelete(selectedList.id)}
        reorderDisabled={lists.length < 2}
      />
    </>
  );
}
