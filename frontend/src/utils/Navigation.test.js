import { getWorkspaceId, getParentPath, goBackToParent } from './Navigation';

describe('Navigation', () => {
  describe('getWorkspaceId', () => {
    test('when the path is a workspace route, it returns the workspace id', () => {
      expect(getWorkspaceId('/workspace/123')).toBe('123');
    });

    test('when the path is a todolist route, it returns the workspace id', () => {
      expect(getWorkspaceId('/workspace/123/todolist/456')).toBe('123');
    });

    test('when the path does not match, it returns null', () => {
      expect(getWorkspaceId('/nope')).toBeNull();
    });
  });

  describe('getParentPath', () => {
    test('when the path is a todolist route, it returns the workspace path', () => {
      expect(getParentPath('/workspace/123/todolist/456')).toBe('/workspace/123');
    });

    test('when the path is a workspace route, it returns the root path', () => {
      expect(getParentPath('/workspace/123')).toBe('/');
    });

    test('when the path does not match, it returns undefined', () => {
      expect(getParentPath('/nope')).toBeUndefined();
    });
  });

  describe('goBackToParent', () => {
    test('when called, it navigates to the parent path with replace', () => {
      const navigate = jest.fn();

      goBackToParent('/workspace/123/todolist/456', navigate);

      expect(navigate).toHaveBeenCalledWith('/workspace/123', { replace: true });
    });
  });
});
