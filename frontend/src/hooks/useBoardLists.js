import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  createList,
  deleteList,
  fetchLists as fetchListsApi,
  fetchBoard as fetchBoardApi,
  reorderLists,
  updateList,
} from '../services/notoliApiClient';
import { rememberLastBoard } from '../services/lastBoard';
import { usePullToRefresh } from './useMobileGestures';

export function useBoardLists({ boardId, active = true, onPageReady = () => {}, setAppBarHeader }) {
  const token = sessionStorage.getItem('accessToken');
  const [boardName, setBoardName] = useState('');
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
    if (!active) return;
    setAppBarHeader('');
  }, [active, setAppBarHeader]);

  useEffect(() => {
    if (!active) return;
    document.title = boardName ? `Notoli - ${boardName}` : 'Notoli';
  }, [active, boardName]);

  useEffect(() => {
    if (!loading) {
      onPageReady();
    }
  }, [loading, onPageReady]);

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

    if (!boardId) return;

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

  return {
    boardName,
    lists,
    loading,
    error,
    isReordering,
    setIsReordering,
    actionMenuAnchorEl,
    actionMenuOpen,
    selectedList,
    isAdding,
    setIsAdding,
    newListName,
    setNewListName,
    editingListId,
    editListName,
    setEditListName,
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
    onDelete: () => selectedList && onDelete(selectedList.id),
    onDragEnd,
  };
}
