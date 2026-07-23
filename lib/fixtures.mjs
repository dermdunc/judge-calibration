import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// A fixture case is a directory with four files: task.md, rubric.json,
// candidate.md, human_verdict.json. Generalized from local-llm-lab's
// hardcoded Terminal Velocity Module 04 layout (transcript.txt/diff.patch
// specific to one workshop) into a directory-per-case shape usable for any
// judge-worthy task.
export function loadFixtures(fixturesDir) {
  const stat = statSync(fixturesDir, { throwIfNoEntry: false });
  if (!stat) {
    throw new Error(`fixtures directory not found: ${fixturesDir}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`not a directory: ${fixturesDir}`);
  }

  const entries = readdirSync(fixturesDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (entries.length === 0) {
    throw new Error(`no fixture case directories found under: ${fixturesDir}`);
  }

  return entries.map((entry) => loadCase(path.join(fixturesDir, entry.name), entry.name));
}

function loadCase(caseDir, caseId) {
  const required = ['task.md', 'rubric.json', 'candidate.md', 'human_verdict.json'];
  const missing = required.filter((f) => !statSync(path.join(caseDir, f), { throwIfNoEntry: false }));
  if (missing.length > 0) {
    throw new Error(`fixture case "${caseId}" is missing required file(s): ${missing.join(', ')}`);
  }

  const task = readFileSync(path.join(caseDir, 'task.md'), 'utf8');
  const candidate = readFileSync(path.join(caseDir, 'candidate.md'), 'utf8');
  const rubricRaw = readFileSync(path.join(caseDir, 'rubric.json'), 'utf8');
  const verdictRaw = readFileSync(path.join(caseDir, 'human_verdict.json'), 'utf8');

  let rubric;
  let humanVerdict;
  try {
    rubric = JSON.parse(rubricRaw);
  } catch (err) {
    throw new Error(`fixture case "${caseId}": rubric.json is not valid JSON (${err.message})`);
  }
  try {
    humanVerdict = JSON.parse(verdictRaw);
  } catch (err) {
    throw new Error(`fixture case "${caseId}": human_verdict.json is not valid JSON (${err.message})`);
  }
  if (typeof humanVerdict.pass !== 'boolean') {
    throw new Error(`fixture case "${caseId}": human_verdict.json must have a boolean "pass" field`);
  }

  return { caseId, task, candidate, rubric, humanVerdict };
}
