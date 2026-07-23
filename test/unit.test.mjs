import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildJudgePrompt, PERSONAS } from '../lib/prompt.mjs';
import { parseJudgeResponse } from '../lib/parse.mjs';
import { runPanel } from '../lib/panel.mjs';
import { loadFixtures } from '../lib/fixtures.mjs';
import { calibrate } from '../lib/calibrate.mjs';

// --- prompt.mjs ---

test('buildJudgePrompt includes the task, traits, failure modes, and candidate verbatim', () => {
  const prompt = buildJudgePrompt({
    task: 'fix the widget',
    rubric: { expectedTraits: ['trait A'], failureModes: ['mode B'], minimumScore: 0.8 },
    candidate: 'here is my diff',
  });
  assert.match(prompt, /fix the widget/);
  assert.match(prompt, /trait A/);
  assert.match(prompt, /mode B/);
  assert.match(prompt, /0\.8/);
  assert.match(prompt, /here is my diff/);
});

test('PERSONAS has exactly the three documented personas, each with a distinct system prompt', () => {
  const ids = Object.keys(PERSONAS);
  assert.deepEqual(ids.sort(), ['correctness', 'gaming-detector', 'rubric-literalist']);
  const prompts = new Set(Object.values(PERSONAS).map((p) => p.systemPrompt));
  assert.equal(prompts.size, 3, 'each persona must have a genuinely different system prompt');
});

// --- parse.mjs ---

test('parseJudgeResponse: clean JSON parses directly', () => {
  const r = parseJudgeResponse('{"score": 0.9, "traits_met": ["a"], "traits_missing": [], "failure_modes_triggered": [], "rationale": "good"}');
  assert.equal(r.score, 0.9);
  assert.deepEqual(r.traitsMet, ['a']);
});

test('parseJudgeResponse: JSON wrapped in a markdown code fence and leading prose is still extracted', () => {
  const raw = 'Here is my assessment:\n```json\n{"score": 0.5, "traits_met": [], "traits_missing": [], "failure_modes_triggered": ["x"], "rationale": "meh"}\n```\nHope that helps!';
  const r = parseJudgeResponse(raw);
  assert.equal(r.score, 0.5);
  assert.deepEqual(r.failureModesTriggered, ['x']);
});

test('parseJudgeResponse: score is clamped to [0,1]', () => {
  assert.equal(parseJudgeResponse('{"score": 1.5}').score, 1);
  assert.equal(parseJudgeResponse('{"score": -0.5}').score, 0);
});

test('parseJudgeResponse: a stray brace in trailing prose after the real JSON no longer breaks extraction', () => {
  // The naive "first { to last }" approach this replaced would grab
  // everything from the JSON's opening brace through the LAST brace in the
  // whole string, including this trailing aside - genuinely balanced
  // brace-depth tracking is what makes this work.
  const raw = '{"score": 0.9, "traits_met": [], "traits_missing": [], "failure_modes_triggered": [], "rationale": "fine"} Let me know if you have other questions {smiley}.';
  const r = parseJudgeResponse(raw);
  assert.equal(r.score, 0.9);
});

test('parseJudgeResponse: an unrelated balanced brace pair BEFORE the real JSON no longer wins over it', () => {
  // A real bug the first brace-balance implementation had (found only by
  // running it, not by reading it): it located the FIRST "{" and returned
  // as soon as ITS matching "}" closed, so an earlier, unrelated balanced
  // region (syntactically invalid JSON, or valid JSON missing "score")
  // permanently won, and the real JSON later in the string was never even
  // considered. Fixed to scan for every balanced region in order and try
  // each until one actually parses as a valid judge response.
  const invalidFirst = 'prefix {not json} then {"score": 0.8, "traits_met": [], "traits_missing": [], "failure_modes_triggered": [], "rationale": "ok"}';
  assert.equal(parseJudgeResponse(invalidFirst).score, 0.8);

  const validButWrongFirst = 'earlier unrelated {"foo": 1} object then {"score": 0.6, "traits_met": [], "traits_missing": [], "failure_modes_triggered": [], "rationale": "ok"}';
  assert.equal(parseJudgeResponse(validButWrongFirst).score, 0.6);
});

