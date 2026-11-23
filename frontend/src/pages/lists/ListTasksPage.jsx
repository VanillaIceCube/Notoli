import useSession, { useSessionGuard } from '../../hooks/useSession';
// ListTasksPage loads one list's tasks and adds task-specific completion behavior to notepad UI.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { Box, Button, Checkbox, IconButton, Typography } from '@mui/material';
import Add from '@mui/icons-material/Add';
import DragIndicator from '@mui/icons-material/DragIndicator';
import MoreVert from '@mui/icons-material/MoreVert';
import { useLocation, useParams } from 'react-router';
import InlineTextEditor from '../../components/notepadPages/InlineTextEditor';
import NotepadPageShell from '../../components/notepadPages/NotepadPageShell';
import NotepadRowActionMenu from '../../components/notepadPages/NotepadRowActionMenu';
import SortableNotepadItems, {
  NOTEPAD_ITEM_ROW_MIN_HEIGHT,
  DRAG_HANDLE_TOUCH_STYLE,
} from '../../components/notepadPages/SortableNotepadItems';
import {
  createTask,
  deleteTask,
  fetchTasks,
  fetchList as fetchListApi,
  fetchBoard as fetchBoardApi,
  reorderTasks,
  updateTask,
} from '../../services/notoliApiClient';
import { rememberLastBoard } from '../../services/lastBoard';
import { usePullToRefresh } from '../../hooks/useMobileGestures';

const TASK_STATUS_NOT_STARTED = 'Not Started';
const TASK_STATUS_COMPLETE = 'Complete';
const isTaskComplete = (task) => task.status === TASK_STATUS_COMPLETE;
const formatDocumentTitle = (boardName, listName) =>
  boardName && listName ? `Notoli - ${boardName} - ${listName}` : 'Notoli';

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

