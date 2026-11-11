import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test-support/utils';
import Login from './Login';
import Register from './Register';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import * as api from '../../services/notoliApiClient';

vi.mock('../../services/notoliApiClient', () => ({
  login: vi.fn(),
  fetchBoards: vi.fn(),
  register: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

const journeys = [
  { Component: Login, from: '/login', name: 'Forgot Password?', to: '/forgot-password', tabs: 4 },
  { Component: Login, from: '/login', name: 'Create Account!', to: '/register', tabs: 5 },
  { Component: Register, from: '/register', name: 'Sign in now!', to: '/login', tabs: 6 },
  {
    Component: ForgotPassword,
    from: '/forgot-password',
    name: 'Back to Login',
    to: '/login',
    tabs: 3,
  },
  {
    Component: ResetPassword,
    from: '/reset-password?uid=test&token=test',
    name: 'Login',
    to: '/login',
    tabs: 4,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe.each(journeys)('$from → $to ($name)', ({ Component, from, name, to, tabs }) => {
  test.each(['click', 'keyboard'])(
    '%s follows a semantic link without submitting',
    async (activation) => {
      const user = userEvent.setup();
      const showSnackbar = vi.fn();
      renderWithProviders(
        <Routes>
          <Route path={from.split('?')[0]} element={<Component showSnackbar={showSnackbar} />} />
          <Route path={to} element={<h1>Navigation destination</h1>} />
        </Routes>,
        { routeEntries: [from] },
      );
      const link = screen.getByRole('link', { name, exact: true });
      expect(link).toHaveAttribute('href', to);
      if (activation === 'keyboard') {
        for (let i = 0; i < tabs; i += 1) await user.tab();
        expect(link).toHaveFocus();
        await user.keyboard('{Enter}');
      } else {
        await user.click(link);
      }
      expect(await screen.findByRole('heading', { name: 'Navigation destination' })).toBeVisible();
      for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
      expect(showSnackbar).not.toHaveBeenCalled();
    },
  );
});
