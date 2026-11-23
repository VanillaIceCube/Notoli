import { lazy } from 'react';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router';
import RouteContent from './RouteContent';
import { renderWithProviders } from '../../test-helpers/utils';
import { browserLocation } from '../../services/navigation/navigationService';

afterEach(() => vi.restoreAllMocks());

test('keeps navigation usable while a route chunk is loading', async () => {
  let finish;
  const Page = lazy(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  renderWithProviders(
    <>
      <Link to="/other">Other page</Link>
      <RouteContent>
        <Routes>
          <Route path="/" element={<Page />} />
          <Route path="/other" element={<div>Other content</div>} />
        </Routes>
      </RouteContent>
    </>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading page');
  await userEvent.setup().click(screen.getByRole('link', { name: 'Other page' }));
  expect(screen.getByText('Other content')).toBeVisible();
  await act(async () => {
    finish({ default: () => <div>Late page</div> });
  });
  expect(screen.queryByText('Late page')).not.toBeInTheDocument();
});

test('shows chunk failure recovery, notifies a pending-slot owner and allows other routes', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const reload = vi.spyOn(browserLocation, 'reload').mockImplementation(() => {});
  const onError = vi.fn();
  const Page = lazy(() => Promise.reject(new Error('chunk unavailable')));
  renderWithProviders(
    <>
      <Link to="/other">Other page</Link>
      <RouteContent onError={onError}>
        <Routes>
          <Route path="/" element={<Page />} />
          <Route path="/other" element={<div>Other content</div>} />
        </Routes>
      </RouteContent>
    </>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('This page could not be loaded.');
  expect(onError).toHaveBeenCalledTimes(1);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Reload page' }));
  expect(reload).toHaveBeenCalledTimes(1);
  await userEvent.setup().click(screen.getByRole('link', { name: 'Other page' }));
  expect(screen.getByText('Other content')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
