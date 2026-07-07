import { act, render, screen, waitFor } from '@testing-library/react';
import { usePullToRefresh } from './useMobileGestures';

function setTouchViewport({ width = 375, maxTouchPoints = 1, scrollY = 0 } = {}) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: maxTouchPoints,
  });
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: scrollY,
  });
}

function touchEvent(type, { target = document.body, x = 0, y = 0 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: target,
  });
  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: x, clientY: y }],
  });
  event.preventDefault = jest.fn();
  return event;
}

function PullHarness({ enabled = true, onRefresh = jest.fn() }) {
  const { isRefreshing, pullDistance, refreshReady } = usePullToRefresh({
    enabled,
    onRefresh,
  });

  return (
    <div>
      <span data-testid="distance">{pullDistance}</span>
      <span data-testid="ready">{refreshReady ? 'ready' : 'idle'}</span>
      <span data-testid="refreshing">{isRefreshing ? 'refreshing' : 'idle'}</span>
      <input aria-label="name" />
    </div>
  );
}

describe('usePullToRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTouchViewport();
  });

  test('tracks pull distance and refreshes after the threshold is reached', async () => {
    let resolveRefresh;
    const onRefresh = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    render(<PullHarness onRefresh={onRefresh} />);

    act(() => {
      window.dispatchEvent(touchEvent('touchstart', { y: 0 }));
      window.dispatchEvent(touchEvent('touchmove', { y: 90 }));
      window.dispatchEvent(touchEvent('touchend'));
    });

    expect(screen.getByTestId('distance')).toHaveTextContent('0');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('refreshing')).toHaveTextContent('refreshing');

    await act(async () => {
      resolveRefresh();
    });

    await waitFor(() => {
      expect(screen.getByTestId('refreshing')).toHaveTextContent('idle');
    });
  });

  test('does not refresh below the threshold', () => {
    const onRefresh = jest.fn();
    render(<PullHarness onRefresh={onRefresh} />);

    act(() => {
      window.dispatchEvent(touchEvent('touchstart', { y: 0 }));
      window.dispatchEvent(touchEvent('touchmove', { y: 40 }));
      window.dispatchEvent(touchEvent('touchend'));
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  test('ignores gestures from interactive controls', () => {
    const onRefresh = jest.fn();
    render(<PullHarness onRefresh={onRefresh} />);
    const input = screen.getByLabelText('name');

    act(() => {
      input.dispatchEvent(touchEvent('touchstart', { target: input, y: 0 }));
      window.dispatchEvent(touchEvent('touchmove', { y: 90 }));
      window.dispatchEvent(touchEvent('touchend'));
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
