import { clearNavigate, navigate, setNavigate } from './navigationService';

describe('navigationService', () => {
  beforeEach(() => {
    clearNavigate();
    jest.clearAllMocks();
  });

  test('when no navigate impl is registered, navigate() returns false', () => {
    expect(navigate('/login')).toBe(false);
  });

  test('when setNavigate() is given a non-function, navigate() returns false', () => {
    setNavigate(null);

    expect(navigate('/login')).toBe(false);
  });

  test('when setNavigate() is given a function, navigate() calls it and returns true', () => {
    const impl = jest.fn();
    setNavigate(impl);

    expect(navigate('/login', { replace: true })).toBe(true);
    expect(impl).toHaveBeenCalledWith('/login', { replace: true });
  });

  test('when clearNavigate() is called, navigate() returns false again', () => {
    setNavigate(jest.fn());
    clearNavigate();

    expect(navigate('/login')).toBe(false);
  });
});

