"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const YAML = require("yaml");

const root = path.resolve(__dirname, '../..');

const actionDirectory = path.resolve(__dirname, '../actions/setup-uv');
const actionSteps = YAML.parse(fs.readFileSync(path.join(actionDirectory, 'action.yml'), 'utf8')).runs.steps;

function temporaryDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'composite-action-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('uv bootstrap pins the reviewed runner, wheel and pip flags and propagates pip failures', () => {
  const step = actionSteps.find(step => step.name === 'Install uv');
  assert.equal(step.run.trim(), 'node "$GITHUB_ACTION_PATH/setup-uv.js"');
  const { install } = require("../actions/setup-uv/setup-uv");
  const env = { RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64' };
  for (const status of [0, 1]) {
    const result = install(env, (program, args, options) => {
      assert.equal(program, 'python');
      assert.deepEqual(args.slice(0, 4), ['-m', 'pip', '--isolated', 'install']);
      for (const flag of ['--no-cache-dir', '--force-reinstall', '--no-deps', '--only-binary=:all:', '--require-hashes']) assert.ok(args.includes(flag), flag);
      assert.ok(args.includes('--no-index'));
      assert.equal(options.stdio, 'inherit');
      const wheel = new URL(args.at(-1));
      assert.equal(wheel.origin, 'https://files.pythonhosted.org');
      assert.equal(path.posix.basename(wheel.pathname), 'uv-0.13.8-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl');
      assert.equal(wheel.hash, '#sha256=e18a57b8b352eb7c8feb317b9f6f533c8f0ad9673fd6cf34bbe3cf1a9f6a8984');
      return { status };
    });
    assert.equal(result, status);
  }
  for (const target of [{ RUNNER_OS: 'Windows' }, { RUNNER_ARCH: 'ARM64' }]) {
    assert.throws(() => install({ ...env, ...target }, assert.fail), /reviewed Linux X64 wheel/);
  }
});

test('Docker uv bootstraps pass reviewed requirements through stdin and preserve pip failures', t => {
  const dir = temporaryDirectory(t);
  const stub = path.join(dir, 'python');
  fs.writeFileSync(stub, [
    '#!/usr/bin/env node',
    'const fs = require("node:fs");',
    'fs.writeFileSync("pip.args", process.argv.slice(2).join("\\n"));',
    'fs.writeFileSync("requirements", fs.readFileSync(0));',
    'process.exitCode = Number(process.env.PIP_EXIT);',
  ].join('\n'), { mode: 0o755 });
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  let canonical;
  for (const name of ['Dockerfile', 'Dockerfile.hotswap']) {
    const text = fs.readFileSync(path.join(root, 'backend/docker', name), 'utf8').replace(/\\\r?\n/g, ' ');
    const run = text.split('\n').find(line => line.startsWith('RUN ') && line.includes('python -m pip')).slice(4);
    if (canonical) assert.equal(run, canonical);
    canonical = run;
    for (const status of [0, 1]) {
      const result = spawnSync(shell, ['-c', run], {
        cwd: dir, encoding: 'utf8', timeout: 15000,
        env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH, MSYS2_ARG_CONV_EXCL: '/dev/stdin', PIP_EXIT: String(status) },
      });
      assert.equal(result.status, status, result.stderr);
      const args = fs.readFileSync(path.join(dir, 'pip.args'), 'utf8').trim().split('\n');
      for (const flag of ['--isolated', '--no-cache-dir', '--force-reinstall', '--no-deps', '--only-binary=:all:', '--require-hashes']) assert.ok(args.includes(flag), flag);
      assert.equal(args[args.indexOf('--index-url') + 1], 'https://pypi.org/simple');
      assert.equal(args[args.indexOf('--requirement') + 1], '/dev/stdin');
      const requirements = fs.readFileSync(path.join(dir, 'requirements'), 'utf8');
      assert.match(requirements, /^uv==0\.13\.8(?:\s+--hash=sha256:[a-f0-9]{64}){7}\s*$/);
    }
  }
});
