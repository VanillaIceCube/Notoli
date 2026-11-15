import { CssBaseline } from '@mui/material';
import notoliTheme from '../theme';
import { render, waitFor } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router';

// Shared test setup: disable MUI ripples (act warnings).
const testTheme = createTheme(notoliTheme, {
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
  },
});

export function renderWithProviders(ui, { routeEntries = ['/'], ...renderOptions } = {}) {
  return render(
    <ThemeProvider theme={testTheme}>
      <CssBaseline />
      <MemoryRouter initialEntries={routeEntries}>{ui}</MemoryRouter>
    </ThemeProvider>,
    renderOptions,
  );
}

export function createDeferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

export async function waitForLoadingToFinish() {
  await waitFor(() => {
    expect(document.body.textContent || '').not.toMatch(/loading/i);
  });
}
