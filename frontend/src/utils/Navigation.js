export const getWorkspaceId = (path) => {
  // /workspace/:wid/todolist/:tlid
  const todolistMatch = path.match(/^\/workspace\/([^/]+)\/todolist\/[^/]+$/);
  if (todolistMatch) return todolistMatch[1]; // just workspaceId

  // /workspace/:wid
  const workspaceMatch = path.match(/^\/workspace\/([^/]+)$/);
  if (workspaceMatch) return workspaceMatch[1]; // just workspaceId

  return null;
};

export const getParentPath = (path) => {
  //  todolist <-- notes
  //  /workspace/:wid/todolist/:tlid*
  const todolistPath = path.match(/^(\/workspace\/[^/]+)\/todolist\/[^/]+$/);
  if (todolistPath) return `${todolistPath[1]}`;

  //  workspace <-- todolists
  //  /workspace/:wid
  const workspacePath = path.match(/^\/workspace\/[^/]+$/);
  if (workspacePath) return "/";
};

export const goBackToParent = (path, navigate) => {
  const target = getParentPath(path);
  navigate(target, { replace: true }); // replace prevents stacking history
};
