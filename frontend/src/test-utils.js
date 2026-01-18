import { render } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

// Shared test setup: disable MUI ripples (act warnings) and silence router v7 warnings.
const testTheme = createTheme({
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
  },
});

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

export function renderWithProviders(ui, { routeEntries = ['/'], ...renderOptions } = {}) {
  return render(
    <ThemeProvider theme={testTheme}>
      <MemoryRouter future={routerFuture} initialEntries={routeEntries}>
        {ui}
      </MemoryRouter>
    </ThemeProvider>,
    renderOptions,
  );
}
