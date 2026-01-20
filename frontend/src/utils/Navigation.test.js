import { getParentPath, getWorkspaceId, goBackToParent } from './Navigation';

describe('Navigation helpers', () => {
  test('when a todolist path is provided, getWorkspaceId returns the workspace id', () => {
    expect(getWorkspaceId('/workspace/7/todolist/2')).toBe('7');
  });

  test('when a workspace path is provided, getWorkspaceId returns the workspace id', () => {
    expect(getWorkspaceId('/workspace/9')).toBe('9');
  });

  test('when an unrelated path is provided, getWorkspaceId returns null', () => {
    expect(getWorkspaceId('/login')).toBeNull();
  });

  test('when a todolist path is provided, getParentPath returns the workspace path', () => {
    expect(getParentPath('/workspace/4/todolist/11')).toBe('/workspace/4');
  });

  test('when a workspace path is provided, getParentPath returns root', () => {
    expect(getParentPath('/workspace/4')).toBe('/');
  });

  test('when goBackToParent is called, it navigates with replace', () => {
    const navigate = jest.fn();

    goBackToParent('/workspace/4/todolist/11', navigate);

    expect(navigate).toHaveBeenCalledWith('/workspace/4', { replace: true });
  });
});
