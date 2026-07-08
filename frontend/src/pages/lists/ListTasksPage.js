// ListTasksPage loads one list's tasks and adds task-specific completion behavior to notepad UI.
import { useCallback, useEffect, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { Box, Button, Checkbox, IconButton, Typography } from '@mui/material';
import Add from '@mui/icons-material/Add';
import DragIndicator from '@mui/icons-material/DragIndicator';
import MoreVert from '@mui/icons-material/MoreVert';
import { useParams } from 'react-router-dom';
import InlineTextEditor from '../../components/notepadPages/InlineTextEditor';
import NotepadPageShell from '../../components/notepadPages/NotepadPageShell';
import NotepadRowActionMenu from '../../components/notepadPages/NotepadRowActionMenu';
import SortableNotepadItems, {
  NOTEPAD_ITEM_ROW_MIN_HEIGHT,
  DRAG_HANDLE_TOUCH_STYLE,
} from '../../components/notepadPages/SortableNotepadItems';
import {
  createNote,
  deleteNote,
  fetchNotes as fetchNotesApi,
  fetchList as fetchListApi,
  fetchBoard as fetchBoardApi,
  reorderNotes,
  updateNote,
} from '../../services/notoliApiClient';
import { rememberLastBoard } from '../../services/lastBoard';
import { usePullToRefresh } from '../../hooks/useMobileGestures';

const NOTE_STATUS_NOT_STARTED = 'Not Started';
const NOTE_STATUS_COMPLETE = 'Complete';
const isTaskComplete = (task) => task.status === NOTE_STATUS_COMPLETE;

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

export default function ListTasksPage({ setAppBarHeader }) {
  const { boardId, listId } = useParams();
  const token = sessionStorage.getItem('accessToken');
  const [listName, setListName] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReordering, setIsReordering] = useState(false);
  const [actionMenuAnchorEl, setActionMenuAnchorEl] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTask, setEditTask] = useState('');
  const actionMenuOpen = Boolean(actionMenuAnchorEl);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchNotesApi(listId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [token, listId]);

  const fetchListName = useCallback(async () => {
    setListName('');

    if (!listId) return;
    try {
      const response = await fetchListApi(listId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const listData = await response.json();
      setListName(listData?.name ?? '');
    } catch (err) {
      setListName('');
      setError(err.toString());
    }
  }, [listId, token]);

  const fetchBoardName = useCallback(async () => {
    setAppBarHeader('');

    if (!boardId) return;

    try {
      const response = await fetchBoardApi(boardId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const boardData = await response.json();
      setAppBarHeader(boardData?.name ?? '');
    } catch (err) {
      setAppBarHeader('');
      setError(err.toString());
    }
  }, [boardId, token, setAppBarHeader]);

  useEffect(() => {
    if (listId) {
      rememberLastBoard(boardId);
      fetchTasks();
      fetchListName();
      fetchBoardName();
    }
  }, [boardId, listId, fetchTasks, fetchListName, fetchBoardName]);

  const closeActionMenu = () => {
    setActionMenuAnchorEl(null);
    setSelectedTask(null);
  };

  const closeEdit = () => {
    setEditingTaskId(null);
    setEditTask('');
  };

  const startReordering = () => {
    closeEdit();
    setIsAdding(false);
    closeActionMenu();
    setIsReordering(true);
  };

  const openActionMenu = (event, task) => {
    setActionMenuAnchorEl(event.currentTarget);
    setSelectedTask(task);
  };

  const onAdd = async () => {
    if (!newTask.trim()) return;
    setError(null);

    try {
      const response = await createNote(
        listId,
        { note: newTask, list: listId, description: '' },
        token,
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json();
      setTasks((prev) => [...prev, created]);
      setIsAdding(false);
      setNewTask('');
    } catch (err) {
      setError(err.toString());
    }
  };

  const startEditing = () => {
    setEditingTaskId(selectedTask.id);
    setEditTask(selectedTask.note);
    closeActionMenu();
  };

  const onEdit = async () => {
    if (!editTask.trim()) return;
    setError(null);

    try {
      const response = await updateNote(editingTaskId, { note: editTask }, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setTasks((prev) =>
        prev.map((task) => (task.id === updated.id ? { ...task, ...updated } : task)),
      );
      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  const onToggleStatus = async (event, taskToToggle) => {
    event.stopPropagation();
    const status = event.target.checked ? NOTE_STATUS_COMPLETE : NOTE_STATUS_NOT_STARTED;
    setError(null);
    setTasks((prev) =>
      prev.map((task) => (task.id === taskToToggle.id ? { ...task, status } : task)),
    );

    try {
      const response = await updateNote(taskToToggle.id, { status }, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setTasks((prev) =>
        prev.map((task) => (task.id === updated.id ? { ...task, ...updated } : task)),
      );
    } catch (err) {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskToToggle.id ? { ...task, status: taskToToggle.status } : task,
        ),
      );
      setError(err.toString());
    }
  };

  const pullToRefreshDisabled =
    loading || isReordering || isAdding || Boolean(editingTaskId) || actionMenuOpen;
  const { isRefreshing, pullDistance, refreshReady } = usePullToRefresh({
    enabled: !pullToRefreshDisabled,
    onRefresh: fetchTasks,
  });
  const pullContentOffset = isRefreshing ? 0 : Math.min(pullDistance / 2.5, 36);

  const onDelete = async (id) => {
    setError(null);

    try {
      const response = await deleteNote(id, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setTasks((prev) => prev.filter((task) => task.id !== id));
    } catch (err) {
      setError(err.toString());
    } finally {
      closeActionMenu();
    }
  };

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((task) => task.id === active.id);
    const newIndex = tasks.findIndex((task) => task.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousTasks = tasks;
    const reorderedTasks = arrayMove(tasks, oldIndex, newIndex);
    setTasks(reorderedTasks);
    setError(null);

    try {
      const response = await reorderNotes(
        listId,
        reorderedTasks.map((task) => task.id),
        token,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updatedTasks = await response.json();
      setTasks(updatedTasks);
    } catch (err) {
      setTasks(previousTasks);
      setError(err.toString());
    }
  };

  const renderTaskRow = (task, handleProps = null) => {
    if (editingTaskId === task.id) {
      return (
        <InlineTextEditor
          value={editTask}
          onChange={setEditTask}
          onSubmit={onEdit}
          onCancel={closeEdit}
        />
      );
    }

    const complete = isTaskComplete(task);
    const taskRowSx = { ...rowSx, px: 1, py: 0.5, opacity: complete ? 0.72 : 1 };

    return (
      <Box
        data-testid={`${isReordering ? 'note-reorder-row' : 'note-row'}-${task.id}`}
        sx={taskRowSx}
      >
        <Checkbox
          checked={complete}
          onClick={(event) => event.stopPropagation()}
          onChange={isReordering ? undefined : (event) => onToggleStatus(event, task)}
          inputProps={{ 'aria-label': `Mark ${task.note} complete` }}
          sx={{
            color: 'var(--secondary-color)',
            p: 0.5,
            mr: 1,
            pointerEvents: isReordering ? 'none' : 'auto',
            '&.Mui-checked': { color: 'var(--secondary-color)' },
          }}
        />
        <Typography
          variant="body1"
          fontWeight="bold"
          sx={{
            flexGrow: 1,
            fontSize: '1.1rem',
            textAlign: 'left',
            textDecoration: complete ? 'line-through' : 'none',
          }}
        >
          {task.note}
        </Typography>
        {isReordering ? (
          <IconButton
            size="small"
            aria-label={`Drag ${task.note}`}
            data-testid={`note-drag-handle-${task.id}`}
            sx={{ color: 'var(--secondary-color)', cursor: 'grab' }}
            style={DRAG_HANDLE_TOUCH_STYLE}
            {...handleProps}
          >
            <DragIndicator />
          </IconButton>
        ) : (
          <IconButton
            size="small"
            aria-label={`Note actions for ${task.note}`}
            onClick={(event) => {
              event.stopPropagation();
              openActionMenu(event, task);
            }}
            sx={{ color: 'var(--secondary-color)' }}
          >
            <MoreVert />
          </IconButton>
        )}
      </Box>
    );
  };

  return (
    <>
      <NotepadPageShell
        title={isReordering ? 'Reorder Notes' : listName}
        loading={loading}
        error={error}
        pullDistance={pullDistance}
        refreshReady={refreshReady}
        isRefreshing={isRefreshing}
        pullContentOffset={pullContentOffset}
      >
        <SortableNotepadItems
          items={tasks}
          emptyMessage="No notes found."
          isReordering={isReordering}
          onDragEnd={onDragEnd}
          renderItem={renderTaskRow}
          testIdPrefix="note"
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
            placeholder="New Note..."
            value={newTask}
            onChange={setNewTask}
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
        onRemove={() => onDelete(selectedTask.id)}
        reorderDisabled={tasks.length < 2}
      />
    </>
  );
}
