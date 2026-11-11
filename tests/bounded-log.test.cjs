const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
test('bounded diagnostics retain early, middle and late failures, use safe delimiters and cap artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch2-log-'));
  try {
    const source = path.join(root, 'raw.txt'), output = path.join(root, 'output');
    const lines = Array.from({ length: 10000 }, (_, i) => `ordinary output ${i} ${'x'.repeat(200)}`);
    lines[3] = 'not ok EARLY'; lines[5000] = 'AssertionError MIDDLE'; lines[9995] = 'FAILURE LATE'; lines[5001] = 'EOF';
    fs.writeFileSync(source, lines.join('\n'));
    execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['scripts/bounded_log.py', source, output]);
    const summary = fs.readFileSync(output, 'utf8').replaceAll('\r\n', '\n');
    for (const marker of ['EARLY', 'MIDDLE', 'LATE']) assert.ok(summary.includes(marker));
    assert.ok(summary.length < 16200);
    const delimiter = summary.split('\n')[0].split('<<')[1];
    assert.match(delimiter, /^LOG_[a-f0-9]{32}$/);
    assert.equal(summary.trimEnd().split('\n').at(-1), delimiter);
    assert.ok(fs.statSync(source.replace('.txt', '.bounded.txt')).size < 1050000);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
