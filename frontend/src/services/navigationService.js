let navigateImpl = null;

// Keep the native browser boundary separate from React Router navigation.
export const browserLocation = { replace: (to) => window.location.replace(to) };

export function setNavigate(navigate) {
  navigateImpl = typeof navigate === 'function' ? navigate : null;
}

export function clearNavigate() {
  navigateImpl = null;
}

export function navigate(to, options) {
  if (!navigateImpl) return false;
  navigateImpl(to, options);
  return true;
}
