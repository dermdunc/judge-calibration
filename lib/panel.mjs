import { PERSONAS, buildJudgePrompt } from './prompt.mjs';
import { parseJudgeResponse } from './parse.mjs';

// One model, run once per persona under a different system prompt - not
// three different models. Aggregation, generalized from
// local-llm-lab/scripts/workshop_judge_panel_spike.py: mean of the persona
// scores; failure modes are the UNION across personas (any one persona
// flagging a real problem counts); panelPass requires both the mean to
// clear the rubric's minimum AND zero failure modes flagged by ANY
// persona - a single persona catching a gaming behavior fails the whole
// panel regardless of what the other two scored.
export async function runPanel({ task, rubric, candidate, model, callModel, personas = PERSONAS }) {
  const personaList = Object.values(personas);
  const userPrompt = buildJudgePrompt({ task, rubric, candidate });

  // Personas are independent (same task/rubric/candidate, different system
  // prompts only) - nothing requires them to run in order, so they run
  // concurrently. A single local Ollama server may still serialize the
  // actual generation queue-side, but an API-backed or multi-GPU backend
  // genuinely benefits, and there's no correctness reason to force serial.
  const results = await Promise.all(
    personaList.map(async (persona) => {
      const raw = await callModel({ systemPrompt: persona.systemPrompt, userPrompt, model });
      try {
        return { personaId: persona.id, ...parseJudgeResponse(raw) };
      } catch (err) {
        throw new Error(`persona "${persona.id}" failed: ${err.message}`);
      }
    }),
  );

  const meanScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const failureModesTriggered = [...new Set(results.flatMap((r) => r.failureModesTriggered))];
  const minimumScore = rubric.minimumScore ?? 0.75;
  const panelPass = meanScore >= minimumScore && failureModesTriggered.length === 0;

  return {
    personaResults: results,
    meanScore,
    failureModesTriggered,
    panelPass,
  };
}
