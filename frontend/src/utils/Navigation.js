export const getParentPath = (path) => {
  //  todolist <-- notes
  //  /workspace/:wid/todolist/:tlid*
  const todolistPath = path.match(/^(\/workspace\/[^/]+)\/todolist\/[^/]+$/);
  if (todolistPath) return `${todolistPath[1]}`;

  //  workspace <-- todolists
  //  /workspace/:wid
  const workspacePath = path.match(/^\/workspace\/[^/]+$/);
  if (workspacePath) return '/';
};

export const goBackToParent = (path, navigate) => {
  const target = getParentPath(path);
  navigate(target, { replace: true }); // replace prevents stacking history
};
