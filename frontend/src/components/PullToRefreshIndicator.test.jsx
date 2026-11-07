import { screen } from '@testing-library/react';

import PullToRefreshIndicator from './PullToRefreshIndicator';
import { renderWithProviders } from '../test-support/utils';

describe('PullToRefreshIndicator', () => {
  test('when not pulling or refreshing, it does not reserve spacing or expose an active status', () => {
    renderWithProviders(
      <PullToRefreshIndicator pullDistance={0} refreshReady={false} isRefreshing={false} />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('pull-to-refresh-indicator')).toHaveStyle({
      height: '0px',
    });
    expect(screen.getByTestId('RefreshIcon')).toBeInTheDocument();
  });

  test('the gesture uses one proportional spacer and holds its space while refreshing', () => {
    const view = renderWithProviders(
      <PullToRefreshIndicator pullDistance={50} refreshReady={false} isRefreshing={false} />,
    );
    expect(screen.getByTestId('pull-to-refresh-indicator')).toHaveStyle({
      height: '20px',
      transition: 'none',
    });
    view.rerender(<PullToRefreshIndicator pullDistance={84} refreshReady isRefreshing={false} />);
    expect(screen.getByTestId('pull-to-refresh-indicator')).toHaveStyle({ height: '33.6px' });
    view.rerender(<PullToRefreshIndicator pullDistance={0} refreshReady={false} isRefreshing />);
    expect(screen.getByTestId('pull-to-refresh-indicator')).toHaveStyle({
      height: '33.6px',
      transition: 'height 180ms ease-out',
    });
    view.rerender(
      <PullToRefreshIndicator pullDistance={0} refreshReady={false} isRefreshing={false} />,
    );
    expect(screen.getByTestId('pull-to-refresh-indicator')).toHaveStyle({ height: '0px' });
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
    expect(screen.getByTestId('RefreshIcon')).toHaveStyle(
      'animation: notoliRefreshSpin 1400ms linear infinite -1050ms',
    );
  });
});
