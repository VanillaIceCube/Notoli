import { screen } from '@testing-library/react';

import PullToRefreshIndicator from './PullToRefreshIndicator';
import { renderWithProviders } from '../test-support/utils';

describe('PullToRefreshIndicator', () => {
  test('when not pulling or refreshing, it reserves spacing without an active status', () => {
    renderWithProviders(
      <PullToRefreshIndicator pullDistance={0} refreshReady={false} isRefreshing={false} />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('pull-to-refresh-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('RefreshIcon')).toBeInTheDocument();
  });

  test('when pulling below the threshold, it shows a partially rotated refresh icon', () => {
    renderWithProviders(
      <PullToRefreshIndicator pullDistance={24} refreshReady={false} isRefreshing={false} />,
    );

    expect(screen.getByRole('status', { name: /pull to refresh/i })).toBeInTheDocument();
    expect(screen.getByTestId('RefreshIcon')).toBeInTheDocument();
  });

  test('when pulled far enough, it shows the release state with the refresh icon', () => {
    renderWithProviders(
      <PullToRefreshIndicator pullDistance={84} refreshReady={true} isRefreshing={false} />,
    );

    expect(screen.getByRole('status', { name: /release to refresh/i })).toBeInTheDocument();
    expect(screen.getByTestId('RefreshIcon')).toBeInTheDocument();
  });

  test('when refreshing, it keeps the spinning refresh icon visible', () => {
    renderWithProviders(
      <PullToRefreshIndicator pullDistance={0} refreshReady={false} isRefreshing={true} />,
    );

    expect(screen.getByRole('status', { name: /refreshing/i })).toBeInTheDocument();
    expect(screen.getByTestId('RefreshIcon')).toBeInTheDocument();
  });
});
