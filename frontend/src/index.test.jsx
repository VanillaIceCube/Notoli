import { act, within } from '@testing-library/react';

const { roots } = vi.hoisted(() => ({ roots: [] }));

// Capture real roots only so this test can unmount what the entry point creates.
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal();
  const createRoot = (...args) => {
    const root = actual.createRoot(...args);
    roots.push(root);
    return root;
  };
  return { ...actual, createRoot, default: { ...actual.default, createRoot } };
});

describe('application startup', () => {
  let container;
  let originalLocation;
  let startupErrors;
  let captureError;

  beforeEach(() => {
    originalLocation = window.location.href;
    window.history.replaceState({}, '', '/');
    sessionStorage.clear();
    localStorage.clear();
    container = document.createElement('div');
    container.id = 'root';
    document.body.append(container);
    startupErrors = [];
    captureError = (event) => startupErrors.push(event.error ?? event.reason ?? event.message);
    window.addEventListener('error', captureError);
    window.addEventListener('unhandledrejection', captureError);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Unexpected startup request'))),
    );
    vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {
      throw new Error('Unexpected startup request');
    });
  });

  afterEach(async () => {
    await act(async () => {
      for (const root of roots.splice(0)) root.unmount();
    });
    container.remove();
    window.removeEventListener('error', captureError);
    window.removeEventListener('unhandledrejection', captureError);
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState({}, '', originalLocation);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('boots the real application into the signed-out login page without requesting private data', async () => {
    await act(async () => {
      await import('./index');
    });

    const app = within(container);
    expect(await app.findByRole('heading', { name: 'Login' })).toBeVisible();
    expect(app.getByRole('textbox', { name: 'Email' })).toBeVisible();
    expect(app.getByLabelText('Password')).toBeVisible();
    expect(app.getByRole('button', { name: 'Login' })).toBeEnabled();
    expect(window.location.pathname).toBe('/login');
    expect(startupErrors).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(XMLHttpRequest.prototype.open).not.toHaveBeenCalled();
  });
});
