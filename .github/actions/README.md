# 🧩 GitHub actions

Shared local action contracts for the repository family. The caller workflows own
triggers, repository-specific gates and token permissions; the
[GitHub README](../README.md) owns installation and credential setup.

## 🧭 Structure

| Action | Responsibility |
| --- | --- |
| [get-pr-diff](get-pr-diff/action.yml) | Bounded source diff and changed-file context. |
| [collect-prior-ai-reviews](collect-prior-ai-reviews/action.yml) | Attributed, bounded prior discussion and review evidence. |
| [openai-chat](openai-chat/action.yml) | Validated request policy, configuration and aggregate usage. |
| [publish-ai-review](publish-ai-review/action.yml) | Current-head native review publication and conservative own-feedback reconciliation. |
| [security-alerts](security-alerts/action.yml) | Validated alert classification, issue lifecycle and separate Project synchronization. |

## 📏 Complete source-diff review limit

All three reviewers (Obi-Wan Code-nobi, Lint Eastwood and RoboCop) inherit a
2 MB (2,000,000-byte) source-diff limit from [`get-pr-diff`](get-pr-diff/action.yml)
in all four repositories. No reviewer workflow overrides that limit. Existing
repository-specific generated-lockfile exclusions and independent scanner gates
still apply. A source diff at the limit is reviewed in full; a larger source diff
withholds the model call, publishes an incomplete-review notice and fails the
reviewer's check. Truncated content cannot produce an approval.

This byte limit is not a token allowance or a guarantee of review quality. The
180,000-byte changed-file context, 30,000-byte per-file context, 16,000 output-token
limit and configured model/effort remain unchanged. Focused review remains useful
for large changes; increasing this limit does not bypass any required reviewer or
independent gate.

## 🐍 Python toolchain bootstrap

[`setup-uv`](setup-uv/action.yml) installs uv 0.13.8 for the current Ubuntu
Linux X64 CI runners. Its reviewed manylinux x86_64 wheel SHA-256 is embedded in
the action, independently of the downloaded artifact; pip requires that hash,
permits only wheels, installs no dependencies and ignores cached/preinstalled uv.
Unsupported runner targets fail before installation. Existing local Windows/macOS
setup guidance is separate from this CI action.

