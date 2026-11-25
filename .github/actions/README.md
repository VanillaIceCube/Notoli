# 🧩 Local GitHub Actions

## 🧭 Structure

A local action is a reusable step called with `uses: ./.github/actions/<name>`. Open its `action.yml` to see its inputs, outputs and execution order. Standalone automation programs live in [scripts](../scripts). Automation [tests](../tests) read sample data from [fixtures](../fixtures).

| Action | What it does |
| --- | --- |
| [get-pr-diff](get-pr-diff/action.yml) | Reads the PR’s base and head from Git, numbers added lines for review and reports whether the complete source diff fits the budget. |
| [get-prior-ai-reviews](get-prior-ai-reviews/action.yml) | Verifies the reviewer's bot identity and collects bounded, attributed PR discussion for that reviewer. |
| [request-ai-response](request-ai-response/action.yml) | Validates the model, effort and token limit, calls the Responses API and records aggregate usage. |
| [publish-ai-review](publish-ai-review/action.yml) | Publishes the reviewer’s verdict on the current PR head and reconciles eligible threads owned by that reviewer. |
| [track-security-alerts](track-security-alerts/action.yml) | Validates configuration and Project access, fetches one feed, groups open findings and reconciles the tracking issues. |
| [setup-uv](setup-uv/action.yml) | Installs the reviewed uv wheel and exposes the locked Python environment to subsequent steps. |
| [setup-lint-bot](setup-lint-bot/action.yml) | Looks up the lint bot’s identity and prepares its Git credentials for an eligible lint fix. |

## Authoring an action

1. Give the directory a lower-case, hyphenated name. Put its public interface in `action.yml`.
2. Keep parameter mapping, step order and short commands in YAML. Name the primary JavaScript file after its directory, as in `setup-uv/setup-uv.js`. Give secondary modules names that describe their role. Invoke action programs through `GITHUB_ACTION_PATH` so a caller can choose its working directory.
3. Declare credential inputs explicitly. Each step receives the token for its operation. A review workflow that inspects a proposed change keeps privileged API calls separate from code supplied by that change.
4. Place executable tests in `.github/tests`. Name each suite after the script or action implementation it tests, for example `request-ai-response.test.js`. Put sample API responses and expected output in [fixtures](../fixtures). Run the [automation checks](../workflows/README.md#-checks-and-diagnostics) from the repository root.

## 🐍 Python toolchain bootstrap

[setup-uv.js](setup-uv/setup-uv.js) pins the Linux x64 wheel version and SHA-256. Pip requires that exact hash, accepts only wheels and installs no dependencies. Review the version and hash together when upgrading all four repositories. The project directory defaults to `backend`. The `only-dev` input selects the locked development tools for automation jobs.

## 🔐 Reviewer contract

Each persona has its own GitHub App and OpenAI credentials. The App token publishes that persona’s reviews. The workflow token reads evidence about checks, statuses and branch rules. PR text, prior discussion and scanner output are untrusted inputs. Forks receive the independent gates. The three review workflows have credentials only on eligible same-repository PRs. [Credential setup](../README.md)

**Inputs and budgets.** All three reviewers accept a complete source diff up to 2,000,000 bytes. A larger diff gets an incomplete-review notice and a failing check. Only a regular, non-executable `frontend/package-lock.json` covered by the dependency gates is omitted. Other lockfiles and changes to that path’s file type remain in review. The prior-discussion collector limits pages, entries and UTF-8 bytes and identifies truncated or unavailable history. The code-review context also bounds changed-file content.

**Model requests.** The defaults are `gpt-6-luna`, medium effort and 16,000 output tokens. The caller resolves the optional `AI_REVIEW_*` settings. The [request policy](request-ai-response/request-ai-response.js) rejects unsupported values before a request. Each call records aggregate usage and latency. Web search is available to the code reviewer only for Dependabot major-upgrade evidence.

**Verdicts and threads.** `REQUEST_CHANGES` fails the check even when the same finding appeared earlier. Valid `APPROVE` and `COMMENT` results pass. Missing credentials, malformed output, incomplete major-upgrade evidence or an outdated head prevent an approval. To resolve one of its own threads, the [publisher](publish-ai-review/reconcile-ai-review.js) verifies the current head, original author, complete conversation, exact source replacement, approval and successful independent checks. Threads with another participant or insufficient evidence stay open. It checks the result after mutation and handles head changes without treating stale feedback as resolved. Writers for the same persona and PR are serialized.

**Alert tracking.** The [alert action](track-security-alerts/action.yml) keeps RoboCop’s issue credentials separate from personal Project credentials. It accounts for every source alert before closing superseded issues. Empty feeds still reconcile existing tickets. For field setup, priorities and recovery, see [the workflow guide](../workflows/README.md#security-alert-configuration-contract).

## 🧪 Checks

The [tests directory](../tests) contains mocked provider requests, registry and GitHub responses, real temporary Git histories, exact byte-budget cases, credential boundaries and reviewer failure paths. The [publisher examples](../fixtures/ai-review-bodies.json) are expected test output. Live acceptance requires a current-head GitHub run with the corresponding credential store.
