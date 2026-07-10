import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AppSnackbar from './AppSnackbar';
import { renderWithProviders } from '../test-support/utils';

describe('AppSnackbar', () => {
  test('when open is false, it does not render the message', () => {
    renderWithProviders(
      <AppSnackbar open={false} severity="success" message="Saved!" onClose={jest.fn()} />,
    );

    expect(screen.queryByText('Saved!')).not.toBeInTheDocument();
  });

  test('when open is true, it renders the message text', () => {
    renderWithProviders(
      <AppSnackbar open severity="success" message="Saved!" onClose={jest.fn()} />,
    );

    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  test('when a severity is provided, it renders an alert with that severity', () => {
    renderWithProviders(<AppSnackbar open severity="error" message="Boom" onClose={jest.fn()} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('MuiAlert-standardError');
  });

  test('when the close button is clicked, it calls onClose', async () => {
    const onClose = jest.fn();

    renderWithProviders(<AppSnackbar open severity="info" message="Hi" onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
