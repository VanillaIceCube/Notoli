const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');
const root = process.cwd();
const python = process.platform === 'win32' ? 'python' : 'python3';
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const posix = p => p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase());
function steps(action) {
  return JSON.parse(execFileSync(python, ['-c', 'import json,sys,yaml;print(json.dumps(yaml.safe_load(open(sys.argv[1],encoding="utf-8"))["runs"]["steps"]))', path.join(root, '.github/actions', action, 'action.yml')], { encoding: 'utf8' }));
}
function fixture(run, env, stubs, check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch2-action-'));
  try {
    fs.mkdirSync(path.join(dir, 'bin'));
    for (const [name, body] of Object.entries(stubs)) {
      const file = path.join(dir, 'bin', name);
      fs.writeFileSync(file, '#!/bin/sh\nset -eu\n' + body + '\n'); fs.chmodSync(file, 0o755);
    }
    fs.writeFileSync(path.join(dir, 'run.sh'), run);
    fs.writeFileSync(path.join(dir, 'diff.txt'), 'quoted "change"\nsecond line');
    fs.writeFileSync(path.join(dir, 'response.json'), JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'fixture response' }] }] }));
    const values = { ...process.env, GITHUB_OUTPUT: posix(path.join(dir, 'output')), GITHUB_STEP_SUMMARY: posix(path.join(dir, 'summary')), MOCK_BIN: posix(path.join(dir, 'bin')), MOCK_CWD: posix(dir), MOCK_RESPONSE: posix(path.join(dir, 'response.json')), DIFF_PATH: posix(path.join(dir, 'diff.txt')), GIT_LOG: posix(path.join(dir, 'git.log')), ...env };
    const result = spawnSync(bash, ['-c', 'export PATH="$MOCK_BIN:$PATH"; cd "$MOCK_CWD"; bash run.sh'], { env: values, encoding: 'utf8', timeout: 15000 });
    check(result, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('Responses request construction and unavailable-output paths execute with mocked curl only', () => {
  const run = steps('openai-chat')[0].run;
  const env = { OPENAI_API_KEY: 'synthetic-key', OPENAI_PROJECT_ID: 'synthetic-project', PROMPT_PREFIX: 'prefix\n', SYSTEM_PROMPT: 'system', MODEL: 'gpt-6-luna', GITHUB_ACTION_PATH: posix(path.join(root, '.github/actions/openai-chat')), MAX_OUTPUT_TOKENS: '100', ENABLE_WEB_SEARCH: 'true' };
  const stubs = { curl: 'cat "$MOCK_RESPONSE"; exit "${CURL_EXIT:-0}"', uuidgen: 'printf "fixture-id\\n"' };
  fixture(run, env, stubs, (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(fs.readFileSync(path.join(dir, 'body.json'), 'utf8'));
    assert.equal(body.input, 'prefix\nquoted "change"\nsecond line');
    assert.equal(body.instructions, 'system'); assert.equal(body.max_output_tokens, 100);
    assert.equal(body.tools[0].type, 'web_search'); assert.equal(body.tool_choice, 'required');
    assert.equal(JSON.stringify(body).includes('synthetic-key'), false);
    assert.match(fs.readFileSync(path.join(dir, 'output'), 'utf8'), /fixture response/);
  });
  for (const extra of [{ OPENAI_API_KEY: '' }, { CURL_EXIT: '7' }]) {
    fixture(run, { ...env, ...extra }, stubs, (result, dir) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(fs.readFileSync(path.join(dir, 'summary'), 'utf8'), /unavailable/);
      assert.doesNotMatch(fs.readFileSync(path.join(dir, 'output'), 'utf8'), /fixture response/);
    });
  }
  fixture(run, env, { ...stubs, curl: 'printf "not-json"' }, (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(dir, 'output'), 'utf8'), /not valid JSON/);
  });
  fixture(run, env, { ...stubs, curl: 'printf "null"' }, (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(dir, 'output'), 'utf8'), /OpenAI did not return a response/);
    assert.match(fs.readFileSync(path.join(dir, 'summary'), 'utf8'), /"input_tokens": null/);
  });

});

