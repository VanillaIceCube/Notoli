import { createElement } from 'react';
import { renderWithProviders } from '../../test-helpers/utils';
import NavigationBridge from './NavigationBridge';
import { navigate } from '../../services/navigation/navigationService';
const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: () => mockNavigate,
}));
describe('NavigationBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  test('registers the router navigate function while mounted', () => {
    renderWithProviders(createElement(NavigationBridge));
    expect(
      navigate('/board/1', {
        replace: true,
      }),
    ).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith('/board/1', {
      replace: true,
    });
  });
  test('clears the router navigate function when unmounted', () => {
    const { unmount } = renderWithProviders(createElement(NavigationBridge));
    unmount();
    expect(navigate('/board/1')).toBe(false);
  });
});
