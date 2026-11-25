import { matchPath } from 'react-router';

export const boardRoute = { path: '/board/:boardId', caseSensitive: true };
export const listRoute = { path: '/board/:boardId/list/:listId', caseSensitive: true };

export function matchBoardPath(pathname) {
  return matchPath(listRoute, pathname) || matchPath(boardRoute, pathname);
}
