const normalizePath = (path) => {
  if (typeof path !== 'string') return '';
  const clean = path.split('?')[0].split('#')[0];
  if (clean.length > 1 && clean.endsWith('/')) {
    return clean.slice(0, -1);
  }
  return clean;
};

export const getBoardId = (path) => {
  if (typeof path !== 'string') return null;
  const cleanPath = normalizePath(path);

  // /board/:boardId/list/:listId or /boards/:boardId/list/:listId
  const listMatch = cleanPath.match(/^\/boards?\/([^/]+)\/list\/[^/]+$/);
  if (listMatch) return listMatch[1]; // just boardId

  // /board/:boardId or /boards/:boardId
  const boardMatch = cleanPath.match(/^\/boards?\/([^/]+)$/);
  if (boardMatch) return boardMatch[1]; // just boardId

  return null;
};

export const getParentPath = (path) => {
  if (typeof path !== 'string') return undefined;
  const cleanPath = normalizePath(path);

  //  list <-- notes
  //  /board/:boardId/list/:listId or /boards/:boardId/list/:listId
  const listPath = cleanPath.match(/^(\/boards?\/[^/]+)\/list\/[^/]+$/);
  if (listPath) return `${listPath[1]}`;

  //  board <-- lists
  //  /board/:boardId or /boards/:boardId
  const boardPath = cleanPath.match(/^\/boards?\/[^/]+$/);
  if (boardPath) return '/';
};

export const goBackToParent = (path, navigate) => {
  const target = getParentPath(path);
  if (target && typeof navigate === 'function') {
    navigate(target, { replace: true }); // replace prevents stacking history
  }
};
