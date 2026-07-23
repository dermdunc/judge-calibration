# Brief: Judge Calibration

> A provider-agnostic harness for calibrating an LLM judge against held-out human verdicts: multi-persona blind scoring, a hard fail-if-any-persona-flags-a-failure-mode gate, and a not_ready/provisional/calibrated verdict based on measured agreement.

## Problem

If an agentic pipeline uses an LLM to grade another LLM's output (an eval gate, an autograder, a
promotion check), the judge itself is usually never checked against real human verdicts before
being trusted to run unattended. It's trusted on vibes, not measurement. `local-llm-lab` already
proved a mechanism for closing that gap (a 3-persona panel, blind scoring, a hard
fail-if-any-persona-flags-a-failure-mode gate) but hardcoded it to one Terminal Velocity workshop
module - not something a reader outside that lab could point at or reuse.

## Outcome

A standalone, public, provider-agnostic CLI that runs the same panel mechanism against any
directory of fixture cases (task + rubric + candidate + a held-out human verdict), and reports
agreement rate, false-approval rate (the dangerous direction), false-rejection rate, and an
overall not_ready / provisional / calibrated verdict - so a judge earns trust before it gates
anything unattended, and a reader can run the exact worked example themselves. Ships as the
runnable companion artefact for Agentic Tekton's "LLM-as-Judge, and How Not to Fool Yourself"
essay.

## Constraints

- Generalize `local-llm-lab`'s existing, already-proven mechanism (persona-lens scoring,
  union-of-failure-modes gate, agreement/false-approval/false-rejection measurement) rather than
  reinventing it from scratch.
- Zero framework dependencies; a documented, pluggable backend interface so a local Ollama model
  isn't the only option long-term, even though it's the only backend built here.
- The tool's central claim (a 3-persona panel correctly distinguishes a real fix from a
  test-gaming attempt) had to be verified against a real model before shipping, not asserted from
  fakes alone.
- Public from day one (`dermdunc` account) - no employer detail, secrets, or private names.
