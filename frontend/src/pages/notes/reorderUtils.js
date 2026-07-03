import { useEffect, useRef } from 'react';

const ROW_ANIMATION_MS = 160;

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
  const rowElementsRef = useRef(new Map());
  const dropInProgressRef = useRef(false);

  useEffect(() => {
    latestListsRef.current = lists;
  }, [lists]);

  const resetDragState = () => {
    draggedIdRef.current = null;
    originalListsRef.current = null;
    dropInProgressRef.current = false;
  };

  const captureRowPositions = () => {
    const positions = new Map();
    rowElementsRef.current.forEach((element, itemId) => {
      positions.set(itemId, element.getBoundingClientRect().top);
    });
    return positions;
  };

  const animateRowsFrom = (previousPositions) => {
    requestAnimationFrame(() => {
      rowElementsRef.current.forEach((element, itemId) => {
        const previousTop = previousPositions.get(itemId);
        if (previousTop === undefined) return;

        const currentTop = element.getBoundingClientRect().top;
        const deltaY = previousTop - currentTop;
        if (!deltaY) return;

        element.style.transition = 'none';
        element.style.transform = `translateY(${deltaY}px)`;

        requestAnimationFrame(() => {
          element.style.transition = `transform ${ROW_ANIMATION_MS}ms ease`;
          element.style.transform = '';
        });
      });
    });
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
      if (dropInProgressRef.current) return;

      const originalLists = originalListsRef.current;
      if (originalLists && latestListsRef.current !== originalLists) {
        latestListsRef.current = originalLists;
        setLists(originalLists);
      }
      resetDragState();
    },
  });

  const getRowProps = (itemId) => ({
    ref: (element) => {
      const normalizedItemId = String(itemId);
      if (element) {
        rowElementsRef.current.set(normalizedItemId, element);
      } else {
        rowElementsRef.current.delete(normalizedItemId);
      }
    },
    onDragOver: (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const sourceId = event.dataTransfer.getData('text/plain') || draggedIdRef.current;
      if (!sourceId) return;

      const previousPositions = captureRowPositions();
      setLists((currentLists) => {
        const reordered = reorderItems(currentLists, sourceId, itemId);
        latestListsRef.current = reordered;
        return reordered;
      });
      animateRowsFrom(previousPositions);
    },
    onDrop: async (event) => {
      event.preventDefault();
      const originalLists = originalListsRef.current;
      const reordered = latestListsRef.current;

      if (!originalLists || reordered === originalLists) {
        resetDragState();
        return;
      }

      dropInProgressRef.current = true;
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