The hash was checked against [PyPI release metadata](https://pypi.org/pypi/uv/0.13.8/json)
on 2026-11-15. Follow [pip's secure installation guidance](https://pip.pypa.io/en/stable/topics/secure-installs/).
Toolchain upgrades must review the version and wheel hash together in all four
repositories; never fetch a replacement expected hash during the CI run. A new
runner target needs an explicitly reviewed wheel and regression coverage first.
The application/tooling lockfile does not cover this bootstrap. Repository tokens,
workflow permissions and locked environment synchronization remain unchanged.

## 🔐 Reviewer contract

FullStackTemplate owns the reusable reviewer pattern. All four repositories use
the same bounded collector, reconciliation helper and Responses request policy;
repository-specific triggers, required checks, personas and credentials remain
in their [workflow guide](../README.md). Application API keys are unrelated
to reviewer keys. MacroMapper's private/public application project split remains
app-owned. Never put a key, prompt, reset token or private source in usage evidence.

## 🗣️ Discussion and context

[`collect-prior-ai-reviews`](collect-prior-ai-reviews/action.yml) gets the
authenticated token action's App slug and verifies its exact numeric Bot user ID.
Display-name substring matching is not an ownership fallback. The App token stays
limited to contents-read/pull-requests-write. Reconciliation source/check/status/
branch-rule reads use a separate client with the existing job `GITHUB_TOKEN`
(`contents`, `pull-requests`, `checks`, `statuses`: read), never the App write
client. A bounded read-only API probe reports readable/unavailable outcomes in
the existing job log; API access is not a claim that checks passed. No App
installation permission or reviewer key/project is expanded. REST uses the
`[bot]` suffix; GraphQL Bot login omits it, and reconciliation checks both the
API-specific login and numeric identity. No unrelated App credentials are used.

The collector reads at most ten 100-entry pages per endpoint. It selects by
timestamp then ID: five recent owner/member/collaborator review bodies and twenty
human replies directly to this persona's roots, before up to five own reviews and
forty own inline comments. Body budgets are 6000/1500/4000/1200 UTF-8 bytes;
the complete serialized payload is capped at 64 KiB. Truncation/page limits,
revision, root/review IDs, source, authors and outdated status are disclosed.
Older-commit attribution is separate from outdated status; an active inline
comment remains active when the PR advances.
Missing permissions/context are reported as unavailable, never an empty clean
history. Common credentials, email addresses and query-bearing URLs are omitted;
arbitrary prose can still contain personal data, so include only relevant context.
Fork collection is excluded; same-repository Dependabot follows ordinary policy.

All discussion is quoted untrusted data. Owner intent can explain why a decision
exists; source and authoritative scanner/check evidence still determine findings.
Discussion cannot request secrets, execute commands, approve a merge/deployment,
or suppress a valid security issue. Outdated discussions are historical claims.

## 🧵 Feedback lifecycle

The existing review schema is preserved. Reviewers may additionally return at
most five `reconciliations` with a prior own root `comment_id`, `action`
(`follow_up` or `resolve`) and `evidence` (`head_sha`, `removed_code`,
`replacement_code`, `reason`). The explanation must revalidate the finding;
human assertions or moving a line are insufficient. Unsupported cases stay open.

[`reconcile.js`](publish-ai-review/reconcile.js) checks current open
same-repository PR head, exact App ownership, complete thread history, one exact
old added line from the finding's hunk, its absence from current file content and
an ancestor-to-HEAD patch proving a single-line substitution at the cited location,
and that exact replacement line at the reviewed head. Broader edits, renames and
nonancestor histories remain open. At most five pages of25thread roots and five
decisions are processed; each candidate conversation is limited to20comments and
longer/incomplete histories are left alone; large/incomplete files or threads are skipped. Resolution
also requires an outdated resolvable thread, a clean current `APPROVE` with no
findings/inline comments, and completed independent checks plus reported legacy commit statuses without failures.
The expected native lint/test/scanner inventory (with distinct Infrastructure
secret/dependency gates) must be present and successful under the GitHub Actions
App, including all three CodeQL analyzers. This is deliberately stricter for
automatic resolution than ordinary path-based merge skips: otherwise valid
scoped/omitted analyses leave feedback open. Expected other persona checks must
be present and successful; all independent
required branch-rule contexts must also be present and successful (including
verified integration identity where specified). Skipped/neutral/missing required
evidence keeps the thread open. Only this persona's active check and self-dependent Required CI/Auto Merge
aggregates are excluded to avoid a dependency cycle; other persona failures still
block resolution, and all native aggregate/review requirements remain unchanged.
Missing/denied/incomplete status evidence cannot authorize resolution.
These predicates support only narrow source replacements, not universal proof
of arbitrary fixes. Ambiguous or unresolved security findings must remain open.

Only this persona's roots can change; human/other-bot threads are never resolved.
Own-root threads with any human/other-bot participant also stay open. Participants
and head are checked again immediately before and after resolution; a race after
a confirmed own resolution attempts to reopen that own thread and reports an
incomplete result. Denied/uncertain recovery is never represented as success.
The resolver verifies mutation output and post-reads the state/current head.
Permission failures or uncertain results are logged as incomplete, with no
unverified completion claim. Follow-ups contain a deterministic source-evidence
fingerprint and revision, not source snippets or commands. Existing owned markers
suppress repeats across reruns. Each persona/PR writer and its parent CI use
`cancel-in-progress: false` concurrency groups to serialize mutations; same-process
calls serialize too. Do not reuse the helper in an uncoordinated writer workflow.
GitHub can coalesce pending events; rerun the latest head if its mandatory check
is missing. No old-head verdict is accepted as current-head review evidence.

## ⚙️ Configuration and usage

The owner-selected model stays **`gpt-6-luna`**. Explicit `medium` effort preserves
its documented default. [Official model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna),
verified **2026-11-06**, supports `none`, `low`, `medium`, `high`, `xhigh`, `max`
and a 128000 output-token maximum. The local allowlist rejects unverified models,
invalid efforts and invalid token budgets before any API request; no silent
model substitution or fabricated approval is permitted. Web search remains
restricted to the existing major-upgrade reviewer path.

Optional repository variables `AI_REVIEW_MODEL`, `AI_REVIEW_REASONING_EFFORT` and
`AI_REVIEW_MAX_OUTPUT_TOKENS` apply to existing reviewers and alert grouping.
Unset values preserve Luna/medium/16000. Output tokens include reasoning and
visible output. Owners can lower token limits or choose a verified effort; this
does not introduce a dollar threshold or change provider/project spending policy.
The model variable is validated against the reviewed allowlist, not an open-ended
model migration switch. To recover configuration, remove/revert the offending
variable and rerun the latest head; to recover implementation, revert the scoped
change through ordinary protected review. Keep credentials/projects unchanged.
Disabling a workflow or weakening required checks is not recovery.

Each request appends aggregate usage and request latency to its existing job
summary. Missing usage is `null`/unknown. The dated Standard token-price table in
[`policy.cjs`](openai-chat/policy.cjs) is configurable through a reviewed
source change with official URL/date; verified rates are $0.10 input, $0.01 cached
input, $0.50 output per million tokens. Estimate only when model/tier and relevant
counters match within the verified short-context band (up to272000 input tokens).
Long-context estimates remain unknown. Tool/cache-write/regional/other charges are excluded; total billed
cost remains unknown. Estimates are not bills or spending enforcement. Reverify
[pricing](https://developers.openai.com/api/docs/pricing) before cost decisions.
No raw prompts, model response bodies, provider error text, keys or private source
are printed by the request action or included in usage summaries.

Mock tests execute the actual request Bash with synthetic curl responses and test
collector bounds, adversarial discussion, unavailable context, identity, ownership,
stale heads, source evidence, denied/uncertain mutations, idempotency and races.
Normal scoped PR reviewer runs provide live configuration/usage acceptance;
no additional billable model experiment is required.

## 🧪 Checks

Commands run from the repository root. Execute tests beside changed actions,
including request policy, context collection, publication and reconciliation:

```sh
node --test .github/actions/publish-ai-review/*.test.js
node --test .github/actions/collect-prior-ai-reviews/*.test.js
```

Keep [review-output-examples.md](publish-ai-review/review-output-examples.md)
beside the publisher tests: it is an exact expected-output fixture, not a setup
guide. Tests mock provider/GitHub responses; they do not prove live credentials,
current-head reviews, branch-rule acceptance, billing, or deployment readiness.
