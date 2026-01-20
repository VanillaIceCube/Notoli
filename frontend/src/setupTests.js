import '@testing-library/jest-dom';

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const ignoredWarnings = [
  'React Router Future Flag Warning',
  'non-boolean attribute `dense`',
  'inside a test was not wrapped in act(...).',
  'A component suspended inside an `act` scope',
];

const shouldIgnore = (...args) => {
  const [format] = args;
  if (typeof format === 'string' && format.includes('non-boolean attribute')) {
    return true;
  }
  const text = args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg && typeof arg.message === 'string') return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
  return ignoredWarnings.some((warning) => text.includes(warning));
};

beforeAll(() => {
  console.error = (...args) => {
    if (shouldIgnore(...args)) return;
    originalConsoleError(...args);
  };

  console.warn = (...args) => {
    if (shouldIgnore(...args)) return;
    originalConsoleWarn(...args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});
