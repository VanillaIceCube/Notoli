export const boardFixtures = [
  {
    id: 1,
    name: 'test_board_01',
    owner: 1,
    owner_details: { id: 1, username: 'owner', email: 'owner@example.com', display_name: 'owner' },
    collaborators_details: [
      { id: 2, username: 'collab', email: 'collab@example.com', display_name: 'collab' },
    ],
  },
  {
    id: 2,
    name: 'test_board_02',
    owner: 1,
    owner_details: { id: 1, username: 'owner', email: 'owner@example.com', display_name: 'owner' },
    collaborators_details: [],
  },
];

export const listFixtures = [
  { id: 10, name: 'test_list_01' },
  { id: 11, name: 'test_list_02' },
];

export const taskFixtures = [
  { id: 101, text: 'test_task_01', status: 'Not Started' },
  { id: 102, text: 'test_task_02', status: 'Complete' },
];
