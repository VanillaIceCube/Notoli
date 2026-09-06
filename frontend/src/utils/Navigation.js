export const getBoardId = (path) => {
  if (typeof path !== 'string') return null;

  // /board/:boardId/list/:listId or /boards/:boardId/list/:listId
  const listMatch = path.match(/^\/boards?\/([^/]+)\/list\/[^/]+$/);
  if (listMatch) return listMatch[1]; // just boardId

  // /board/:boardId or /boards/:boardId
  const boardMatch = path.match(/^\/boards?\/([^/]+)$/);
  if (boardMatch) return boardMatch[1]; // just boardId

  return null;
};

export const getParentPath = (path) => {
  if (typeof path !== 'string') return undefined;

  //  list <-- notes
  //  /board/:boardId/list/:listId or /boards/:boardId/list/:listId
  const listPath = path.match(/^(\/boards?\/[^/]+)\/list\/[^/]+$/);
  if (listPath) return `${listPath[1]}`;

  //  board <-- lists
  //  /board/:boardId or /boards/:boardId
  const boardPath = path.match(/^\/boards?\/[^/]+$/);
  if (boardPath) return '/';
};

export const goBackToParent = (path, navigate) => {
  const target = getParentPath(path);
  navigate(target, { replace: true }); // replace prevents stacking history
};
