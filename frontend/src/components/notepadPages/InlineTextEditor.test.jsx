import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineTextEditor from './InlineTextEditor';
import { renderWithProviders } from '../../test-support/utils';
describe('InlineTextEditor', () => {
  test('when rendered, it shows the current value and placeholder', () => {
    renderWithProviders(
      <InlineTextEditor
        value="Draft"
        placeholder="New item..."
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('New item...')).toHaveValue('Draft');
  });
  test('when text changes, it reports the next value to the parent', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <InlineTextEditor value="Draft" onChange={onChange} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: 'Updated',
      },
    });
    expect(onChange).toHaveBeenCalledWith('Updated');
  });
  test('when Enter or Escape is pressed, it submits or cancels', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <InlineTextEditor value="Draft" onChange={vi.fn()} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await userEvent.type(screen.getByRole('textbox'), '{Enter}{Escape}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
  test('when the value is blank, the submit button is disabled', () => {
    renderWithProviders(
      <InlineTextEditor value="   " onChange={vi.fn()} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getAllByRole('button')[0]).toBeDisabled();
  });
});
