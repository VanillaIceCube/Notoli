import { getBoardId, getParentPath, goBackToParent } from './Navigation';

describe('Navigation', () => {
  describe('getBoardId', () => {
    test('when the path is a board route, it returns the board id', () => {
      expect(getBoardId('/board/123')).toBe('123');
      expect(getBoardId('/boards/123')).toBe('123');
      expect(getBoardId('/board/123/')).toBe('123');
      expect(getBoardId('/board/123?tab=all#top')).toBe('123');
    });

    test('when the path is a list route, it returns the board id', () => {
      expect(getBoardId('/board/123/list/456')).toBe('123');
      expect(getBoardId('/boards/123/list/456')).toBe('123');
      expect(getBoardId('/boards/123/list/456/')).toBe('123');
      expect(getBoardId('/board/123/list/456?view=grid')).toBe('123');
    });

    test('when the path does not match, it returns null', () => {
      expect(getBoardId('/nope')).toBeNull();
      expect(getBoardId(null)).toBeNull();
      expect(getBoardId(undefined)).toBeNull();
    });
  });

  describe('getParentPath', () => {
    test('when the path is a list route, it returns the board path', () => {
      expect(getParentPath('/board/123/list/456')).toBe('/board/123');
      expect(getParentPath('/boards/123/list/456')).toBe('/boards/123');
      expect(getParentPath('/board/123/list/456/')).toBe('/board/123');
      expect(getParentPath('/board/123/list/456?filter=active')).toBe('/board/123');
    });

    test('when the path is a board route, it returns the root path', () => {
      expect(getParentPath('/board/123')).toBe('/');
      expect(getParentPath('/boards/123')).toBe('/');
      expect(getParentPath('/board/123/')).toBe('/');
      expect(getParentPath('/boards/123?sort=asc')).toBe('/');
    });

    test('when the path does not match, it returns undefined', () => {
      expect(getParentPath('/nope')).toBeUndefined();
      expect(getParentPath(null)).toBeUndefined();
      expect(getParentPath(undefined)).toBeUndefined();
    });
  });

  describe('goBackToParent', () => {
    test('when called with valid path and navigate fn, it navigates to the parent path with replace', () => {
      const navigate = jest.fn();

      goBackToParent('/board/123/list/456', navigate);

      expect(navigate).toHaveBeenCalledWith('/board/123', { replace: true });
    });

    test('when target path is undefined or navigate is invalid, it does not throw', () => {
      const navigate = jest.fn();

      expect(() => goBackToParent('/unmatched-route', navigate)).not.toThrow();
      expect(navigate).not.toHaveBeenCalled();

      expect(() => goBackToParent('/board/123/list/456', null)).not.toThrow();
    });
  });
});