test('parseJudgeResponse: a brace character inside a JSON string value does not confuse depth tracking', () => {
  const raw = '{"score": 0.7, "traits_met": [], "traits_missing": [], "failure_modes_triggered": [], "rationale": "uses a { character in prose }"}';
  const r = parseJudgeResponse(raw);
  assert.equal(r.score, 0.7);
  assert.match(r.rationale, /\{ character/);
});

test('parseJudgeResponse: an empty response gives a specific "empty response" error, not a blank/confusing one', () => {
  assert.throws(() => parseJudgeResponse(''), /empty response from model/);
  assert.throws(() => parseJudgeResponse('   \n  '), /empty response from model/);
});

test('parseJudgeResponse: missing score throws a diagnosable error, not a silent wrong value', () => {
  assert.throws(() => parseJudgeResponse('{"traits_met": []}'), /missing a numeric "score"/);
});

test('parseJudgeResponse: completely unparseable text throws with the raw text included', () => {
  assert.throws(() => parseJudgeResponse('I cannot help with that.'), /could not parse/);
});

// --- panel.mjs (fake backend, no real model call) ---

function fakeBackend(responsesByPersona) {
  return async ({ systemPrompt }) => {
    const persona = Object.values(PERSONAS).find((p) => p.systemPrompt === systemPrompt);
    if (!persona) throw new Error('unrecognized system prompt in test fake');
    const response = responsesByPersona[persona.id];
    if (!response) throw new Error(`fake backend has no canned response for persona "${persona.id}"`);
    return JSON.stringify(response);
  };
}

test('runPanel: aggregates mean score and unions failure modes across personas', async () => {
  const callModel = fakeBackend({
    correctness: { score: 0.9, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' },
    'rubric-literalist': { score: 0.8, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' },
    'gaming-detector': { score: 1.0, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' },
  });
  const panel = await runPanel({
    task: 't',
    rubric: { minimumScore: 0.75 },
    candidate: 'c',
    model: 'fake',
    callModel,
  });
  assert.ok(Math.abs(panel.meanScore - 0.9) < 1e-9);
  assert.deepEqual(panel.failureModesTriggered, []);
  assert.equal(panel.panelPass, true);
});

test('runPanel: a single persona flagging a failure mode fails the WHOLE panel, even with a high mean score', async () => {
  const callModel = fakeBackend({
    correctness: { score: 0.95, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' },
    'rubric-literalist': { score: 0.9, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' },
    'gaming-detector': {
      score: 0.95,
      traits_met: [],
      traits_missing: [],
      failure_modes_triggered: ['rewrote the test instead of fixing the bug'],
      rationale: 'gaming detected',
    },
  });
  const panel = await runPanel({ task: 't', rubric: { minimumScore: 0.75 }, candidate: 'c', model: 'fake', callModel });
  assert.ok(panel.meanScore > 0.9, 'mean score alone would look like a clear pass');
  assert.equal(panel.panelPass, false, 'the union-of-failure-modes gate must override a high mean score');
});

test('runPanel: mean score below the rubric minimum fails, even with zero failure modes flagged', async () => {
  const callModel = fakeBackend({
    correctness: { score: 0.5, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' },
    'rubric-literalist': { score: 0.5, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' },
    'gaming-detector': { score: 0.5, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' },
  });
  const panel = await runPanel({ task: 't', rubric: { minimumScore: 0.75 }, candidate: 'c', model: 'fake', callModel });
  assert.equal(panel.panelPass, false);
});

// --- fixtures.mjs ---

// Always async and always awaits fn(dir) before cleanup - a non-async
// version that just does `return fn(dir)` looks like it works for a
// callback with exactly one top-level await (the directory read already
// completed synchronously before that first await yields control back
// here), but silently deletes the directory mid-flight for any callback
// that awaits more than once, e.g. two sequential calibrate() calls in the
// same test. Found by an actual test failure, not spotted by inspection.
async function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'judge-calibration-test-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeCase(dir, caseId, { task, rubric, candidate, humanVerdict }) {
  const caseDir = path.join(dir, caseId);
  mkdirSync(caseDir, { recursive: true });
  writeFileSync(path.join(caseDir, 'task.md'), task);
  writeFileSync(path.join(caseDir, 'rubric.json'), JSON.stringify(rubric));
  writeFileSync(path.join(caseDir, 'candidate.md'), candidate);
  writeFileSync(path.join(caseDir, 'human_verdict.json'), JSON.stringify(humanVerdict));
}

test('loadFixtures: loads every case directory and parses its four files', async () => {
  await withTempDir((dir) => {
    writeCase(dir, 'case-a', {
      task: 'do the thing',
      rubric: { expectedTraits: ['t1'], failureModes: [], minimumScore: 0.75 },
      candidate: 'my answer',
      humanVerdict: { pass: true },
    });
    const cases = loadFixtures(dir);
    assert.equal(cases.length, 1);
    assert.equal(cases[0].caseId, 'case-a');
    assert.equal(cases[0].task, 'do the thing');
    assert.equal(cases[0].humanVerdict.pass, true);
  });
});

test('loadFixtures: missing required file in a case gives a clear per-case error, not a generic crash', async () => {
  await withTempDir((dir) => {
    mkdirSync(path.join(dir, 'broken-case'));
    writeFileSync(path.join(dir, 'broken-case', 'task.md'), 'x');
    // rubric.json, candidate.md, human_verdict.json all missing.
    assert.throws(() => loadFixtures(dir), /broken-case.*missing required file/s);
  });
});

test('loadFixtures: human_verdict.json without a boolean "pass" field is rejected', async () => {
  await withTempDir((dir) => {
    const caseDir = path.join(dir, 'bad-verdict');
    mkdirSync(caseDir);
    writeFileSync(path.join(caseDir, 'task.md'), 'x');
    writeFileSync(path.join(caseDir, 'rubric.json'), '{}');
    writeFileSync(path.join(caseDir, 'candidate.md'), 'x');
    writeFileSync(path.join(caseDir, 'human_verdict.json'), '{"pass": "yes"}');
    assert.throws(() => loadFixtures(dir), /boolean "pass"/);
  });
});

test('loadFixtures: empty fixtures directory throws a clear error', async () => {
  await withTempDir((dir) => {
    assert.throws(() => loadFixtures(dir), /no fixture case directories/);
  });
});

// --- calibrate.mjs (fake backend, synthetic fixture set) ---

test('calibrate: 100% agreement, zero false approvals -> calibrated', async () => {
  await withTempDir(async (dir) => {
    writeCase(dir, 'good', {
      task: 't',
      rubric: { minimumScore: 0.75 },
      candidate: 'MARKER_GOOD this is a clean fix',
      humanVerdict: { pass: true },
    });
    writeCase(dir, 'bad', {
      task: 't',
      rubric: { minimumScore: 0.75 },
      candidate: 'MARKER_BAD this rewrote the test instead of fixing the bug',
      humanVerdict: { pass: false },
    });

    // Keyed off the candidate content actually present in the prompt, not
    // call order - realistic (a real judge reads what it's shown) and
    // robust to loadFixtures' directory-listing order.
    const callModel = async ({ userPrompt }) => {
      if (userPrompt.includes('MARKER_GOOD')) {
        return JSON.stringify({ score: 0.95, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' });
      }
      if (userPrompt.includes('MARKER_BAD')) {
        return JSON.stringify({ score: 0.95, traits_met: [], traits_missing: [], failure_modes_triggered: ['gaming'], rationale: '' });
      }
      throw new Error('test fake received an unexpected prompt');
    };

    const result = await calibrate(dir, { model: 'fake', callModel });
    assert.equal(result.agreementRate, 1);
    assert.equal(result.falseApprovalRate, 0);
    assert.equal(result.verdict, 'calibrated');
  });
});

test('calibrate: judge approves a human-rejected case -> false approval, verdict is not calibrated', async () => {
  await withTempDir(async (dir) => {
    writeCase(dir, 'gaming-case', {
      task: 't',
      rubric: { minimumScore: 0.75 },
      candidate: 'c',
      humanVerdict: { pass: false },
    });
    // Judge wrongly approves it (no failure modes flagged, high score).
    const callModel = async () =>
      JSON.stringify({ score: 0.95, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' });

    const result = await calibrate(dir, { model: 'fake', callModel });
    assert.equal(result.falseApprovalRate, 1);
    assert.deepEqual(result.falseApprovalCases, ['gaming-case']);
    assert.notEqual(result.verdict, 'calibrated');
  });
});

test('calibrate: verdict thresholds are overridable via options', async () => {
  await withTempDir(async (dir) => {
    // Both classes present so this exercises threshold overrides, not the
    // separate minCasesPerClass gate (covered by its own test below).
    writeCase(dir, 'case-a', { task: 't', rubric: { minimumScore: 0.75 }, candidate: 'c', humanVerdict: { pass: true } });
    writeCase(dir, 'case-b', { task: 't', rubric: { minimumScore: 0.75 }, candidate: 'c', humanVerdict: { pass: false } });
    // A judge that always scores low and flags nothing: disagrees with
    // case-a (human said pass), agrees with case-b (human said fail) -
    // 50% agreement, 0% false approval (case-b's human-fail correctly
    // wasn't approved).
    const callModel = async () =>
      JSON.stringify({ score: 0.3, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' });
    // Default thresholds: 50% agreement is below the 70% provisional floor.
    const defaultResult = await calibrate(dir, { model: 'fake', callModel });
    assert.equal(defaultResult.verdict, 'not_ready');
    // Overridden to accept 50% agreement as "provisional".
    const overridden = await calibrate(dir, {
      model: 'fake',
      callModel,
      thresholds: { provisionalMinAgreement: 0.5 },
    });
    assert.equal(overridden.verdict, 'provisional');
  });
});

test('calibrate: a fixture set with only one human-verdict class can never reach calibrated/provisional, even with perfect agreement', async () => {
  await withTempDir(async (dir) => {
    writeCase(dir, 'only-pass', { task: 't', rubric: { minimumScore: 0.75 }, candidate: 'c', humanVerdict: { pass: true } });
    // Judge agrees perfectly with the one case it saw.
    const callModel = async () =>
      JSON.stringify({ score: 0.95, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' });
    const result = await calibrate(dir, { model: 'fake', callModel });
    assert.equal(result.agreementRate, 1, 'sanity check: agreement really is perfect on the raw math');
    assert.equal(
      result.verdict,
      'not_ready',
      'a judge that has never been asked to reject anything has not demonstrated it can',
    );
    assert.match(result.verdictReason, /at least 1 case\(s\) of each human verdict/);
  });
});

test('calibrate: one case erroring does not discard the other cases\' results, and forces not_ready', async () => {
  await withTempDir(async (dir) => {
    writeCase(dir, 'good-case', { task: 't', rubric: { minimumScore: 0.75 }, candidate: 'GOOD', humanVerdict: { pass: true } });
    writeCase(dir, 'broken-case', { task: 't', rubric: { minimumScore: 0.75 }, candidate: 'BROKEN', humanVerdict: { pass: false } });

    const callModel = async ({ userPrompt }) => {
      if (userPrompt.includes('BROKEN')) return ''; // triggers the empty-response error
      return JSON.stringify({ score: 0.95, traits_met: [], traits_missing: [], failure_modes_triggered: [], rationale: '' });
    };

    const result = await calibrate(dir, { model: 'fake', callModel });
    assert.equal(result.totalCases, 1, 'only the successful case counts toward totalCases');
    assert.equal(result.erroredCases.length, 1);
    assert.equal(result.erroredCases[0].caseId, 'broken-case');
    assert.match(result.erroredCases[0].error, /empty response from model/);
    assert.equal(result.results[0].caseId, 'good-case', 'the successful case still produced a real result');
    assert.equal(result.verdict, 'not_ready');
    assert.match(result.verdictReason, /errored/);
  });
});
