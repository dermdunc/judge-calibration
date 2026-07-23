// Models don't reliably emit bare JSON even when asked to, whatever the
// prompt says - a code fence, a leading "Here is the JSON:", or trailing
// commentary is common. Tries strict parsing first, then every balanced
// {...} substring found anywhere in the text in order, and only then gives
// up with an error that includes the raw text (truncated) so a failure is
// diagnosable, not a silent wrong score.
export function parseJudgeResponse(raw) {
  if (!raw || !raw.trim()) {
    throw new Error('empty response from model (network issue, refusal, or an empty completion)');
  }
  const attempts = [raw.trim(), ...extractAllBraceRegions(raw)];
  const errors = [];
  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      return normalize(parsed, raw);
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(
    `could not parse a judge JSON response after ${attempts.length} attempt(s): ${errors.join('; ')}\n` +
      `raw response (truncated): ${raw.slice(0, 300)}`,
  );
}

// Finds EVERY top-level balanced {...} region in the text, in order, not
// just the one starting at the first "{" - a real bug this fixes (found by
// actually running it, not by inspection): "prefix {not json} then
// {"score":0.8,...}" would lock onto the first brace pair ({not json}, a
// complete but wrong balanced region) and never reach the real JSON later
// in the string, because the old version returned on the FIRST balanced
// match it found rather than continuing to look. parseJudgeResponse tries
// each returned region in turn, so a later region is used once an earlier
// one fails to parse as valid JSON or fails normalize()'s score check.
//
// Also tracks whether we're inside a JSON string (so a brace character
// quoted inside a string value like "rationale": "uses a { character"
// doesn't miscount depth).
function extractAllBraceRegions(text) {
  const regions = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('{', i);
    if (start === -1) break;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let j = start; j < text.length; j += 1) {
      const ch = text[j];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }

    if (end === -1) break; // never balanced from here on - stop scanning
    regions.push(text.slice(start, end + 1));
    i = end + 1; // keep scanning after this region for another candidate
  }
  return regions;
}

function normalize(parsed, raw) {
  if (typeof parsed.score !== 'number' || Number.isNaN(parsed.score)) {
    throw new Error(`judge response missing a numeric "score" field: ${raw.slice(0, 200)}`);
  }
  return {
    score: Math.max(0, Math.min(1, parsed.score)),
    traitsMet: Array.isArray(parsed.traits_met) ? parsed.traits_met : [],
    traitsMissing: Array.isArray(parsed.traits_missing) ? parsed.traits_missing : [],
    failureModesTriggered: Array.isArray(parsed.failure_modes_triggered) ? parsed.failure_modes_triggered : [],
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
  };
}