export default function ListTasksPage({ active = true, onPageReady = () => {}, setAppBarHeader }) {
  const { boardId, listId } = useParams();
  const location = useLocation();
  const { accessToken: token } = useSession();
  const isCurrentSession = useSessionGuard();
  const [boardName, setBoardName] = useState('');
  const [listName, setListName] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReordering, setIsReordering] = useState(false);
  const [actionMenuAnchorEl, setActionMenuAnchorEl] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editedTaskText, setEditedTaskText] = useState('');
  const actionMenuOpen = Boolean(actionMenuAnchorEl);

  // Preserve the AppBar's existing board-only behavior; its title is unrelated to the browser tab.
  useLayoutEffect(() => {
    if (!active) return;
    setAppBarHeader(location.state?.boardName || boardName || '');
  }, [active, boardId, boardName, location.state?.boardName, setAppBarHeader]);

  useEffect(() => {
    if (!active) return;
    document.title = formatDocumentTitle(
      location.state?.boardName || boardName,
      location.state?.listName || listName,
    );
  }, [active, boardName, listName, location.state?.boardName, location.state?.listName]);

  useEffect(() => {
    if (!loading) {
      onPageReady();
    }
  }, [loading, onPageReady]);

  const loadTasks = useCallback(async () => {
    if (!token || !isCurrentSession()) return;
    setLoading(true);
    try {
      const loadedTasks = await fetchTasks(listId);
      setTasks(loadedTasks);
      setError(null);
    } catch (err) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [token, listId, isCurrentSession]);

  const fetchListName = useCallback(async () => {
    if (!token || !isCurrentSession()) return;
    setListName('');

    if (!listId) return;
    try {
      const listData = await fetchListApi(listId);
      setListName(listData?.name ?? '');
    } catch (err) {
      setListName('');
      setError(err.toString());
    }
  }, [listId, token, isCurrentSession]);

  useEffect(() => {
    if (!listId) return;
    let cancelled = false;

    async function loadBoardName() {
      if (!boardId || !token || !isCurrentSession()) return;
      try {
        const boardData = await fetchBoardApi(boardId);
        if (!cancelled) setBoardName(boardData?.name ?? '');
      } catch (err) {
        if (cancelled) return;
        setBoardName('');
        setError(err.toString());
      }
    }

    rememberLastBoard(boardId);
    loadTasks();
    fetchListName();
    loadBoardName();
    return () => {
      cancelled = true;
    };
  }, [boardId, listId, token, loadTasks, fetchListName, isCurrentSession]);

  const closeActionMenu = () => {
    setActionMenuAnchorEl(null);
    setSelectedTask(null);
  };

  const closeEdit = () => {
    setEditingTaskId(null);
    setEditedTaskText('');
  };

  const enterReorderMode = () => {
    closeEdit();
    setIsAdding(false);
    closeActionMenu();
    setIsReordering(true);
  };

  const openActionMenu = (event, task) => {
    setActionMenuAnchorEl(event.currentTarget);
    setSelectedTask(task);
  };

  const addTask = async () => {
    if (!token || !isCurrentSession()) return;
    if (!newTaskText.trim()) return;
    setError(null);

    try {
      const created = await createTask(listId, newTaskText);
      setTasks((prev) => [...prev, created]);
      setIsAdding(false);
      setNewTaskText('');
    } catch (err) {
      setError(err.toString());
    }
  };

  const startEditingTask = () => {
    setEditingTaskId(selectedTask.id);
    setEditedTaskText(selectedTask.text);
    closeActionMenu();
  };

  const saveTaskEdit = async () => {
    if (!token || !isCurrentSession()) return;
    if (!editedTaskText.trim()) return;
    setError(null);

    try {
      const updated = await updateTask(editingTaskId, { text: editedTaskText });
      setTasks((prev) =>
        prev.map((task) => (task.id === updated.id ? { ...task, ...updated } : task)),
      );
      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  const toggleTaskCompletion = async (event, taskToToggle) => {
    if (!token || !isCurrentSession()) return;
    event.stopPropagation();
    const status = event.target.checked ? TASK_STATUS_COMPLETE : TASK_STATUS_NOT_STARTED;
    setError(null);
    setTasks((prev) =>
      prev.map((task) => (task.id === taskToToggle.id ? { ...task, status } : task)),
    );

    try {
      const updated = await updateTask(taskToToggle.id, { status });
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
    active,
    onRefresh: loadTasks,
  });

  const removeTask = async (id) => {
    if (!token || !isCurrentSession()) return;
    setError(null);

    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
    } catch (err) {
      setError(err.toString());
    } finally {
      closeActionMenu();
    }
  };

  const reorderTasksAfterDrag = async ({ active, over }) => {
    if (!token || !isCurrentSession()) return;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((task) => task.id === active.id);
    const newIndex = tasks.findIndex((task) => task.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousTasks = tasks;
    const reorderedTasks = arrayMove(tasks, oldIndex, newIndex);
    setTasks(reorderedTasks);
    setError(null);

    try {
      const updatedTasks = await reorderTasks(
        listId,
        reorderedTasks.map((task) => task.id),
      );
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
          value={editedTaskText}
          onChange={setEditedTaskText}
          onSubmit={saveTaskEdit}
          onCancel={closeEdit}
        />
      );
    }

    const complete = isTaskComplete(task);
    const taskRowSx = { ...rowSx, px: 1, py: 0.5, opacity: complete ? 0.72 : 1 };

    return (
      <Box
        data-testid={`${isReordering ? 'task-reorder-row' : 'task-row'}-${task.id}`}
        sx={taskRowSx}
      >
        <Checkbox
          checked={complete}
          onClick={(event) => event.stopPropagation()}
          onChange={isReordering ? undefined : (event) => toggleTaskCompletion(event, task)}
          sx={{
            color: 'var(--secondary-color)',
            p: 0.5,
            mr: 1,
            pointerEvents: isReordering ? 'none' : 'auto',
            '&.Mui-checked': { color: 'var(--secondary-color)' },
          }}
          slotProps={{
            input: { 'aria-label': `Mark ${task.text} complete` },
          }}
        />
        <Typography
          variant="body1"
          sx={{
            fontWeight: 'bold',
            flexGrow: 1,
            fontSize: '1.1rem',
            textAlign: 'left',
            textDecoration: complete ? 'line-through' : 'none',
          }}
        >
          {task.text}
        </Typography>
        {isReordering ? (
          <IconButton
            size="small"
            aria-label={`Drag ${task.text}`}
            data-testid={`task-drag-handle-${task.id}`}
            sx={{ color: 'var(--secondary-color)', cursor: 'grab' }}
            style={DRAG_HANDLE_TOUCH_STYLE}
            {...handleProps}
          >
            <DragIndicator />
          </IconButton>
        ) : (
          <IconButton
            size="small"
            aria-label={`Task actions for ${task.text}`}
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
        title={isReordering ? 'Reorder Tasks' : listName}
        loading={loading}
        error={error}
        hasContent={tasks.length > 0}
        pullDistance={pullDistance}
        refreshReady={refreshReady}
        isRefreshing={isRefreshing}
      >
        <SortableNotepadItems
          items={tasks}
          emptyMessage="No tasks found."
          isReordering={isReordering}
          onDragEnd={reorderTasksAfterDrag}
          renderItem={renderTaskRow}
          testIdPrefix="task"
        />
        {isReordering ? (
          <Button variant="text" sx={pageActionButtonSx} onClick={() => setIsReordering(false)}>
            <Typography
              variant="body1"
              align="center"
              sx={{
                fontWeight: 'bold',
                fontSize: '1.1rem',
              }}
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
              sx={{
                fontWeight: 'bold',
                fontSize: '1.1rem',
              }}
            >
              Add New
            </Typography>
          </Button>
        ) : (
          <InlineTextEditor
            placeholder="New Task…"
            value={newTaskText}
            onChange={setNewTaskText}
            onSubmit={addTask}
            onCancel={() => setIsAdding(false)}
          />
        )}
      </NotepadPageShell>

      <NotepadRowActionMenu
        anchorEl={actionMenuAnchorEl}
        open={actionMenuOpen}
        onClose={closeActionMenu}
        onRename={startEditingTask}
        onReorder={enterReorderMode}
        onRemove={() => removeTask(selectedTask.id)}
        reorderDisabled={tasks.length < 2}
      />
    </>
  );
}
