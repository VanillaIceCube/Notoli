const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const python = process.platform === 'win32' ? 'python' : 'python3';
function policyFor(root) {
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    return JSON.parse(execFileSync(python, [path.join(__dirname, 'check.py')], {
      input: JSON.stringify({ root, base: event.pull_request.base.sha }), encoding: 'utf8', timeout: 30000,
    }));
  }
  return JSON.parse(fs.readFileSync(path.join(root, '.github/workflow-write-grants.json'), 'utf8'));
}
function check(text, name, policy = policyFor(process.cwd())) {
  return JSON.parse(execFileSync(python, [path.join(__dirname, 'check.py')], {
    input: JSON.stringify({ text, name, grants: policy[name.replaceAll('\\', '/')] || {} }), encoding: 'utf8', timeout: 10000,
  }));
}

function audit(root) {
  const errors = [];
  const policy = policyFor(root);
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.ya?ml$/.test(file)) errors.push(...check(fs.readFileSync(file, 'utf8'), path.relative(root, file), policy));
    }
  }
  walk(path.join(root, '.github'));
  return errors;
}
module.exports = { check, audit, policyFor };
if (require.main === module) {
  const errors = audit(process.cwd());
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Workflow security: immutable external references and explicit grant policy passed.');
}
