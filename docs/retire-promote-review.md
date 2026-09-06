# Retire / Promote Review: Judge Calibration

Review default: factory output does not automatically promote to platform, but learnings may become templates or platform backlog.

**Last updated:** 2026-09-06 (first real review since scaffold; part of a factory-wide dormant-project sweep).

## Retire / Promote Review

### Current state
Archived, 2026-09-06.

### Evidence gathered
- Built 2026-07-22, generalized from `local-llm-lab`'s persona-lens/verdict-gating harness into a provider-agnostic judge-calibration tool, verified live against a real model (`qwen2.5:14b-instruct`).
- Doubt-driven-development pass (Explore agent) found and fixed 10 issues; cross-model review (Codex, gpt-5.5) found and fixed one more, deeper instance of the same bug class — both recorded in `docs/decisions.md`, including a self-correction of a prior misattribution rather than silently editing history.
- Blog post published in `agentic-tekton`'s post-backlog, marked shipped.
- No commits since 2026-07-26 (the shared 2026-07-31 commit across several factory-output repos was housekeeping, not project activity).
- Grepped the rest of the monorepo: `hekton-assurance-lab`'s active planning docs cite this project by name as a "discipline" precedent (conceptual reference, not a functional dependency or import). No project's `depends_on`/`enables`/`consumes` field references it.

### Value score
- Reuse: Low-Medium. No project imports the code, but the design pattern (persona-lens scoring, hard fail-gate, agreement measurement) is cited as precedent elsewhere.
- Clarity: High. README and decisions log are accurate; the harness's own limitations (timeouts on two of three cross-model review attempts) are disclosed, not hidden.
- Automation: Medium. Runnable CLI/harness, no scheduled or hooked usage.
- Decision quality: High. Two independent review rounds, including a same-repo self-correction of an earlier misattributed finding.
- Strategic leverage: Low-Medium. The method is influential as a reference design, but this repo itself is not infrastructure anything currently runs against.

### Cognitive load score
Low. Self-contained harness; no dependents to break by archiving.

### Recommendation
Retire (archive).

### Rationale
The deliverable shipped (working harness, live-model-verified, published blog post), the intended purpose is complete, and the only inbound reference found across the whole monorepo is a conceptual citation (not a functional dependency) in `hekton-assurance-lab`'s planning docs — archiving this repo does not break anything, since nothing imports or runs it.

### Next action
1. Archive banner added to `README.md` (this session).
2. `.hekton/project.yaml` flipped to `status: archived` / `lifecycle_stage: archived` (this session).
3. GitHub repo archived: `gh repo archive dermdunc/judge-calibration` (this session, per `promotion-rules.md`'s archive-immediately rule).
