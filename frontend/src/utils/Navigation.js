export const getBoardId = (path) => {
  // /board/:boardId/list/:listId
  const listMatch = path.match(/^\/board\/([^/]+)\/list\/[^/]+$/);
  if (listMatch) return listMatch[1]; // just boardId

  // /board/:boardId
  const boardMatch = path.match(/^\/board\/([^/]+)$/);
  if (boardMatch) return boardMatch[1]; // just boardId

  return null;
};

export const getParentPath = (path) => {
  //  list <-- notes
  //  /board/:boardId/list/:listId
  const listPath = path.match(/^(\/board\/[^/]+)\/list\/[^/]+$/);
  if (listPath) return `${listPath[1]}`;

  //  board <-- lists
  //  /board/:boardId
  const boardPath = path.match(/^\/board\/[^/]+$/);
  if (boardPath) return '/';
};

export const goBackToParent = (path, navigate) => {
  const target = getParentPath(path);
  navigate(target, { replace: true }); // replace prevents stacking history
};
