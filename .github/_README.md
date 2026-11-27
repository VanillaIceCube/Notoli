# ⚙️ GitHub automation

GitHub Actions, repository setup, dependency updates, and AI reviews for Notoli.
Source-controlled configuration and GitHub account/repository settings are separate.

## 🧭 Structure

| Location | Purpose |
| --- | --- |
| [workflows](workflows/README.md) | Entry points, gates, reviewers, schedules and deployment. The guide includes four flow diagrams. |
| [scripts](scripts) | Standalone automation programs that workflows or people run, and their supporting modules. |
| [actions](actions/README.md) | Reusable composite steps, each with its own `action.yml` and implementation. |
| [tests](tests) | One suite per tested JavaScript implementation or workflow, named after its source. |
| [fixtures](fixtures) | Saved test inputs and expected output. Use lowercase, hyphen-separated nouns for the data and add the scenario last when variants exist (for example, `github-check-runs-passing.json`). |
| [package.json](package.json) and [package-lock.json](package-lock.json) | JavaScript dependencies for automation and their verified install versions. |
| [dependabot.yml](dependabot.yml) | Dependency ecosystems and update schedules. |

Keep the exact `pyyaml` development pin lowercase so Dependabot's uv updater can match it.
The backend Docker updater accepts Python 3.12 patches and digest refreshes. Review the image constraint alongside `requires-python` when changing Python versions.
The frontend skips TypeScript 7.0.x because the ESLint parser requires a TypeScript version below 6.1. Recheck its supported peer range when a later minor release is available.

## 🚦 Before your first pull request

1. Configure Actions, dependency alerts, advanced CodeQL, and available secret scanning/push protection using this repository's settings below.
2. Install the three reviewer GitHub Apps and set their App ID variables.
3. Store each persona's OpenAI key and App private key in both Actions and Dependabot secrets: six reviewer secrets in each store.
4. Configure this repository's OpenAI reviewer project and native issue fields. To group alert tickets under an existing tracking issue, set the optional repository Actions variable `ROBOCOP_PARENT_ISSUE` to its issue number.
5. Verify fresh same-repository human and Dependabot PR results before activating or changing required checks.
6. Configure deployment separately through the app or gateway production guide.

Missing credentials and unavailable review evidence fail visibly. Existing secret
values are not recoverable from GitHub; use the original credentials through the
owner's approved process. Never weaken checks to make setup pass.

## ⚙️ Repository setup

