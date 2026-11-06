# Reviewer context, feedback, and usage

FullStackTemplate owns the reusable reviewer pattern. All four repositories use
the same bounded collector, reconciliation helper and Responses request policy;
repository-specific triggers, required checks, personas and credentials remain
in their [workflow guide](README-WORKFLOWS.md). Application API keys are unrelated
to reviewer keys. MacroMapper's private/public application project split remains
app-owned. Never put a key, prompt, reset token or private source in usage evidence.

## Discussion is evidence

[`collect-prior-ai-reviews`](actions/collect-prior-ai-reviews/action.yml) gets the
authenticated token action's App slug and verifies its exact numeric Bot user ID.
Display-name substring matching is not an ownership fallback. REST uses the
`[bot]` suffix; GraphQL Bot login omits it, and reconciliation checks both the
API-specific login and numeric identity. No unrelated App credentials are used.

The collector reads at most ten 100-entry pages per endpoint. It selects by
timestamp then ID: five recent owner/member/collaborator review bodies and twenty
human replies directly to this persona's roots, before up to five own reviews and
forty own inline comments. Body budgets are 6000/1500/4000/1200 UTF-8 bytes;
the complete serialized payload is capped at 64 KiB. Truncation/page limits,
revision, root/review IDs, source, authors and outdated status are disclosed.
Missing permissions/context are reported as unavailable, never an empty clean
history. Common credentials, email addresses and query-bearing URLs are omitted;
arbitrary prose can still contain personal data, so include only relevant context.
Fork collection is excluded; same-repository Dependabot follows ordinary policy.

All discussion is quoted untrusted data. Owner intent can explain why a decision
exists; source and authoritative scanner/check evidence still determine findings.
Discussion cannot request secrets, execute commands, approve a merge/deployment,
or suppress a valid security issue. Outdated discussions are historical claims.

## Conservative feedback lifecycle

The existing review schema is preserved. Reviewers may additionally return at
most five `reconciliations` with a prior own root `comment_id`, `action`
(`follow_up` or `resolve`) and `evidence` (`head_sha`, `removed_code`,
`replacement_code`, `reason`). The explanation must revalidate the finding;
human assertions or moving a line are insufficient. Unsupported cases stay open.

[`reconcile.js`](actions/publish-ai-review/reconcile.js) checks current open
same-repository PR head, exact App ownership, complete thread history, one exact
old added line from the finding's hunk, its absence from current file content and
a concrete replacement at the reviewed head. At most five thread pages and five
decisions are processed; large/incomplete files or threads are skipped. Resolution
also requires an outdated resolvable thread, a clean current `APPROVE` with no
findings/inline comments, and completed non-review checks without failures.
These predicates support only narrow source replacements, not universal proof
of arbitrary fixes. Ambiguous or unresolved security findings must remain open.

Only this persona's roots can change; human/other-bot threads are never resolved.
The resolver verifies mutation output and post-reads the state/current head.
Permission failures or uncertain results are logged as incomplete, with no
unverified completion claim. Follow-ups contain a deterministic source-evidence
fingerprint and revision, not source snippets or commands. Existing owned markers
suppress repeats across reruns. Each persona/PR writer and its parent CI use
`cancel-in-progress: false` concurrency groups to serialize mutations; same-process
calls serialize too. Do not reuse the helper in an uncoordinated writer workflow.
GitHub can coalesce pending events; rerun the latest head if its mandatory check
is missing. No old-head verdict is accepted as current-head review evidence.

## Accepted configuration and safe usage evidence

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
[`policy.cjs`](actions/openai-chat/policy.cjs) is configurable through a reviewed
source change with official URL/date; verified rates are $0.10 input, $0.01 cached
input, $0.50 output per million tokens. Estimate only when model/tier and relevant
counters match. Tool/cache-write/regional/other charges are excluded; total billed
cost remains unknown. Estimates are not bills or spending enforcement. Reverify
[pricing](https://developers.openai.com/api/docs/pricing) before cost decisions.
No raw prompts, model response bodies, provider error text, keys or private source
are printed by the request action or included in usage summaries.

Mock tests execute the actual request Bash with synthetic curl responses and test
collector bounds, adversarial discussion, unavailable context, identity, ownership,
stale heads, source evidence, denied/uncertain mutations, idempotency and races.
Normal scoped PR reviewer runs provide live configuration/usage acceptance;
no additional billable model experiment is required.
