export const workspaceFixtures = [
  {
    id: 1,
    name: 'test_workspace_01',
    owner: 1,
    owner_details: { id: 1, username: 'owner', email: 'owner@example.com', display_name: 'owner' },
    collaborators_details: [
      { id: 2, username: 'collab', email: 'collab@example.com', display_name: 'collab' },
    ],
  },
  {
    id: 2,
    name: 'test_workspace_02',
    owner: 1,
    owner_details: { id: 1, username: 'owner', email: 'owner@example.com', display_name: 'owner' },
    collaborators_details: [],
  },
];

export const todoListFixtures = [
  { id: 10, name: 'test_todolist_01' },
  { id: 11, name: 'test_todolist_02' },
];

export const noteFixtures = [
  { id: 101, note: 'test_note_01', status: 'Not Started' },
  { id: 102, note: 'test_note_02', status: 'Completed' },
];
