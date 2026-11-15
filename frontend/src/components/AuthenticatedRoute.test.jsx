import {
  startSession,
  clearSession,
  rotateSessionTokens,
  getSessionSnapshot,
} from '../services/sessionState';
import { act, fireEvent, screen } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigationType } from 'react-router';

import AuthenticatedRoute from './AuthenticatedRoute';
import { renderWithProviders } from '../test-helpers/utils';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function LoginPage() {
  const navigationType = useNavigationType();
  return <div data-testid="login">login:{navigationType}</div>;
}

describe('AuthenticatedRoute', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('when an access token exists, it renders children', () => {
    sessionStorage.setItem('accessToken', 'token');

    renderWithProviders(
      <>
        <Routes>
          <Route
            path="/"
            element={
              <AuthenticatedRoute>
                <div>secret</div>
              </AuthenticatedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
        <LocationDisplay />
      </>,
      { routeEntries: ['/'] },
    );

    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
  });

  it('when no access token is present, it redirects to /login', () => {
    renderWithProviders(
      <>
        <Routes>
          <Route
            path="/"
            element={
              <AuthenticatedRoute>
                <div>secret</div>
              </AuthenticatedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
        <LocationDisplay />
      </>,
      { routeEntries: ['/'] },
    );

    expect(screen.getByTestId('login')).toHaveTextContent('login:REPLACE');
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});

test('keeps private state across rotation, resets it for a new login and reacts to logout', () => {
  startSession({ access: 'a', refresh: 'r' });
  renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <AuthenticatedRoute>
            <input aria-label="Private draft" defaultValue="" />
          </AuthenticatedRoute>
        }
      />
      <Route path="/login" element={<div>Signed out</div>} />
    </Routes>,
  );
  fireEvent.change(screen.getByLabelText('Private draft'), {
    target: { value: 'old account draft' },
  });
  const session = getSessionSnapshot();
  act(() => rotateSessionTokens({ access: 'rotated' }, session.version, 'r'));
  expect(screen.getByLabelText('Private draft')).toHaveValue('old account draft');
  act(() => startSession({ access: 'new', refresh: 'new-r' }));
  expect(screen.getByLabelText('Private draft')).toHaveValue('');
  act(() => clearSession());
  expect(screen.getByText('Signed out')).toBeVisible();
});
