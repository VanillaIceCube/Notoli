import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import MyAppBar from './MyAppBar';
import { renderWithProviders } from '../test-utils';
import { goBackToParent } from '../utils/Navigation';

const mockNavigate = jest.fn();
const mockUseLocation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => mockUseLocation(),
  useNavigate: () => mockNavigate,
}));

jest.mock('../utils/Navigation', () => ({
  goBackToParent: jest.fn(),
}));

describe('MyAppBar', () => {
  const setDrawerOpen = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocation.mockReturnValue({ pathname: '/' });
  });

  test('when the route is /login, it does not render the app bar', () => {
    mockUseLocation.mockReturnValue({ pathname: '/login' });

    renderWithProviders(<MyAppBar appBarHeader="Header" setDrawerOpen={setDrawerOpen} />);

    expect(screen.queryByText('Header')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('menu')).not.toBeInTheDocument();
  });

  test('when the route is /register, it does not render the app bar', () => {
    mockUseLocation.mockReturnValue({ pathname: '/register' });

    renderWithProviders(<MyAppBar appBarHeader="Header" setDrawerOpen={setDrawerOpen} />);

    expect(screen.queryByText('Header')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('menu')).not.toBeInTheDocument();
  });

  test('when the path includes /todolist, it shows the back button', () => {
    mockUseLocation.mockReturnValue({ pathname: '/workspaces/1/todolist/2' });

    renderWithProviders(<MyAppBar appBarHeader="Workspace" setDrawerOpen={setDrawerOpen} />);

    expect(screen.getByLabelText('back button')).toBeInTheDocument();
  });

  test('when the path does not include /todolist, it does not show the back button', () => {
    mockUseLocation.mockReturnValue({ pathname: '/workspaces/1' });

    renderWithProviders(<MyAppBar appBarHeader="Workspace" setDrawerOpen={setDrawerOpen} />);

    expect(screen.queryByLabelText('back button')).not.toBeInTheDocument();
  });

  test('when the back button is clicked, it calls goBackToParent', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/workspaces/1/todolist/2' });

    renderWithProviders(<MyAppBar appBarHeader="Workspace" setDrawerOpen={setDrawerOpen} />);

    await userEvent.click(screen.getByLabelText('back button'));

    expect(goBackToParent).toHaveBeenCalledWith('/workspaces/1/todolist/2', mockNavigate);
  });

  test('when the menu icon is clicked, it toggles setDrawerOpen', async () => {
    renderWithProviders(<MyAppBar appBarHeader="Workspace" setDrawerOpen={setDrawerOpen} />);

    await userEvent.click(screen.getByLabelText('menu'));

    expect(setDrawerOpen).toHaveBeenCalled();
    const [updater] = setDrawerOpen.mock.calls[0];
    expect(typeof updater).toBe('function');
  });
});
