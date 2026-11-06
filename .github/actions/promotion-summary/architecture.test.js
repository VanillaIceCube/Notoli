const test = require('node:test');
const { execFileSync } = require('node:child_process');
test('architecture diagrams, source links and generated inventory match actual workflow YAML', () => {
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['scripts/ci_architecture.py', '--check'], { stdio: 'pipe' });
});
