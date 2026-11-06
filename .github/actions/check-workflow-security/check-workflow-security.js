const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function check(text, name) {
  return JSON.parse(execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(__dirname, 'check.py')], {
    input: JSON.stringify({ text, name }), encoding: 'utf8', timeout: 10000,
  }));
}

function audit(root) {
  const errors = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.ya?ml$/.test(file)) errors.push(...check(fs.readFileSync(file, 'utf8'), path.relative(root, file)));
    }
  }
  walk(path.join(root, '.github'));
  return errors;
}
module.exports = { check, audit };
if (require.main === module) {
  const errors = audit(process.cwd());
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Workflow security: immutable external references and explicit grant policy passed.');
}
