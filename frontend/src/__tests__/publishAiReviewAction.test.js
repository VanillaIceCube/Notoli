const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractPublishScript(actionText) {
  const marker = '        script: |\n';
  const start = actionText.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  return actionText
    .slice(start + marker.length)
    .split(/\r?\n/)
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
}

function createGitHubMock(createdReview) {
  const pulls = {
    listFiles: jest.fn(),
    listReviews: jest.fn(),
    listReviewComments: jest.fn(),
    createReview: jest.fn(async (review) => {
      createdReview.value = review;
      return { data: review };
    }),
  };
  const apps = {
    getAuthenticated: jest.fn(async () => ({ data: { slug: 'obi-wan-code-nobi-reviewer' } })),
  };

  return {
    rest: { apps, pulls },
    paginate: jest.fn(async (method) => {
      if (method === pulls.listFiles) {
        return [
          {
            filename: 'src/example.js',
            patch: ['@@ -1,2 +1,2 @@', '-old duplicate', '+new duplicate'].join('\n'),
          },
        ];
      }
      if (method === pulls.listReviews) {
        return [
          {
            id: 42,
            state: 'CHANGES_REQUESTED',
            submitted_at: '2026-07-12T00:00:00Z',
            body: 'Existing review body',
            user: { login: 'obi-wan-code-nobi-reviewer[bot]' },
          },
        ];
      }
      if (method === pulls.listReviewComments) {
        return [
          {
            path: 'src/example.js',
            line: 1,
            body: 'Duplicate inline finding',
            diff_hunk: '@@ -1,2 +1,2 @@',
            pull_request_review_id: 42,
            user: { login: 'obi-wan-code-nobi-reviewer[bot]' },
          },
        ];
      }
      return [];
    }),
  };
}

test('publish AI review preserves unplaced findings when duplicate comments are suppressed', async () => {
  const actionPath = path.resolve(
    __dirname,
    '../../../.github/actions/publish-ai-review/action.yml',
  );
  const script = extractPublishScript(fs.readFileSync(actionPath, 'utf8'));
  const createdReview = {};
  const github = createGitHubMock(createdReview);
  const core = { setFailed: jest.fn(), warning: jest.fn() };
  const context = {
    repo: { owner: 'VanillaIceCube', repo: 'Notoli' },
    payload: { pull_request: { number: 589 } },
  };
  const processMock = {
    env: {
      REVIEW_BODY: JSON.stringify({
        event: 'REQUEST_CHANGES',
        body: 'Existing review body',
        comments: [
          {
            path: 'src/example.js',
            line: 1,
            body: 'Duplicate inline finding',
          },
          {
            path: 'src/example.js',
            line: 99,
            body: 'New unplaceable finding',
          },
        ],
      }),
      PERSONA_NAME: 'Obi-Wan Code-nobi',
      DEFAULT_BODY: 'Obi-Wan Code-nobi completed a code review.',
    },
  };

  await vm.runInNewContext(`(async () => {\n${script}\n})()`, {
    context,
    core,
    github,
    process: processMock,
  });

  expect(core.setFailed).not.toHaveBeenCalled();
  expect(createdReview.value.comments).toBeUndefined();
  expect(createdReview.value.body).toContain('### Unplaced inline findings');
  expect(createdReview.value.body).toContain('`src/example.js:99`: New unplaceable finding');
  expect(createdReview.value.body).toContain(
    '1 duplicate inline comment(s) already appeared in an earlier Obi-Wan Code-nobi review',
  );
  expect(createdReview.value.body).toContain(
    '1 inline finding(s) were moved into the review body because they did not target valid added diff lines.',
  );
});
