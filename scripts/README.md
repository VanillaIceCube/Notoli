# 🧰 Notoli scripts

Repository maintenance helpers live here. Run documented commands from the
repository root with the dependencies required by the relevant guide.

## 🧭 Script index

| Script | Purpose |
| --- | --- |
| [bounded_log.py](bounded_log.py) | Bound reviewer logs while retaining early, failing, and late evidence. |
| [check_app_mcp.py](check_app_mcp.py) | Verify shared Python framework hashes against the canonical source pin. |
| [ci_architecture.py](ci_architecture.py) | Validate documented CI contracts and regenerate the source inventory. |
| [collect_browser_artifacts.py](collect_browser_artifacts.py) | Collect a bounded set of generated browser failure artifacts. |
| [e2e_backend.py](e2e_backend.py) | Start only the isolated loopback backend used by browser tests. |
| [e2e_settings.py](e2e_settings.py) | Disposable test settings; excludes developer and production environment files. |
| [install_actionlint.sh](install_actionlint.sh) | Install the pinned, checksum-verified Linux Actionlint release. |
| [run_e2e.cjs](run_e2e.cjs) | Run isolated frontend/backend browser journeys and remove their generated state. |
| [test_dev_container.py](test_dev_container.py) | Verify dependency startup with a disposable Docker volume. |
| [validate_repository.py](validate_repository.py) | Validate workflow/script syntax and synthetic Compose configuration. |

## 🔌 MCP maintenance

See the [framework README](../backend/app_mcp/README.md) for canonical
source ownership, manifests, and the local `--source-root` verification option.

## 📚 Further reading

- [Tests and validation](../tests/README.md).
- [GitHub setup and workflows](../.github/README.md).
- [Documentation index](../docs/README.md).
