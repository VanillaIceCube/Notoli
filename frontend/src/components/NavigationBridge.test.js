import { renderWithProviders } from '../test-support/utils';
import NavigationBridge from './NavigationBridge';
import { navigate } from '../services/navigationService';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('NavigationBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registers the router navigate function while mounted', () => {
    renderWithProviders(<NavigationBridge />);

    expect(navigate('/board/1', { replace: true })).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('/board/1', { replace: true });
  });

  test('clears the router navigate function when unmounted', () => {
    const { unmount } = renderWithProviders(<NavigationBridge />);

    unmount();

    expect(navigate('/board/1')).toBe(false);
  });
});
