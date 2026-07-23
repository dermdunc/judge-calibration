import { loadFixtures } from './fixtures.mjs';
import { runPanel } from './panel.mjs';

// Verdict thresholds - a policy choice, disclosed here rather than hidden
// inside a comparison, and overridable via options. False-approval rate
// (the judge says something's fine when a human says it isn't) is weighted
// far more heavily than false-rejection (the judge says something's wrong
// when a human says it's fine): a lenient judge that lets bad work through
// is the dangerous failure mode for a gate; an overly strict judge is
// merely annoying. "calibrated" requires ZERO false approvals in the
// fixture set, not just a low rate - a judge that's ever approved
// something a human rejected hasn't earned unattended trust yet.
//
// minCasesPerClass guards a real gap this went through once with: a
// fixture set containing only human-PASS cases trivially reports 0% false
// approvals (there are no human-fail cases to be falsely approved) and
// could reach "calibrated" without the judge's ability to reject a bad
// submission ever having been exercised at all - the exact thing this tool
// exists to check. Requiring at least one case of EACH human verdict
// before "calibrated"/"provisional" is even reachable closes that gap.
const DEFAULT_THRESHOLDS = {
  calibratedMinAgreement: 0.9,
  calibratedMaxFalseApproval: 0,
  provisionalMinAgreement: 0.7,
  provisionalMaxFalseApproval: 0.2,
  minCasesPerClass: 1,
};

export async function calibrate(fixturesDir, { model, callModel, personas, thresholds = {}, onCase = () => {} }) {
  const cases = loadFixtures(fixturesDir);
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  const results = [];
  const errors = [];
  for (const c of cases) {
    // Per-case isolation: one bad response (a network hiccup, a persona
    // refusal, a genuinely malformed reply) must not silently discard
    // every other case's already-completed work. An errored case is
    // recorded and excluded from the rate math below, not counted as
    // either a pass or a fail.
    try {
      const panel = await runPanel({
        task: c.task,
        rubric: c.rubric,
        candidate: c.candidate,
        model,
        callModel,
        personas,
      });
      const result = {
        caseId: c.caseId,
        humanPass: c.humanVerdict.pass,
        panelPass: panel.panelPass,
        meanScore: panel.meanScore,
        failureModesTriggered: panel.failureModesTriggered,
        agree: panel.panelPass === c.humanVerdict.pass,
        personaResults: panel.personaResults,
        error: null,
      };
      results.push(result);
      onCase(result);
    } catch (err) {
      const errored = { caseId: c.caseId, error: err.message };
      errors.push(errored);
      onCase({ caseId: c.caseId, error: err.message });
    }
  }

  const total = results.length;
  const agreementCount = results.filter((r) => r.agree).length;
  const agreementRate = total === 0 ? 0 : agreementCount / total;

  const humanFailCases = results.filter((r) => r.humanPass === false);
  const falseApprovals = humanFailCases.filter((r) => r.panelPass === true);
  const falseApprovalRate = humanFailCases.length === 0 ? 0 : falseApprovals.length / humanFailCases.length;

  const humanPassCases = results.filter((r) => r.humanPass === true);
  const falseRejections = humanPassCases.filter((r) => r.panelPass === false);
  const falseRejectionRate = humanPassCases.length === 0 ? 0 : falseRejections.length / humanPassCases.length;

  let verdict;
  let verdictReason = null;
  if (errors.length > 0) {
    verdict = 'not_ready';
    verdictReason = `${errors.length} case(s) errored and produced no result - results are incomplete`;
  } else if (humanPassCases.length < t.minCasesPerClass || humanFailCases.length < t.minCasesPerClass) {
    verdict = 'not_ready';
    verdictReason = `fixture set needs at least ${t.minCasesPerClass} case(s) of each human verdict to mean anything - got ${humanPassCases.length} pass, ${humanFailCases.length} fail`;
  } else if (agreementRate >= t.calibratedMinAgreement && falseApprovalRate <= t.calibratedMaxFalseApproval) {
    verdict = 'calibrated';
  } else if (agreementRate >= t.provisionalMinAgreement && falseApprovalRate <= t.provisionalMaxFalseApproval) {
    verdict = 'provisional';
  } else {
    verdict = 'not_ready';
  }

  return {
    verdict,
    verdictReason,
    totalCases: total,
    erroredCases: errors,
    agreementRate,
    falseApprovalRate,
    falseRejectionRate,
    falseApprovalCases: falseApprovals.map((r) => r.caseId),
    falseRejectionCases: falseRejections.map((r) => r.caseId),
    thresholds: t,
    results,
  };
}
