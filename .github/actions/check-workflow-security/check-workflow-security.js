const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const python = process.platform === 'win32' ? 'python' : 'python3';
function check(text, name, baseText) {
  return JSON.parse(execFileSync(python, [path.join(__dirname, 'check.py')], {
    input: JSON.stringify({ text, name, base_text: baseText }),
    encoding: 'utf8',
    timeout: 10000,
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
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const { pull_request: pr } = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    execFileSync(python, [path.join(__dirname, 'check.py'), '--compare-workflow-grants', pr.base.sha, pr.head.sha], { cwd: root, stdio: 'inherit' });
  }
  return errors;
}
module.exports = { check, audit };
if (require.main === module) {
  const errors = audit(process.cwd());
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Workflow security: immutable external references and permission validation passed.');
}
