import { getBoardId, getParentPath, goBackToParent } from './Navigation';

describe('Navigation', () => {
  describe('getBoardId', () => {
    test('when the path is a board route, it returns the board id', () => {
      expect(getBoardId('/board/123')).toBe('123');
    });

    test('when the path is a list route, it returns the board id', () => {
      expect(getBoardId('/board/123/list/456')).toBe('123');
    });

    test('when the path does not match, it returns null', () => {
      expect(getBoardId('/nope')).toBeNull();
    });
  });

  describe('getParentPath', () => {
    test('when the path is a list route, it returns the board path', () => {
      expect(getParentPath('/board/123/list/456')).toBe('/board/123');
    });

    test('when the path is a board route, it returns the root path', () => {
      expect(getParentPath('/board/123')).toBe('/');
    });

    test('when the path does not match, it returns undefined', () => {
      expect(getParentPath('/nope')).toBeUndefined();
    });
  });

  describe('goBackToParent', () => {
    test('when called, it navigates to the parent path with replace', () => {
      const navigate = jest.fn();

      goBackToParent('/board/123/list/456', navigate);

      expect(navigate).toHaveBeenCalledWith('/board/123', { replace: true });
    });
  });
});
