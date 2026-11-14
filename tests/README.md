# 🧪 Notoli tests

This folder owns repository-tooling regressions. Application-specific tests
remain beside their backend and frontend code.

## 🧭 Suites

| Suite | Location |
| --- | --- |
| Bounded diagnostic logs | `tests/bounded-log.test.cjs` |
| GitHub action regressions | `.github/actions/` |
| ChatGPT manifests and package builders | [Package guide](../backend/app_mcp/chatgpt/README.md) |
| Development dependencies and repository validation | `tests/dev-dependencies.test.cjs`, `tests/repository-validation.test.cjs` |
| Backend application tests | [Backend README](../backend/README.md#-checks) |
| Frontend and browser tests | [Frontend README](../frontend/README.md#-checks) |
| Shared production release tests | `deploy/tests/`; see the [production guide](../deploy/production/README.md) |

## 💻 Run repository checks

From the repository root with Node.js, Python, and the required test tools:

```powershell
node --test tests/*.test.cjs
```

The template initializer suite also requires PowerShell 7 (`pwsh`). CI runs
action-specific JavaScript tests documented in the
[workflow reference](../.github/WORKFLOW-REFERENCE.md).

## ⚙️ Configuration validation

```powershell
python scripts/validate_repository.py
```

Install Actionlint, pinned PyYAML, Bash/Git Bash, PowerShell 7, and Docker
Compose first. The validator parses scripts/workflows and renders Compose
using synthetic environment files. It starts no containers and reads no
private environment files, databases, or certificates. Its one documented
Actionlint compatibility exception is GitHub's `vulnerability-alerts` scope.

## 🐳 Container and browser checks

Container smoke tests require a disposable Docker daemon. Development-image
checks use uniquely created volumes; template image checks build an initialized
sample application and verify assets and SPA fallback over loopback.
Browser tests use temporary SQLite and local file mail; follow the frontend
guide for dependencies, ports, and reports. Production rollout is separate.

## 📚 Further reading

- [Automation coverage](../docs/AUTOMATION-COVERAGE.md).
- [Workflow reference](../.github/WORKFLOW-REFERENCE.md).
- [Repository scripts](../scripts/README.md).
