import { screen } from '@testing-library/react';

import NotepadPageShell from './NotepadPageShell';
import { renderWithProviders } from '../../test-support/utils';

function renderShell(props = {}) {
  return renderWithProviders(
    <NotepadPageShell
      title="Board"
      loading={false}
      error={null}
      pullDistance={0}
      refreshReady={false}
      isRefreshing={false}
      pullContentOffset={0}
      {...props}
    >
      <div>Rows go here</div>
    </NotepadPageShell>,
  );
}

describe('NotepadPageShell', () => {
  test('when ready, it renders the title and child content', () => {
    renderShell();

    expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByText('Rows go here')).toBeInTheDocument();
  });

  test('when loading, it shows loading and hides child content', () => {
    renderShell({ loading: true });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText('Rows go here')).not.toBeInTheDocument();
  });

  test('when refreshing existing content, it keeps child content visible', () => {
    renderShell({ loading: true, hasContent: true });

    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.getByText('Rows go here')).toBeInTheDocument();
  });

  test('when content is loaded while the title is pending, it reserves title height', () => {
    renderShell({ title: '', loading: true, hasContent: true });

    expect(screen.getByTestId('notepad-page-title')).toHaveStyle({
      minHeight: '2.625rem',
    });
    expect(screen.getByText('Rows go here')).toBeInTheDocument();
  });

  test('when an error exists, it shows the error and hides child content', () => {
    renderShell({ error: 'Error: HTTP 500' });

    expect(screen.getByText('Error: Error: HTTP 500')).toBeInTheDocument();
    expect(screen.queryByText('Rows go here')).not.toBeInTheDocument();
  });

  test('when refreshing existing content fails, it shows the error and keeps child content visible', () => {
    renderShell({ error: 'Error: HTTP 500', hasContent: true });

    expect(screen.getByText('Error: Error: HTTP 500')).toBeInTheDocument();
    expect(screen.getByText('Rows go here')).toBeInTheDocument();
  });
});
