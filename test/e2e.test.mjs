// Real end-to-end test against a live Ollama server, not fakes - this is
// the actual claim the tool exists to make: that it reproduces
// local-llm-lab's finding (a 3-persona panel run against a real model
// correctly distinguishes a genuine fix from a test-gaming attempt).
// Skips cleanly (not a failure) if Ollama isn't reachable, OR if it's
// reachable but the specific model isn't pulled, since CI doesn't have a
// model server - see README's CI section for why the calibration itself
// isn't part of the GitHub Actions workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate } from '../lib/calibrate.mjs';
import { callModel } from '../lib/backends/ollama.mjs';

const MODEL = process.env.JUDGE_CALIBRATION_TEST_MODEL ?? 'qwen2.5:14b-instruct';
const FIXTURES_DIR = new URL('../fixtures', import.meta.url).pathname;
const HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

// Distinguishes "Ollama isn't running" from "Ollama is running but this
// specific model isn't pulled" - a real gap the first version of this
// check had: it only tested reachability, so a missing model produced a
// hard test FAILURE deep inside calibrate() rather than the clean skip
// this file's own comment promised, on any dev machine with Ollama
// installed but a different set of models pulled (a very plausible state).
async function checkOllama() {
  let res;
  try {
    res = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
  } catch {
    return { reachable: false, modelPulled: false };
  }
  if (!res.ok) return { reachable: false, modelPulled: false };
  const data = await res.json().catch(() => null);
  const names = Array.isArray(data?.models) ? data.models.map((m) => m.name) : [];
  return { reachable: true, modelPulled: names.includes(MODEL) };
}

test('e2e: real 3-persona panel against a real model correctly distinguishes the good fix from the gaming attempt', async (t) => {
  const { reachable, modelPulled } = await checkOllama();
  if (!reachable) {
    t.skip(`Ollama not reachable at ${HOST} - skipping the real-model test`);
    return;
  }
  if (!modelPulled) {
    t.skip(`Ollama is reachable but "${MODEL}" is not pulled (\`ollama pull ${MODEL}\`) - skipping the real-model test`);
    return;
  }

  const result = await calibrate(FIXTURES_DIR, { model: MODEL, callModel });

  const good = result.results.find((r) => r.caseId === 'attempt-good');
  const gaming = result.results.find((r) => r.caseId === 'attempt-gaming');

  assert.ok(good, 'attempt-good fixture case ran');
  assert.ok(gaming, 'attempt-gaming fixture case ran');

  // The actual claim: the panel agrees with both human verdicts on a real
  // model, not just on fakes designed to agree.
  assert.equal(good.panelPass, true, `expected the real fix to pass; panel said: ${JSON.stringify(good)}`);
  assert.equal(
    gaming.panelPass,
    false,
    `expected the gaming attempt to fail; panel said: ${JSON.stringify(gaming)}`,
  );
  assert.ok(
    gaming.failureModesTriggered.length > 0,
    'expected at least one persona to name a specific failure mode for the gaming attempt, not just a low score',
  );
});
