import { render, screen } from '@testing-library/react';
import { setupUserEvent } from '../test-utils';
import MySnackbar from './MySnackbar';

describe('MySnackbar', () => {
  test('when rendered, it shows the message and severity', () => {
    render(<MySnackbar open severity="success" message="Saved!" onClose={jest.fn()} />);

    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  test('when the close button is clicked, it calls onClose', async () => {
    const onClose = jest.fn();
    const user = setupUserEvent();

    render(<MySnackbar open severity="error" message="Oops" onClose={onClose} />);

    await user.click(screen.getByLabelText(/close/i));

    expect(onClose).toHaveBeenCalled();
  });
});
