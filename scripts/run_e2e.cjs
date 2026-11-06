const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const frontend = path.resolve(__dirname, '../frontend');
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'batch2-e2e-'));
fs.writeFileSync(path.join(state, '.disposable-e2e'), 'isolated browser tests');
try {
  const result = spawnSync(process.execPath, [
    path.join(frontend, 'node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2),
  ], { cwd: frontend, env: { ...process.env, E2E_STATE_DIR: state }, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  // Playwright has finished tearing down its web servers before its CLI exits.
  // Remove only this invocation's generated directory, including startup errors.
  if (fs.realpathSync(path.dirname(state)) !== fs.realpathSync(os.tmpdir()) || !path.basename(state).startsWith('batch2-e2e-')) {
    throw new Error('Refusing cleanup outside this invocation temporary directory');
  }
  fs.rmSync(state, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
