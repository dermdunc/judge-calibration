# Decisions: Judge Calibration

## ADR Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-22 | Initial scaffold as factory-output | A provider-agnostic harness for calibrating an LLM judge against held-out human verdicts: multi-persona blind scoring, a hard fail-if-any-persona-flags-a-failure-mode gate, and a not_ready/provisional/calibrated verdict based on measured agreement. |
