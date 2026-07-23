# Next Actions: Judge Calibration

## Immediate

- [x] Define project brief
- [x] Record first design decisions in `docs/decisions.md`
- [x] Run first implementation (5 lib modules + CLI + 23 unit tests + 1 real E2E test, verified against a live model)
- [ ] Merge `agent/claude/build-calibration-harness` to `main` and push; confirm CI green on GitHub
- [ ] Link back from `agentic-tekton`'s post #7 brief and `docs/post-backlog.md`

## This Week

-

## Later

- An API-backed model backend (only Ollama exists today) - documented extension point, not built.
- Fuzzy/semantic dedup of failure-mode strings across personas (currently exact-string union
  only) - disclosed as a known limitation, not built.
