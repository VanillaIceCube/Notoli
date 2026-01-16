import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

jest.mock('../../services/client', () => ({
  apiFetch: jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => [],
    }),
  ),
}));

test('renders username/password fields and login button', () => {
  render(
    <MemoryRouter>


      <Login showSnackbar={jest.fn()} />

      
    </MemoryRouter>,
  );

  expect(screen.getByLabelText(/username/i)).toBeInTheDocument();

  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();

  expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
});
