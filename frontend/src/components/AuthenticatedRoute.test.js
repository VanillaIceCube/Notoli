import { renderWithProviders } from '../test-utils';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import AuthenticatedRoute from './AuthenticatedRoute';

describe('AuthenticatedRoute', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('when no token exists, it redirects to /login', () => {
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route
          path="/"
          element={
            <AuthenticatedRoute>
              <div>Protected</div>
            </AuthenticatedRoute>
          }
        />
      </Routes>,
      { routeEntries: ['/'] },
    );

    expect(screen.getByText('Login Screen')).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  test('when token exists, it renders children', () => {
    sessionStorage.setItem('accessToken', 'token');

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route
          path="/"
          element={
            <AuthenticatedRoute>
              <div>Protected</div>
            </AuthenticatedRoute>
          }
        />
      </Routes>,
      { routeEntries: ['/'] },
    );

    expect(screen.getByText('Protected')).toBeInTheDocument();
  });
});