Use the repository's Issues tab and the owner's [native issue schema](https://github.com/VanillaIceCube/fullstack-template/blob/main/.github/_README.md#1-configure-repository-issue-tracking). Backfill and verify existing managed tickets before switching alert workflows. After merging, run all three alert workflows on main and verify native field retention before removing the old Project credentials or closing the board. Record results in [FullStackTemplate #386](https://github.com/VanillaIceCube/FullStackTemplate/issues/386).

**Native issue cutover verification, November 25, 2026.** Project 8 contained 354 issues. The read-back matched native field values and issue types on 354 issues, including all 140 security-alert tickets (2 open). Issue numbers, state, closure reasons, and closure dates were preserved. Examples include [#544](https://github.com/VanillaIceCube/Notoli/issues/544), [#554](https://github.com/VanillaIceCube/Notoli/issues/554).

## 🔑 Credential ownership

The four existing repositories already use the accepted persona-specific
credentials and reviewer projects. The following is an onboarding/operator
reference, not a pending model or credential migration. Configure these names
before activating a new installation; missing keys fail visibly and there is
no fallback to a shared `OPENAI_API_KEY`.

Use a dedicated **Notoli · AI Reviewers** OpenAI project (or the
repository's existing reviewer-only project). Never share credentials between
repositories. Create three distinct keys with these exact display names:

| OpenAI key display name | GitHub secret | Consumer |
| --- | --- | --- |
| `CI · Obi-Wan · Code Review` | `OBI_WAN_OPENAI_API_KEY` | Obi-Wan PR reviews |
| `CI · Lint Eastwood · Build Review` | `LINT_EASTWOOD_OPENAI_API_KEY` | Lint Eastwood PR reviews |
| `CI · RoboCop · Security Review` | `ROBOCOP_OPENAI_API_KEY` | RoboCop PR reviews and all three scheduled/manual alert feeds |

In this repository, add all three keys as **Actions repository secrets** and
also as **Dependabot repository secrets**, with identical names and values in
both stores. Keep the three existing GitHub App private-key secrets in both
stores as well (six review secrets total).

1. In OpenAI Platform, select the repository's reviewer project, open its API
   keys page, and create the three keys above. Restrict each key to the API
   permissions needed for Responses requests; retain model access and Obi-Wan's
   existing semver-major web-search capability. Choose an expiration under your
   rotation policy and record when replacement is due.
2. In GitHub **Settings → Secrets and variables → Actions → Secrets**, add the
   exact secret names in the table. Each value is the full secret key from its
   matching OpenAI entry, not its display name or key ID. Use Dependabot's
   separate secret settings too where specified above.
3. In **Actions → Variables**, set `OPENAI_REVIEWERS_PROJECT_ID` to that same OpenAI
   project's actual `proj_...` ID. All three keys and the project header must
   match. This variable identifies the OpenAI project for the reviewers.
4. Run a same-repository PR smoke test for all three reviewers. Where supported,
   also verify a Dependabot PR using its separate secret store. After an
   approved merge, manually run CodeQL Alert, Vulnerability Alert, and Malware
   Alert on the default branch and observe their next scheduled runs. Do not
   run production deployment to test reviewer credentials.
5. In OpenAI Usage, filter by the reviewer project and individual API key to
   confirm each persona's attribution. An empty alert feed may make no model
   call; record that outcome rather than assuming usage was verified.
6. For configuration recovery, restore the last accepted persona-specific key/
   project bindings and validated reviewer variables, then rerun the latest head.
   Any source revert must use ordinary protected review and retain its matching
   credential contract. A legacy key used elsewhere is not an active reviewer
   fallback; never copy it into all three persona slots or expose key values.
   This reference does not rotate or provision credentials during Batch 3.

See [OpenAI key security, expiration and usage guidance](https://developers.openai.com/api/docs/guides/production-best-practices#api-keys).

## 🔒 Branch protection

Preserve the existing main ruleset, including all independent scanner/lint/test contexts and the three AI reviewers. Exclude the standalone `CodeQL` context; require the scope detector and all three analyzer contexts. Validate the current platform rules and fresh human/Dependabot results before changing settings.

<a id="-verification"></a>

## 🧪 Checks

The [test workflow](workflows/gate-test.yml) validates workflow and script syntax,
checks Docker Compose configuration with test settings, and limits logs sent to
the build reviewer. See the [workflow checks](workflows/README.md#-checks-and-diagnostics)
for local dependencies and commands.

Verify the current head's independent checks and all three native review identities.
Distinguish synthetic local tests from actual GitHub runner/credential acceptance.
After an authorized merge, verify default-branch baselines and separately review
alert-workflow side effects before fresh manual dispatches. A successful human PR
does not prove access to the separate Dependabot secret store. Source review does
not authorize merging, branch promotion, production deployment, or key rotation.

<a id="-exact-settings-and-verification"></a>

### Exact settings and verification

- [Reviewer keys, App identities, and deferred migration](_README.md#-credential-ownership).
- [Required main-branch checks](workflows/README.md#main-branch-required-checks).
- [Dependabot isolation and auto-merge policy](workflows/README.md#protected-dependabot-auto-merge).
- [Security-alert credential and input contract](workflows/README.md#security-alert-configuration-contract).
- [Reviewer feedback and recovery](actions/README.md).

Deployment credentials and production client registration belong to the
[production guide](../deploy/production/README.md). They are separate from
local application setup and reviewer configuration.

<a id="-related-guides"></a>

## 📚 Reference

- [Workflow behavior and maintenance](workflows/README.md).
- [Shared action and reviewer contracts](actions/README.md).
- [CI/CD architecture](workflows/README.md#-architecture-and-trust-boundaries).
- [Application production setup and launches](../deploy/production/README.md).

## 🤝 Shared engineering ownership and rollout

Follow FullStackTemplate's [canonical shared ownership and rollout policy](https://github.com/VanillaIceCube/fullstack-template/blob/main/.github/_README.md#-shared-engineering-ownership-and-rollout)
for repository applicability, canonical source ownership, downstream acceptance and
[main-first releases](https://github.com/VanillaIceCube/fullstack-template/blob/main/.github/_README.md#main-first-releases).
Preserve app-specific profiles and Infrastructure's separate owner authorization,
Required CI and host operations. A shared parent closes only after required downstream
adoptions are merged and verified or explicitly deferred with owner/tracking/acceptance.
