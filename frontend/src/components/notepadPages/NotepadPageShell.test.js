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

  test('when loading, it shows title and row skeletons and hides child content', () => {
    renderShell({ loading: true });

    expect(screen.getByTestId('notepad-title-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Board' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading content/i })).toBeInTheDocument();
    expect(screen.getByTestId('notepad-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Rows go here')).not.toBeInTheDocument();
  });

  test('when refreshing existing content, it keeps the title and child content visible', () => {
    renderShell({ loading: true, hasContent: true });

    expect(screen.queryByTestId('notepad-title-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /loading content/i })).not.toBeInTheDocument();
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
