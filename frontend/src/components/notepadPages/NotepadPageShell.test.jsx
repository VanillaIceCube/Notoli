/* eslint-disable testing-library/no-node-access -- Assert the surrounding paper/wrapper do not add a second displacement. */
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
      {...props}
    >
      <div>Rows go here</div>
    </NotepadPageShell>,
  );
}

describe('NotepadPageShell', () => {
  test('pull displacement does not also translate content or grow paper padding', () => {
    renderShell({ pullDistance: 84, refreshReady: true });
    const indicator = screen.getByTestId('pull-to-refresh-indicator');
    expect(indicator).toHaveStyle({ height: '33.6px' });
    expect(indicator.parentElement).not.toHaveStyle({ transform: 'translateY(33.6px)' });
    expect(indicator.closest('.MuiPaper-root')).toHaveStyle({ paddingBottom: '12px' });
  });
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

  test('refreshing an empty page retains its empty state instead of flashing initial loading', () => {
    renderShell({ loading: true, isRefreshing: true });
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.getByText('Rows go here')).toBeInTheDocument();
  });

  test('when content is loaded while the title is pending, it reserves title height', () => {
    renderShell({ title: '', loading: true, hasContent: true });

    expect(screen.getByTestId('notepad-page-title')).toHaveStyle({
      'min-height': '42px',
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
