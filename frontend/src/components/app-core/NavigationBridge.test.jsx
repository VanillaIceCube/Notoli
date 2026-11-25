import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import { navigate } from '../../services/navigation/navigationService';
import NavigationBridge from './NavigationBridge';

function CurrentRoute() {
  const location = useLocation();
  const action = useNavigationType();
  return <output>{action + ' ' + location.pathname}</output>;
}

test('replaces the current route while mounted and releases navigation on unmount', () => {
  const { unmount } = render(
    <MemoryRouter>
      <NavigationBridge />
      <CurrentRoute />
    </MemoryRouter>,
  );

  act(() => {
    expect(navigate('/next', { replace: true })).toBe(true);
  });
  expect(screen.getByRole('status')).toHaveTextContent('REPLACE /next');

  unmount();
  expect(navigate('/next')).toBe(false);
});
