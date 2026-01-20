import { renderWithProviders, setupUserEvent } from '../test-utils';
import { screen } from '@testing-library/react';
import MyAppBar from './MyAppBar';
import { useNavigate } from 'react-router-dom';
import { goBackToParent } from '../utils/Navigation';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../utils/Navigation', () => ({
  ...jest.requireActual('../utils/Navigation'),
  goBackToParent: jest.fn(),
}));

describe('MyAppBar', () => {
  const mockNavigate = jest.fn();
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
    user = setupUserEvent();
  });

  test('when on /login, it does not render', () => {
    renderWithProviders(<MyAppBar appBarHeader="" setDrawerOpen={jest.fn()} />, {
      routeEntries: ['/login'],
    });

    expect(screen.queryByLabelText(/menu/i)).not.toBeInTheDocument();
  });

  test('when on a todolist route, it shows the back button and calls navigation helper', async () => {
    renderWithProviders(<MyAppBar appBarHeader="Todo" setDrawerOpen={jest.fn()} />, {
      routeEntries: ['/workspace/1/todolist/2'],
    });

    await user.click(screen.getByLabelText('back button'));

    expect(goBackToParent).toHaveBeenCalledWith('/workspace/1/todolist/2', mockNavigate);
  });

  test('when menu is clicked, it toggles the drawer state', async () => {
    const setDrawerOpen = jest.fn();

    renderWithProviders(<MyAppBar appBarHeader="Header" setDrawerOpen={setDrawerOpen} />, {
      routeEntries: ['/'],
    });

    await user.click(screen.getByLabelText(/menu/i));

    expect(setDrawerOpen).toHaveBeenCalledWith(expect.any(Function));
  });

  test('when rendered, it shows the header text', () => {
    renderWithProviders(<MyAppBar appBarHeader="My Header" setDrawerOpen={jest.fn()} />, {
      routeEntries: ['/'],
    });

    expect(screen.getByText('My Header')).toBeInTheDocument();
  });
});
