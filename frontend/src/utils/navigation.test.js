// @vitest-environment node

import { matchBoardPath } from './navigation';

test('matches only the canonical board and list paths', () => {
  expect(matchBoardPath('/board/12')?.params).toEqual({ boardId: '12' });
  expect(matchBoardPath('/board/12/list/3/')?.params).toEqual({ boardId: '12', listId: '3' });
  for (const path of ['/boards/12', '/boards/12/list/3', '/Board/12', '/board/12/extra', '/']) {
    expect(matchBoardPath(path)).toBeNull();
  }
});
