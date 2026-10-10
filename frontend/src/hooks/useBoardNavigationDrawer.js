import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getBoardId } from '../utils/Navigation';
import {
  createBoard,
  deleteBoard,
  fetchBoard as fetchBoardApi,
  fetchBoards as fetchBoardsApi,
  updateBoard,
} from '../services/notoliApiClient';

export function useBoardNavigationDrawer({ setDrawerBoardsLabel }) {
  const location = useLocation();
  const boardId = getBoardId(location.pathname);

  const token = sessionStorage.getItem('accessToken');
  const currentUsername = sessionStorage.getItem('username');
  const currentEmail = sessionStorage.getItem('email');

  // Fetch Board Name for active route
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

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json();
      setBoards((prev) => [...prev, created]);

      setIsAdding(false);
      setNewBoardName('');
    } catch (err) {
      setError(err.toString());
    }
  };

  // Triple Dot Menu State & Actions
  const [tripleDotAnchorElement, setTripleDotAnchorElement] = useState(null);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const tripleDotOpen = Boolean(tripleDotAnchorElement);
  const selectedBoardOwner = selectedBoard?.owner_details;
  const selectedBoardIsOwner =
    selectedBoardOwner &&
    ((currentUsername && selectedBoardOwner.username === currentUsername) ||
      (currentEmail && selectedBoardOwner.email === currentEmail));

  const handleTripleDotClick = (event, board) => {
    event.stopPropagation();
    setTripleDotAnchorElement(event.currentTarget);
    setSelectedBoard(board);
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

  const closeEdit = () => {
    setIsEditing(false);
    setEditingBoardId(null);
    setEditBoardName('');
  };

  const onEdit = async () => {
    if (!editBoardName.trim()) return;
    setError(null);

    try {
      const response = await updateBoard(editingBoardId, { name: editBoardName }, token);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setBoards((prev) => prev.map((board) => (board.id === updated.id ? updated : board)));

      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  // Share Board State & Actions
  const [sharingBoard, setSharingBoard] = useState(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const openShareDialog = (board) => {
    setSharingBoard(board);
    setShareDialogOpen(true);
    handleTripleDotClose();
  };

  const updateSharedBoard = (updatedBoard) => {
    setBoards((prev) => prev.map((board) => (board.id === updatedBoard.id ? updatedBoard : board)));
    setSharingBoard(updatedBoard);
  };

  const closeShareDialog = () => {
    setShareDialogOpen(false);
  };

  // Delete Board Action
  const onDelete = async (id) => {
    setError(null);

    try {
      const response = await deleteBoard(id, token);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setBoards((prev) => prev.filter((board) => board.id !== id));
    } catch (err) {
      setError(err.toString());
    } finally {
      handleTripleDotClose();
    }
  };

  // Drawer Open & Width State
  const [boardDrawerOpen, setBoardDrawerOpen] = useState(false);
  const toggleBoardDrawer = () => setBoardDrawerOpen((prev) => !prev);
  const [drawerWidth, setDrawerWidth] = useState(180);

  useEffect(() => {
    setDrawerWidth(isAdding || isEditing ? 300 : 200);
  }, [isAdding, isEditing]);

  return {
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
    isEditing,
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
  };
}
