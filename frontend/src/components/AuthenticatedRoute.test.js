import { screen } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigationType } from 'react-router-dom';

import AuthenticatedRoute from './AuthenticatedRoute';
import { renderWithProviders } from '../test-utils';

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

  it('redirects to /login when no access token is present', () => {
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

  it('renders children when access token exists', () => {
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
});
