// Changes only for a new login or session invalidation, not token rotation.
let sessionVersion = 0;

export function getSessionVersion() {
  return sessionVersion;
}

export function advanceSessionVersion() {
  sessionVersion += 1;
}