test('collector wrapper loads canonical bounded collector with env-only inputs', async () => {
  const step = steps('collect-prior-ai-reviews')[0];
  assert.equal(step.env.APP_SLUG, '${{ inputs.app_slug }}');
  assert.doesNotMatch(step.with.script, /\$\{\{ inputs\./);
  assert.match(step.with.script, /await collect/);
});

if (fs.existsSync(path.join(root, '.github/actions/prepare-lint-commit/action.yml'))) {
  test('lint push attribution requires a valid App identity and never calls real gh or git', () => {
    const run = steps('prepare-lint-commit').find(step => step.run).run;
    const env = { APP_SLUG: 'fixture-lint', GH_TOKEN: 'synthetic-token', GITHUB_REPOSITORY: 'fixture/repo', BOT_ID: '123' };
    const stubs = { gh: 'printf "%s\\n" "$BOT_ID"', git: 'printf "%s\\n" "$@" >> "$GIT_LOG"' };
    fixture(run, env, stubs, (result, dir) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(fs.readFileSync(path.join(dir, 'output'), 'utf8'), /123\+fixture-lint\[bot\]@users.noreply.github.com/);
      assert.match(fs.readFileSync(path.join(dir, 'git.log'), 'utf8'), /remote\nset-url\n--push\norigin/);
    });
    for (const extra of [{ APP_SLUG: '' }, { BOT_ID: 'invalid' }]) fixture(run, { ...env, ...extra }, stubs, (result, dir) => {
      assert.equal(result.status, 1); assert.equal(fs.existsSync(path.join(dir, 'git.log')), false);
    });
  });
}

test('publisher wrapper separates the existing read-only evidence token from the App write client', async () => {
  const step = steps('publish-ai-review')[0];
  const previous = Object.fromEntries(['EVIDENCE_TOKEN','REVIEW_BODY','PERSONA_NAME','APP_SLUG'].map(k => [k,process.env[k]]));
  const readClient = {}; let captured;
  const github = { constructor: class { constructor(options) { assert.equal(options.auth, 'synthetic-evidence'); return readClient; } } };
  try {
    Object.assign(process.env, { EVIDENCE_TOKEN: 'synthetic-evidence', REVIEW_BODY: '{}', PERSONA_NAME: 'Fixture', APP_SLUG: 'fixture' });
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('github','context','core','require',step.with.script)(github,{}, {}, () => ({ publishAiReview: async args => { captured = args; } }));
    assert.equal(captured.github, github); assert.equal(captured.readGithub, readClient);
    assert.doesNotMatch(JSON.stringify(captured), /synthetic-evidence/);
  } finally { for (const [key,value] of Object.entries(previous)) { if(value === undefined) delete process.env[key]; else process.env[key]=value; } }
});
test('all reviewer workflows request only evidence reads from workflow token and preserve App write capability', () => {
  for (const name of ['review-code.yml','review-build.yml','review-security.yml']) {
    const text = fs.readFileSync(path.join(root,'.github/workflows',name),'utf8');
    assert.match(text,/\n  checks: read/); assert.match(text,/\n  statuses: read/); assert.match(text,/\n  pull-requests: read/);
    assert.doesNotMatch(text,/\n  pull-requests: write/);
    assert.match(text,/permission-pull-requests: write/); assert.match(text,/evidence_token: \$\{\{ github.token \}\}/);
  }
});


test('uv bootstrap enforces its reviewed runner and cleans requirements on success or failure', () => {
  const run = steps('setup-uv').find(step => step.name === 'Install uv').run;
  const env = { RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', RUNNER_TEMP: posix(os.tmpdir()) };
  const stubs = { python: 'printf "%s\\n" "$@" > "$MOCK_CWD/pip.args"; for arg do requirements="$arg"; done; cat "$requirements" > "$MOCK_CWD/requirements"; printf "%s" "$requirements" > "$MOCK_CWD/requirements-path"; exit "${PIP_EXIT:-0}"' };
  for (const status of [0, 1]) fixture(run, { ...env, PIP_EXIT: String(status) }, stubs, (result, dir) => {
    assert.equal(result.status, status, result.stderr);
    const args = fs.readFileSync(path.join(dir, 'pip.args'), 'utf8').trim().split('\n');
    for (const flag of ['--isolated', '--no-cache-dir', '--force-reinstall', '--no-deps', '--only-binary=:all:', '--require-hashes']) assert.ok(args.includes(flag), flag);
    assert.equal(args[args.indexOf('--index-url') + 1], 'https://pypi.org/simple');
    assert.match(fs.readFileSync(path.join(dir, 'requirements'), 'utf8'), /^uv==0\.13\.8 --hash=sha256:[a-f0-9]{64}\n$/);
    const requirements = fs.readFileSync(path.join(dir, 'requirements-path'), 'utf8');
    const nativePath = process.platform === 'win32' ? requirements.replace(/^\/([a-z])\//, '$1:/') : requirements;
    assert.equal(fs.existsSync(nativePath), false);
  });
  for (const target of [{ RUNNER_OS: 'Windows' }, { RUNNER_ARCH: 'ARM64' }]) fixture(run, { ...env, ...target }, stubs, (result, dir) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /reviewed Linux X64 wheel/);
    assert.equal(fs.existsSync(path.join(dir, 'pip.args')), false);
  });
});

test('uv bootstrap pip options accept a verified wheel and reject altered bytes offline', () => {
  const program = String.raw`
import hashlib
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import venv
import zipfile
import yaml
steps = yaml.safe_load(Path('.github/actions/setup-uv/action.yml').read_text())['runs']['steps']
run = next(step['run'] for step in steps if step.get('name') == 'Install uv')
args = shlex.split(run[run.index('python -m pip'):].replace('\\\n', ' '))[1:]
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    # Locked uv environments need not include pip; keep ensurepip outside the repo.
    environment = root / "python"
    venv.EnvBuilder(with_pip=True).create(environment)
    interpreter = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    wheel = root / 'uv-0.13.8-py3-none-any.whl'
    with zipfile.ZipFile(wheel, 'w') as archive:
        archive.writestr('uv/__init__.py', '# offline fixture\n')
        archive.writestr('uv-0.13.8.dist-info/METADATA', 'Metadata-Version: 2.1\nName: uv\nVersion: 0.13.8\n')
        archive.writestr('uv-0.13.8.dist-info/WHEEL', 'Wheel-Version: 1.0\nGenerator: fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n')
        archive.writestr('uv-0.13.8.dist-info/RECORD', '')
    requirements = root / 'requirements.txt'
    requirements.write_text('uv==0.13.8 --hash=sha256:' + hashlib.sha256(wheel.read_bytes()).hexdigest() + '\n')
    args[args.index('--requirement') + 1] = str(requirements)
    index = args.index('--index-url')
    args[index:index + 2] = ['--no-index', '--find-links', str(root)]
    for tampered in (False, True):
        target = root / ('rejected' if tampered else 'accepted')
        if tampered:
            with wheel.open('ab') as output:
                output.write(b'changed after approval')
        result = subprocess.run([str(interpreter), *args, '--target', str(target)], capture_output=True, text=True)
        if tampered:
            assert result.returncode != 0, result.stdout
            assert 'DO NOT MATCH THE HASHES' in result.stderr, result.stderr
            assert not (target / 'uv').exists()
        else:
            assert result.returncode == 0, result.stderr
            assert (target / 'uv/__init__.py').exists()
`;
  execFileSync(python, ['-c', program], { stdio: 'pipe', timeout: 30000 });
});


test('complete source diffs are accepted through 2 MB and marked incomplete above it', () => {
  const action = fs.readFileSync(path.join(root, '.github/actions/get-pr-diff/action.yml'), 'utf8');
  const budget = Number(action.match(/max_bytes:[\s\S]*?default: "(\d+)"/)[1]);
  assert.equal(budget, 2000000);
  const run = steps('get-pr-diff')[0].run
    .replaceAll('${{ inputs.base_sha }}', 'a'.repeat(40))
    .replaceAll('${{ inputs.head_sha }}', 'b'.repeat(40))
    .replaceAll('${{ inputs.max_bytes }}', String(budget));
  const stubs = {
    git: `if [ "$1" = "ls-tree" ] || [ "\${2:-}" = "--name-only" ]; then exit 0; fi
python -c 'import os,sys; sys.stdout.buffer.write(b"+" + b"x" * (int(os.environ["DIFF_SIZE"]) - 2) + bytes([10]))'`,
    python3: 'exec python "$@"',
  };
  for (const bytes of [budget - 1, budget, budget + 1]) fixture(run, { DIFF_SIZE: String(bytes), BASE_SHA: 'a'.repeat(40), HEAD_SHA: 'b'.repeat(40), MAX_BYTES: String(budget) }, stubs, (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    const outputs = Object.fromEntries(fs.readFileSync(path.join(dir, 'output'), 'utf8').trim().split('\n').map(line => line.split('=')));
    assert.equal(Number(outputs.max_bytes), budget);
    assert.equal(Number(outputs.diff_bytes), bytes);
    assert.equal(outputs.truncated, String(bytes > budget));
    assert.equal(fs.statSync(path.join(dir, 'pr.diff')).size, Math.min(bytes, budget));
    if (bytes > budget) assert.match(result.stdout, /Truncated to 2000000 bytes/);
    else assert.doesNotMatch(result.stdout, /Truncated/);
  });
});
