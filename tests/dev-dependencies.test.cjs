const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('development entrypoint handles fresh, unchanged, changed and failed installs and preserves command status', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch2-dev-'));
  const posix = value => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());
  try {
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    const npm = path.join(dir, 'bin/npm');
    fs.writeFileSync(npm, '#!/bin/sh\nset -eu\nprintf "install\\n" >> "$INSTALL_LOG"\n[ "${FAIL_INSTALL:-0}" = 0 ] || exit 23\nmkdir -p node_modules\n');
    fs.chmodSync(npm, 0o755);
    const env = { ...process.env, TEST_BIN: posix(path.join(dir, 'bin')), TEST_CWD: posix(dir), ENTRY: posix(path.resolve('frontend/docker-entrypoint-dev.sh')), INSTALL_LOG: posix(path.join(dir, 'installs')) };
    const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
    const run = (code = 0, extra = {}) => spawnSync(bash, ['-c', 'export PATH="$TEST_BIN:$PATH"; cd "$TEST_CWD"; sh "$ENTRY" sh -c "exit $COMMAND_STATUS"'], { env: { ...env, COMMAND_STATUS: String(code), ...extra }, encoding: 'utf8' });
    const count = () => fs.readFileSync(path.join(dir, 'installs'), 'utf8').trim().split('\n').length;
    assert.equal(run().status, 0); assert.equal(count(), 1);
    assert.equal(run().status, 0); assert.equal(count(), 1);
    fs.appendFileSync(path.join(dir, 'package.json'), '\n');
    assert.equal(run().status, 0); assert.equal(count(), 2);
    fs.appendFileSync(path.join(dir, 'package-lock.json'), '\n');
    assert.equal(run(0, { FAIL_INSTALL: '1' }).status, 23); assert.equal(count(), 3);
    assert.equal(fs.existsSync(path.join(dir, 'node_modules/.dependency-manifests.sha256')), false);
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    assert.equal(run().status, 0); assert.equal(count(), 4);
    assert.equal(run(7).status, 7); assert.equal(count(), 4);
    fs.unlinkSync(path.join(dir, 'package-lock.json'));
    assert.equal(run().status, 1); assert.equal(count(), 4);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
