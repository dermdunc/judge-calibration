# Judge Calibration — Plain-English Project Walkthrough

## What this project is in one paragraph

A provider-agnostic harness for calibrating an LLM judge against held-out human verdicts: multi-persona blind scoring, a hard fail-if-any-persona-flags-a-failure-mode gate, and a not_ready/provisional/calibrated verdict based on measured agreement.

## The simple analogy

Like calibrating a scale before you trust its readings: you don't just look at a scale and decide
it seems accurate. You weigh a few known objects, check the scale agrees with what you already
know, and only then trust it on things you don't know the weight of yet. This tool is that
calibration step for an AI judge, not a claim that the judge is trustworthy just because its
verdicts sound confident.

## What problem we are solving

Any pipeline that uses one LLM to grade another LLM's output usually skips the step of checking
whether the judge itself is any good. This tool runs the judge against cases with a known,
human-decided correct answer first, and refuses to call it "calibrated" unless it actually
demonstrated it can reject a bad submission, not just approve good ones.

## What we have built so far

- Scaffolded 2026-07-22 — repo and vault control plane created.
- Same day: the full harness built and shipped. A 3-persona scoring engine (correctness,
  rubric-literalist, gaming-detector - same model, three different lenses), a fixture format any
  reader can extend, a calibration report with agreement/false-approval/false-rejection rates, and
  a CLI. Verified against a real local model (`qwen2.5:14b-instruct`), not just simulated - the
  included worked example (a real bug fix versus a test-gaming attempt) reproduces
  `local-llm-lab`'s own original finding live.
- Two review passes (a single-model adversarial review, then a cross-model round using Codex)
  found and fixed 13 real issues, including a design flaw that would have let the tool call
  itself "calibrated" without ever actually testing whether the judge could reject a bad
  submission.

## How the pieces fit together

`lib/prompt.mjs` builds the same rubric-grounded question for every persona. `lib/panel.mjs` runs
all three personas against one candidate and combines their verdicts (mean score, plus a rule
where even one persona flagging a real problem fails the whole panel). `lib/calibrate.mjs` runs
that panel against every fixture case and compares the panel's answer to what a human already
decided, producing the final verdict. `lib/backends/ollama.mjs` is the only way it currently talks
to a model, but it's written so a different model backend could be swapped in without touching the
rest of the tool.

## What is deliberately not automated yet

There's no API-hosted model backend yet, only local Ollama - documented as an extension point, not
built, since verifying the tool's real claim needed a real local run, not another mock. There's
also no fuzzy matching of failure-mode wording across personas (two personas describing the same
real issue differently show up as two list entries, not deduplicated) - disclosed as a known
limitation in the README rather than solved with harder-to-verify NLP matching.

## How this could connect to the wider Hekton factory

This is the standalone, generalized version of a pattern `local-llm-lab` already proved once. It's
also a real candidate to become a formal, reusable `hekton-loops-lab` loop later: run panel →
compare to human labels → gate promotion → accumulate more labeled examples → recalibrate is
already shaped like the loop engine's own stage model (deterministic → judge → human_merge).

## Current confidence level

Medium-high — not just built, but verified live and repeatedly against a real model, with two
independent review passes. Confidence isn't "validated" outright because the calibration
verdict's own thresholds (what counts as "calibrated") are a disclosed policy choice, not a
discovered constant, and the tool has only ever been run against its own two included fixture
cases, not a larger real-world eval set yet.

## Open questions

- Would a real-world eval set (more than two fixture cases, covering more failure-mode variety)
  change confidence in the default verdict thresholds?
- Is the `minCasesPerClass` safety gate (added after a design review) set at the right default (1),
  or should a "real" calibration require more cases per class before trusting `calibrated`?

## Next recommended session

Draft the Agentic Tekton essay this tool is the companion artefact for
(`content-packages/llm-as-judge-and-how-not-to-fool-yourself/brief.md` in the sibling
`agentic-tekton` repo), or run the harness against a second, independent fixture set to see if the
calibrated verdict holds up beyond the two cases it shipped with.
