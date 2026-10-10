// Only the two connection pages can override the existing post-login landing.
export function connectionReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  try {
    const url = new URL(value, 'https://notoli.invalid');
    if (
      url.origin === 'https://notoli.invalid' &&
      ['/connections', '/connections/authorize'].includes(url.pathname)
    ) {
      return `${url.pathname}${url.search}`;
    }
  } catch (_err) {
    // Invalid or external destinations fall back to the usual board landing.
  }
  return null;
}

export function loginPath(returnTo) {
  const destination = connectionReturnTo(returnTo);
  return destination ? `/login?next=${encodeURIComponent(destination)}` : '/login';
}
