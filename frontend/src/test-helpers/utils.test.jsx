import { useTheme } from '@mui/material/styles';
import { screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import appTheme from '../theme';
import { renderWithProviders } from './utils';

function RouteDetails() {
  const { pathname, search } = useLocation();
  const theme = useTheme();

  return (
    <>
      <p role="status">{pathname + search}</p>
      <p>Primary color: {theme.palette.primary.main}</p>
    </>
  );
}

test('renders at the requested route with the application theme', () => {
  renderWithProviders(<RouteDetails />, { routeEntries: ['/example?view=details'] });

  expect(screen.getByRole('status')).toHaveTextContent('/example?view=details');
  expect(screen.getByText(`Primary color: ${appTheme.palette.primary.main}`)).toBeVisible();
});
