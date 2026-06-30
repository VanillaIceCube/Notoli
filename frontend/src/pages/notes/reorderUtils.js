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

export const makeDragHandlers = ({ itemId, lists, setLists, persistOrder, setError }) => ({
  draggable: true,
  onDragStart: (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(itemId));
  },
  onDragOver: (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  },
  onDrop: async (event) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain');
    const previousLists = lists;
    const reordered = reorderItems(lists, sourceId, itemId);

    if (reordered === lists) return;

    setLists(reordered);
    setError(null);

    try {
      const response = await persistOrder(reordered.map((item) => item.id));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const saved = await response.json();
      setLists(saved);
    } catch (err) {
      setLists(previousLists);
      setError(`Reorder failed: ${err.toString()}`);
    }
  },
});
