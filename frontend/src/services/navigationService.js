let navigateImpl = null;

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
