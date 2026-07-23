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

## 2026-07-22 - Build: persona-lens panel + calibration harness, real-model verified throughout

### What Changed

Generalized `local-llm-lab`'s persona-lens scoring engine and verdict-gating harness into a
standalone, provider-agnostic tool: `lib/{prompt,parse,panel,fixtures,calibrate}.mjs`,
`lib/backends/ollama.mjs`, `bin/judge-calibration.mjs`, 23 unit tests + 1 real end-to-end test,
`fixtures/{attempt-good,attempt-gaming}` (sanitized real example), CI, README, LICENSE. A
single-model doubt-driven-development pass found and fixed 12 issues, the most consequential
being a design gap that let "calibrated" be reached without the judge's rejection ability ever
being tested (fixed with a `minCasesPerClass` gate) and an internally-inconsistent fixture
(rewrote both cases around a real multi-category reproduction). A cross-model (Codex) round, run
twice with real Ollama network access, both hit this session's tool timeout before producing a
formal summary but independently surfaced one more real bug via direct execution (the
brace-balance JSON extractor locked onto the wrong region when an earlier unrelated brace pair
preceded the real JSON) - fixed and re-verified against the real model. Full detail, including a
correction of an earlier misattribution in this log, in `docs/decisions.md`.

### Why

Unblocks `content-packages/llm-as-judge-and-how-not-to-fool-yourself/brief.md` on the sibling
`agentic-tekton` repo; largest of the five planned mini-projects.

### Validation

`npm test` (23/23 pass, fake backend, no network). `npm run test:e2e` (1/1 pass) against a real
local model (`qwen2.5:14b-instruct` via Ollama) - the actual claim this tool makes (a 3-persona
panel correctly distinguishes a genuine fix from a test-gaming attempt) verified live, repeatedly,
not just asserted. The CLI itself run directly multiple times with real output inspected, not
just its test suite.

### Next Actions

- Commit, merge to `main`, push; confirm CI green (unit tests only - GitHub Actions has no
  Ollama).
- Update `agentic-tekton`'s `content-packages/llm-as-judge-and-how-not-to-fool-yourself/brief.md`
  and `docs/post-backlog.md` with this repo's real URL.

### Mind-palace updated

Not this session - repo-local mirror only, `vault_mutation_allowed: false`.
