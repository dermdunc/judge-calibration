# Session Log: Judge Calibration

## 2026-07-22 - Initial scaffold

Project scaffolded as **factory-output**. Purpose: A provider-agnostic harness for calibrating an LLM judge against held-out human verdicts: multi-persona blind scoring, a hard fail-if-any-persona-flags-a-failure-mode gate, and a not_ready/provisional/calibrated verdict based on measured agreement.

### Decisions Made

- Classification: factory-output
- Owner: dermdunc
- Vault mutation: not allowed by default (see `vault_mutation_allowed` in `.hekton/project.yaml` for the authoritative, current value)
- Promotion target: none

### Next Actions

- Define brief and first phase plan
- Add first implementation
- Record initial decisions
