vi.mock('@mui/material', async () => await vi.importActual('@mui/material'));
import { Route, Routes } from 'react-router';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppHeader from './AppHeader';
import { renderWithProviders } from '../../test-helpers/utils';
import { goBackToParent } from '../../utils/navigation';
import { setNavigate } from '../../services/navigation/navigationService';
import { fetchNotifications } from '../../services/notifications/notificationApiClient';
const { mockNavigate, mockUseLocation, mockNavigateHook } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseLocation: vi.fn(),
  mockNavigateHook: vi.fn(),
}));
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useLocation: mockUseLocation,
  useNavigate: mockNavigateHook,
}));
vi.mock('../../utils/navigation', () => ({
  goBackToParent: vi.fn(),
}));
vi.mock('../../services/notifications/notificationApiClient', () => ({
  fetchNotifications: vi.fn(),
}));
describe('AppHeader', () => {
  test('supports profile menu keyboard navigation, dismissal, and logout', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppHeader appBarHeader="Notoli" setDrawerOpen={setDrawerOpen} />);

    await user.click(screen.getByLabelText('user profile'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText('user profile'));
    await user.keyboard('{End}{Enter}');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  test.each(['0', '1'])('shows Connected Apps only for enabled MCP (%s)', async (enabled) => {
    vi.stubEnv('VITE_MCP_ENABLED', enabled);
    renderWithProviders(<AppHeader appBarHeader="Notoli" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    if (enabled === '1') {
      const connectionLink = screen.getByRole('menuitem', { name: 'Connected Apps' });
      expect(connectionLink).toHaveAttribute('href', '/connections');
      await userEvent.click(connectionLink);
      expect(mockNavigate).not.toHaveBeenCalled();
    } else {
      expect(screen.queryByRole('menuitem', { name: 'Connected Apps' })).not.toBeInTheDocument();
    }
  });
  const setDrawerOpen = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockNavigateHook.mockReturnValue(mockNavigate);
    setNavigate(mockNavigate);
    mockUseLocation.mockReturnValue({
      pathname: '/',
    });
    fetchNotifications.mockResolvedValue(Response.json([]));
  });
  test.each(['/login', '/register', '/forgot-password', '/reset-password'])(
    'does not render the header or fetch notifications on %s',
    (pathname) => {
      sessionStorage.setItem('accessToken', 'access');
      mockUseLocation.mockReturnValue({ pathname });
      renderWithProviders(<AppHeader appBarHeader="Header" setDrawerOpen={setDrawerOpen} />);

      expect(screen.queryByLabelText('menu')).not.toBeInTheDocument();
      expect(fetchNotifications).not.toHaveBeenCalled();
    },
  );
  test('when the path includes /list, it shows the back button', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/boards/1/list/2',
    });
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    expect(screen.getByLabelText('back button')).toBeInTheDocument();
  });
  test('when the path does not include /list, it does not show the back button', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/boards/1',
    });
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    expect(screen.queryByLabelText('back button')).not.toBeInTheDocument();
  });
  test('when the back button is clicked, it calls goBackToParent', async () => {
    mockUseLocation.mockReturnValue({
      pathname: '/boards/1/list/2',
    });
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('back button'));
    expect(goBackToParent).toHaveBeenCalledWith('/boards/1/list/2', mockNavigate);
  });
  test('when the menu icon is clicked, it toggles setDrawerOpen', async () => {
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('menu'));
    expect(setDrawerOpen).toHaveBeenCalled();
    const [updater] = setDrawerOpen.mock.calls[0];
    expect(typeof updater).toBe('function');
  });
  test('when the user profile icon is clicked, it opens the profile menu', async () => {
    sessionStorage.setItem('username', 'judea');
    sessionStorage.setItem('email', 'judea@example.com');
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
    expect(screen.getByText('judea')).toBeInTheDocument();
    expect(screen.getByText('judea@example.com')).toBeInTheDocument();
  });
  test('when no profile info exists, it falls back to username + username@gmail.com', async () => {
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    expect(screen.getByText('username')).toBeInTheDocument();
    expect(screen.getByText('username@gmail.com')).toBeInTheDocument();
  });
  test('when sessionStorage reads throw, it still renders fallback profile values', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    expect(screen.getByText('username')).toBeInTheDocument();
    expect(screen.getByText('username@gmail.com')).toBeInTheDocument();
    getItem.mockRestore();
  });
  test('when Logout is clicked, it clears tokens and redirects to /login', async () => {
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    sessionStorage.setItem('username', 'judea');
    sessionStorage.setItem('email', 'judea@example.com');
    window.history.replaceState({}, '', '/');
    renderWithProviders(<AppHeader appBarHeader="Board" setDrawerOpen={setDrawerOpen} />);
    await userEvent.click(screen.getByLabelText('user profile'));
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: /logout/i,
      }),
    );
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(sessionStorage.getItem('username')).toBeNull();
    expect(sessionStorage.getItem('email')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('pendingSnackbar'))).toEqual({
      severity: 'success',
      message: 'Logout Successful :)',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      replace: true,
    });
  });
});

describe('AppHeader navigation', () => {
  beforeEach(async () => {
    const actual = await vi.importActual('react-router');
    mockUseLocation.mockImplementation(actual.useLocation);
    mockNavigateHook.mockImplementation(actual.useNavigate);
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('accessToken', 'access');
    fetchNotifications.mockResolvedValue(Response.json([]));
  });
  test.each(['click', 'keyboard'])(
    'Connected Apps supports %s navigation through its real link',
    async (activation) => {
      vi.stubEnv('VITE_MCP_ENABLED', '1');
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route
            path="/"
            element={<AppHeader appBarHeader="Application" setDrawerOpen={vi.fn()} />}
          />
          <Route path="/connections" element={<h1>Connected Apps destination</h1>} />
        </Routes>,
      );
      await user.click(screen.getByLabelText('user profile'));
      const link = screen.getByRole('menuitem', { name: 'Connected Apps' });
      expect(link).toHaveAttribute('href', '/connections');
      if (activation === 'keyboard') {
        await screen.findByRole('menu');
        await user.keyboard('{ArrowDown}');
        expect(link).toHaveFocus();
        await user.keyboard('{Enter}');
      } else await user.click(link);
      expect(
        await screen.findByRole('heading', { name: 'Connected Apps destination' }),
      ).toBeVisible();
    },
  );
  afterEach(() => vi.unstubAllEnvs());
});
