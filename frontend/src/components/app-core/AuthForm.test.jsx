import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextField } from '@mui/material';
import { renderWithProviders } from '../../test-helpers/utils';
import AuthForm, { AuthLink } from './AuthForm';

test('renders the centered auth form with a native footer link and keyboard submit', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  renderWithProviders(
    <AuthForm
      title="Recover access"
      onSubmit={onSubmit}
      isSubmitting={false}
      submitLabel="Submit"
      footer={<AuthLink to="/login">Sign in</AuthLink>}
    >
      <TextField label="Email" />
    </AuthForm>,
  );

  // The Stack has no accessible role; check its layout through the wordmark.
  // eslint-disable-next-line testing-library/no-node-access
  expect(screen.getByText('notoli').parentElement).toHaveStyle({
    alignItems: 'center',
    maxWidth: '600px',
  });
  expect(screen.getByRole('form', { name: 'Recover access' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'reader@example.com{Enter}');
  expect(onSubmit).toHaveBeenCalledOnce();
});
