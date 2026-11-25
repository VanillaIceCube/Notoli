function parseBoardPath(path) {
  if (typeof path !== 'string') return undefined;
  const [pathname] = path.split(/[?#]/, 1);
  const segments = pathname.replace(/\/$/, '').split('/');
  const [root, collection, boardId, child, listId] = segments;

  if (root !== '' || !['board', 'boards'].includes(collection) || !boardId) return undefined;
  if (segments.length === 3) return { boardId, parent: '/' };
  if (segments.length === 5 && child === 'list' && listId) {
    return { boardId, parent: `/${collection}/${boardId}` };
  }
}

export function getBoardId(path) {
  return parseBoardPath(path)?.boardId ?? null;
}

export function getParentPath(path) {
  return parseBoardPath(path)?.parent;
}

export const goBackToParent = (path, navigate) => {
  const target = getParentPath(path);
  if (target && typeof navigate === 'function') {
    navigate(target, { replace: true });
  }
};
