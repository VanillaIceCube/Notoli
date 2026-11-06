# Batch 3 shared capability parity

FullStackTemplate is canonical for reusable reviewer/application patterns.
Infrastructure owns gateway and versioned release tooling; no shared release
engine or vendor pin changes are needed for these automation/documentation changes.
The corresponding application release remains independently authorized and verified.

M = matching shared source, E = tested equivalent, D = intentional difference,
N/A = no applicable runtime. Source hashes are in `BATCH3-PARITY-HASHES.json`.
Production identity, final-head CI/reviewer and ticket evidence are recorded in
the delivery receipts; a source match alone is not production acceptance.

| Capability | Canonical source | FullStackTemplate | Notoli | MacroMapper | Infrastructure | Verification / outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Bounded human discussion | Template collector, adopting existing downstream history | M | M | M | M | UTF-8/count/page caps, attribution, active older comments, hostile content and unavailable/fork/Dependabot regressions; normal PR logs show available attributed owner context |
| Own-feedback lifecycle | Template publisher/reconciler | M | M | M | M; D native inventory | Exact numeric App ownership, own-only conversations, cited ancestor-to-head source substitution, complete check/status/rule evidence, current-head and participant races; mutation/race paths mocked |
| Read/write credential boundary | Existing workflow token + separate persona App | E | E | E | E | Actual normal-PR read probes for checks/statuses/rules; App write capability remains contents-read/PR-write, repository credentials/projects remain separate |
| Reviewer config/usage | Template Responses policy | M | M | M | M | Accepted Luna/medium preserved; invalid config and missing/non-object usage tests; measured tokens/latency and dated partial estimates in existing summaries/logs, billed total unknown |
| Email failure foundation | MacroMapper's existing #324 plus Template HTML support | E; D HTML/reply-to | E | E, original #324 retained | N/A app reset mail | Matching generic send/log behavior and identical regression module; local 27/51/31 and independent VM 109 authentication tests pass; no real delivery experiment |
| Promotion summaries | Template deterministic helper/workflow | M; no active target | M | M | M; D gateway wording | Current base/head file metadata, one exact bot-owned upsert, no PR prose/secret values, pagination/updated heads/empty diffs/permissions/races; normal promotion PR verifies live adoption |
| Architecture documentation | Template Mermaid reference | M; D inventory | M; D inventory | M; D inventory | M; D Required CI/Gitleaks/gateway | Four diagrams parsed/rendered with Mermaid 12.3.0; source/needs/event/permission/action-consumer inventory verified from each repository's actual YAML |

## Conservative boundaries

The automated resolver is deliberately narrower than ordinary review: broad or
nonancestor fixes, long/shared conversations, uncertain source mapping and missing,
skipped or neutral required evidence stay open. Its optional resolution requires
successful full native scanner/test/lint inventories and other persona reviews;
normal path-based merge skips and native aggregate requirements are unchanged.
Read permission denial is visible; no App installation expansion is required.

Maintainer closure of addressed PR review feedback after final-head approval is
separate from live bot self-resolution acceptance. A successful native review or
read-only probe is not a live resolution test. See [the exact reviewer contract](../.github/AI-REVIEWERS.md).

Template retains its existing richer HTML/reply-to email payload behavior; all
apps retain their own sender and reset branding. The common reliability change
does not add retries, a queue or delivery webhooks. Provider acceptance is not
proof of inbox delivery. Shared tests use mocked providers and disposable data;
production public readiness does not exercise authenticated/reset mail delivery.

The promotion summary is informational and distinct from authorization. All
applications retain the Infrastructure-pinned release engine and existing
main-first process. The gateway keeps separate Required CI, secret scan, owner
checks, maintenance locking and unchanged-runtime behavior. FullStackTemplate
has no active production branch in the verified baseline; none is created here.

Protected Template #215 remains read-only. The remaining five tickets are tracked
with actual downstream acceptance; ticket state is not a parity signal. Cancelled
rollback/catch-all/ruleset projects and deferred research, Project-status automation
and Jules artifact cleanup are not introduced or resumed.
