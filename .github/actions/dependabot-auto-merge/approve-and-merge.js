module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const pull_number = context.issue.number;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    await github.rest.pulls.createReview({
      owner,
      repo,
      pull_number,
      event: 'APPROVE',
    });
    core.info('Approved Dependabot PR.');
  } catch (error) {
    core.warning(`Approval failed: ${error.message}`);
  }

  // GitHub can report mergeable_state as unknown for a short time.
  let pr;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const { data } = await github.rest.pulls.get({ owner, repo, pull_number });
    pr = data;
    core.info(`mergeable_state=${pr.mergeable_state} mergeable=${pr.mergeable}`);
    if (pr.mergeable_state === 'clean' && pr.mergeable !== false) {
      break;
    }
    if (attempt < 6) {
      await wait(10000);
    }
  }

  if (!pr || pr.mergeable === false) {
    core.warning('PR is not mergeable; skipping auto-merge handling.');
    return;
  }

  if (pr.draft) {
    core.warning('PR is a draft; skipping auto-merge handling.');
    return;
  }

  if (pr.merged) {
    core.info('PR is already merged; skipping.');
    return;
  }

  if (pr.mergeable_state === 'clean') {
    await github.rest.pulls.merge({
      owner,
      repo,
      pull_number,
      merge_method: 'merge',
    });
    core.info('PR merged directly because it is clean.');
    return;
  }

  if (pr.mergeable_state === 'unstable') {
    core.warning('PR is in unstable state; skipping auto-merge enablement.');
    return;
  }

  const mutation = `
    mutation($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
      enablePullRequestAutoMerge(input: {
        pullRequestId: $pullRequestId,
        mergeMethod: $mergeMethod
      }) {
        pullRequest {
          number
          autoMergeRequest {
            enabledAt
          }
        }
      }
    }
  `;
  await github.graphql(mutation, {
    pullRequestId: pr.node_id,
    mergeMethod: 'MERGE',
  });
  core.info('Auto-merge enabled.');
};
