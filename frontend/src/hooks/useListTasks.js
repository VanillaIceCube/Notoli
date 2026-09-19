import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  createNote,
  deleteNote,
  fetchNotes as fetchNotesApi,
  fetchList as fetchListApi,
  fetchBoard as fetchBoardApi,
  reorderNotes,
  updateNote,
} from '../services/notoliApiClient';
import { rememberLastBoard } from '../services/lastBoard';
import { usePullToRefresh } from './useMobileGestures';

const NOTE_STATUS_NOT_STARTED = 'Not Started';
const NOTE_STATUS_COMPLETE = 'Complete';
export const isTaskComplete = (task) => task.status === NOTE_STATUS_COMPLETE;
const formatDocumentTitle = (boardName, listName) =>
  boardName && listName ? `Notoli - ${boardName} - ${listName}` : 'Notoli';

export function useListTasks({
  boardId,
  listId,
  locationStateBoardName,
  locationStateListName,
  active = true,
  onPageReady = () => {},
  setAppBarHeader,
}) {
  const token = sessionStorage.getItem('accessToken');
  const [boardName, setBoardName] = useState('');
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

  // Preserve the AppBar's existing board-only behavior; its title is unrelated to the browser tab.
  useLayoutEffect(() => {
    if (!active) return;
    setAppBarHeader(locationStateBoardName || boardName || '');
  }, [active, boardId, boardName, locationStateBoardName, setAppBarHeader]);

  useEffect(() => {
    if (!active) return;
    document.title = formatDocumentTitle(
      locationStateBoardName || boardName,
      locationStateListName || listName,
    );
  }, [active, boardName, listName, locationStateBoardName, locationStateListName]);

  useEffect(() => {
    if (!loading) {
      onPageReady();
    }
  }, [loading, onPageReady]);

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

  const fetchBoardName = useCallback(
    async (isActive = () => true) => {
      if (!boardId) return;

      try {
        const response = await fetchBoardApi(boardId, token);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const boardData = await response.json();
        if (isActive()) {
          setBoardName(boardData?.name ?? '');
          if (active) {
            setAppBarHeader(boardData?.name ?? '');
          }
        }
      } catch (err) {
        if (isActive()) {
          setBoardName('');
          if (active) {
            setAppBarHeader('');
          }
        }
        setError(err.toString());
      }
    },
    [active, boardId, token, setAppBarHeader],
  );

  useEffect(() => {
    let activeEffect = true;
    if (listId) {
      rememberLastBoard(boardId);
      fetchTasks();
      fetchListName();
      fetchBoardName(() => activeEffect);
    }
    return () => {
      activeEffect = false;
    };
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

  return {
    boardName,
    listName,
    tasks,
    loading,
    error,
    isReordering,
    setIsReordering,
    actionMenuAnchorEl,
    actionMenuOpen,
    selectedTask,
    isAdding,
    setIsAdding,
    newTask,
    setNewTask,
    editingTaskId,
    editTask,
    setEditTask,
    isRefreshing,
    pullDistance,
    refreshReady,
    pullContentOffset,
    openActionMenu,
    closeActionMenu,
    startEditing,
    closeEdit,
    startReordering,
    onAdd,
    onEdit,
    onToggleStatus,
    onDelete: () => selectedTask && onDelete(selectedTask.id),
    onDragEnd,
  };
}
