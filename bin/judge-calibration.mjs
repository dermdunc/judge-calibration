#!/usr/bin/env node
import { calibrate } from '../lib/calibrate.mjs';
import { callModel as ollamaCallModel } from '../lib/backends/ollama.mjs';

function printHelp() {
  console.log(`judge-calibration

Calibrates an LLM judge against held-out human verdicts: runs a multi-persona
panel (correctness / rubric-literalist / gaming-detector) blind against each
fixture case, aggregates with a hard fail-if-any-persona-flags-a-failure-mode
gate, and compares the panel's pass/fail to what a human actually decided.
Reports agreement rate, false-approval rate (the dangerous direction - the
judge approved something a human rejected), false-rejection rate, and an
overall not_ready / provisional / calibrated verdict.

Usage:
  judge-calibration --fixtures <dir> --model <name> [options]

Options:
  --fixtures <dir>   Directory of fixture cases (default: ./fixtures)
  --model <name>     Model name to pass to the backend (required)
  --backend <name>   Backend to use (default: ollama; see README "Writing a backend")
  --json             Print the full result as JSON instead of text
  --help             Show this message

Also accepts --flag=value for any option above.
`);
}

function parseArgs(argv) {
  const args = { fixtures: './fixtures', model: null, backend: 'ollama', json: false, help: false };
  const needsValue = ['--fixtures', '--model', '--backend'];

  for (let i = 0; i < argv.length; i += 1) {
    let token = argv[i];
    let inlineValue = null;
    const eq = token.indexOf('=');
    if (token.startsWith('--') && eq !== -1) {
      inlineValue = token.slice(eq + 1);
      token = token.slice(0, eq);
    }

    if (needsValue.includes(token)) {
      let value = inlineValue;
      if (value === null) {
        const next = argv[i + 1];
        // None of --fixtures/--model/--backend's legitimate values start
        // with "--" (a path, a model name, a backend name never do), so
        // unlike a numeric-flag CLI (where a value like "-5" would need a
        // narrower check), any "--"-prefixed next token really is another
        // flag, not a value that happens to look like one.
        if (next === undefined || next.startsWith('--')) {
          console.error(`${token} requires a value`);
          process.exit(1);
        }
        value = next;
        i += 1;
      }
      args[token.slice(2)] = value;
    } else if (token === '--json' || token === '--help' || token === '-h') {
      // Boolean flags respect an inline value too (--json=false must NOT
      // set json:true) rather than only ever setting true regardless of
      // what followed "=" - the help text promises --flag=value works for
      // "any option above," not just the value-taking ones.
      const key = token === '-h' ? 'help' : token.slice(2);
      args[key] = inlineValue === null ? true : inlineValue !== 'false';
    } else {
      console.error(`Unknown option: ${token}\nRun with --help for usage.`);
      process.exit(1);
    }
  }
  return args;
}

const BACKENDS = { ollama: ollamaCallModel };

function formatPct(x) {
  return `${(x * 100).toFixed(0)}%`;
}

function printReport(result) {
  console.log(`Ran ${result.totalCases} fixture case(s)${result.erroredCases.length > 0 ? `, ${result.erroredCases.length} errored` : ''}\n`);
  for (const r of result.results) {
    const agreeFlag = r.agree ? 'agree' : 'DISAGREE';
    console.log(
      `  ${r.caseId}: human=${r.humanPass ? 'pass' : 'FAIL'} panel=${r.panelPass ? 'pass' : 'FAIL'} (${agreeFlag}, mean score ${r.meanScore.toFixed(2)})`,
    );
    if (r.failureModesTriggered.length > 0) {
      console.log(`    failure modes flagged: ${r.failureModesTriggered.join('; ')}`);
    }
  }
  for (const e of result.erroredCases) {
    console.log(`  ${e.caseId}: ERRORED - ${e.error}`);
  }

  console.log(`\nAgreement rate: ${formatPct(result.agreementRate)}`);
  console.log(`False-approval rate: ${formatPct(result.falseApprovalRate)} (judge approved what a human rejected - the dangerous direction)`);
  console.log(`False-rejection rate: ${formatPct(result.falseRejectionRate)} (judge rejected what a human approved)`);
  if (result.falseApprovalCases.length > 0) {
    console.log(`False approvals: ${result.falseApprovalCases.join(', ')}`);
  }
  console.log(`\nVerdict: ${result.verdict.toUpperCase()}`);
  if (result.verdictReason) {
    console.log(`(${result.verdictReason})`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.model) {
    console.error('--model is required\n');
    printHelp();
    process.exit(1);
  }
  const callModel = BACKENDS[args.backend];
  if (!callModel) {
    console.error(`Unknown backend: ${args.backend} (available: ${Object.keys(BACKENDS).join(', ')})`);
    process.exit(1);
  }

  let result;
  try {
    result = await calibrate(args.fixtures, {
      model: args.model,
      callModel,
      onCase: (r) => {
        if (!args.json) console.error(`  ...ran ${r.caseId}`);
      },
    });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  printReport(result);
}

main();
