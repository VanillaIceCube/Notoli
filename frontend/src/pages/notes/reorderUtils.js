import { useEffect, useRef } from 'react';

export const reorderItems = (items, sourceId, targetId) => {
  const sourceIndex = items.findIndex((item) => String(item.id) === String(sourceId));
  const targetIndex = items.findIndex((item) => String(item.id) === String(targetId));

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return items;
  }

  const reordered = [...items];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  return reordered;
};

export const useReorderableList = ({ lists, setLists, persistOrder, setError }) => {
  const draggedIdRef = useRef(null);
  const originalListsRef = useRef(null);
  const latestListsRef = useRef(lists);

  useEffect(() => {
    latestListsRef.current = lists;
  }, [lists]);

  const resetDragState = () => {
    draggedIdRef.current = null;
    originalListsRef.current = null;
  };

  const getHandleProps = (itemId) => ({
    draggable: true,
    onDragStart: (event) => {
      event.stopPropagation();
      draggedIdRef.current = String(itemId);
      originalListsRef.current = latestListsRef.current;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(itemId));
    },
    onDragEnd: () => {
      resetDragState();
    },
  });

  const getRowProps = (itemId) => ({
    onDragOver: (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const sourceId = event.dataTransfer.getData('text/plain') || draggedIdRef.current;
      if (!sourceId) return;

      setLists((currentLists) => {
        const reordered = reorderItems(currentLists, sourceId, itemId);
        latestListsRef.current = reordered;
        return reordered;
      });
    },
    onDrop: async (event) => {
      event.preventDefault();
      const originalLists = originalListsRef.current;
      const reordered = latestListsRef.current;

      if (!originalLists || reordered === originalLists) {
        resetDragState();
        return;
      }

      setError(null);

      try {
        const response = await persistOrder(reordered.map((item) => item.id));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const saved = await response.json();
        latestListsRef.current = saved;
        setLists(saved);
      } catch (err) {
        latestListsRef.current = originalLists;
        setLists(originalLists);
        setError(`Reorder failed: ${err.toString()}`);
      } finally {
        resetDragState();
      }
    },
  });

  return { getHandleProps, getRowProps };
};
