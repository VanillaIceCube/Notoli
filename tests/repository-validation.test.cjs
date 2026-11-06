const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const validator = path.resolve(__dirname, '../scripts/validate_repository.py');
test('repository whitespace validation checks committed PR changes on a clean checkout', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch2-whitespace-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git('init', '-q');
    git('config', 'user.name', 'Disposable Fixture');
    git('config', 'user.email', 'fixture@example.test');
    git('config', 'core.autocrlf', 'false');
    const file = path.join(root, 'fixture.md');
    fs.writeFileSync(file, 'clean\n');
    git('add', '.'); git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    fs.writeFileSync(file, 'trailing whitespace \n');
    git('add', '.'); git('commit', '-qm', 'candidate');
    const head = git('rev-parse', 'HEAD');
    assert.equal(git('status', '--porcelain'), '');
    const event = path.join(root, 'event.json');
    const check = (first, last) => {
      fs.writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: first }, head: { sha: last } } }));
      return spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c',
        'import importlib.util,pathlib,sys; spec=importlib.util.spec_from_file_location("validator",sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); m.ROOT=pathlib.Path(sys.argv[2]); m.check_whitespace()', validator, root], {
        cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, PYTHONUTF8: '1' },
      });
    };
    const failure = check(base, head);
    assert.notEqual(failure.status, 0);
    assert.match(failure.stdout + failure.stderr, /fixture\.md:1: trailing whitespace/);
    assert.equal(check(base, base).status, 0);
    assert.notEqual(check('--invalid', head).status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
