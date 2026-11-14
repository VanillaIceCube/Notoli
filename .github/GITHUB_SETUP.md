# ⚙️ GitHub setup

Configure this repository before expecting its required pull-request and
security workflows to pass. Existing values belong to their original accounts;
source files do not provision GitHub Apps, secrets, or branch protection.

## 🚦 Before your first pull request

1. Enable Actions, dependency alerts, advanced CodeQL, and available secret
   scanning/push protection. Preserve the existing repository permissions.
2. Install the three reviewer GitHub Apps and configure their App ID variables.
3. Store each App private key and each separate reviewer OpenAI key in both
   Actions and Dependabot secrets. The six reviewer secrets are required in
   both stores; GitHub does not expose existing secret values for copying.
4. Configure the reviewer project variable, security-alert Project variable,
   and separate Project token. Keep production and application credentials separate.
5. Verify the required checks on a real PR and retain the existing branch rules.

## 🔑 Exact settings and verification

- [Reviewer keys, App identities, and deferred migration](WORKFLOW-REFERENCE.md#-separate-openai-reviewer-credentials).
- [Required main-branch checks](WORKFLOW-REFERENCE.md#main-branch-required-checks).
- [Dependabot isolation and auto-merge policy](WORKFLOW-REFERENCE.md#-protected-dependabot-auto-merge).
- [Security-alert credential and input contract](WORKFLOW-REFERENCE.md#security-alert-configuration-contract).
- [Reviewer feedback and recovery](AI-REVIEWERS.md).

Deployment credentials and production client registration belong to the
[production guide](../deploy/production/README.md). They are separate from
local application setup and reviewer configuration.
