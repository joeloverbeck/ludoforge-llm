#!/usr/bin/env node
/**
 * Ad-hoc investigation (Spec 138 / I0): does the existing
 * `classifyMoveDecisionSequenceAdmissionForLegalMove` classifier
 * return 'satisfiable' / 'unsatisfiable' / 'unknown' for the
 * failing NVA march template on seeds 1002 and 1010, and what
 * are the probe-step / param-expansion warnings?
 *
 * Usage: node diagnose-existing-classifier.mjs --seed 1002 [--max-turns 200]
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = (() => {
  let cur = HERE;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur;
    cur = join(cur, '..');
  }
  return process.cwd();
})();

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const SEED = Number(getArg('seed', '1002'));
const MAX_TURNS = Number(getArg('max-turns', '200'));
const EVOLVED_SEAT = getArg('evolved-seat', 'arvn');
const PLAYER_COUNT = 4;

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));
const { assertValidatedGameDef, createGameDefRuntime } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));
const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));
const { classifyMoveDecisionSequenceAdmissionForLegalMove } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/move-decision-sequence.js'));
const { MISSING_BINDING_POLICY_CONTEXTS } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/missing-binding-policy.js'));
const { enumerateLegalMoves } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/legal-moves.js'));
const { completeMoveDecisionSequence } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/move-decision-completion.js'));
const { DEFAULT_MOVE_ENUMERATION_BUDGETS } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/move-enumeration-budgets.js'));

const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
const staged = runGameSpecStagesFromBundle(bundle);
if (staged.validation.blocked || staged.compilation.blocked) {
  console.error('Compilation/validation blocked');
  process.exit(1);
}
const def = assertValidatedGameDef(staged.compilation.result.gameDef);
const runtime = createGameDefRuntime(def);

const seats = def.seats ?? [];
const seatProfiles = seats.map((s) => {
  const sid = s.id.toLowerCase();
  return sid === EVOLVED_SEAT.toLowerCase() ? `${sid}-evolved` : `${sid}-baseline`;
});

// Instrument to intercept the first failing chooseMove call.
let capturedInput = null;
class CaptureAgent {
  constructor(config) {
    this.inner = new PolicyAgent(config);
  }
  chooseMove(input) {
    try {
      return this.inner.chooseMove(input);
    } catch (err) {
      if (capturedInput === null) {
        capturedInput = input;
      }
      throw err;
    }
  }
}

const agents = seatProfiles.map(
  (pid) => new CaptureAgent({ profileId: pid, traceLevel: 'summary' }),
);

console.error(`Running seed ${SEED} with max-turns=${MAX_TURNS}`);
try {
  const trace = runGame(def, SEED, agents, MAX_TURNS, PLAYER_COUNT, undefined, runtime);
  console.error(`Completed: stopReason=${trace.stopReason} turns=${trace.turnsCount} moves=${trace.moves.length}`);
} catch (err) {
  console.error(`Threw: ${err.message}`);
}

if (capturedInput === null) {
  console.error('\nNo capture — agent did not throw in this run.');
  process.exit(0);
}

console.error('\n=== EXISTING CLASSIFIER VERDICT ===');
console.error(`seed=${SEED} stateHash=${capturedInput.state.stateHash}`);
console.error(`legalMoves.length=${capturedInput.legalMoves.length}`);
console.error(`DEFAULT_MOVE_ENUMERATION_BUDGETS=${JSON.stringify(DEFAULT_MOVE_ENUMERATION_BUDGETS)}`);

// Re-enumerate to capture warnings fresh.
const freshEnum = enumerateLegalMoves(def, capturedInput.state, undefined, runtime);
console.error(`freshEnum.moves.length=${freshEnum.moves.length}`);
console.error(`freshEnum.warnings:`);
for (const w of freshEnum.warnings) {
  console.error(`  ${w.code}: ${w.message}`);
  if (w.context) {
    console.error(`    context=${JSON.stringify(w.context)}`);
  }
}

// For each legal move in the captured input, run the existing classifier directly.
for (let i = 0; i < capturedInput.legalMoves.length; i += 1) {
  const classified = capturedInput.legalMoves[i];
  const move = classified.move;
  console.error(`\n--- legalMove[${i}] actionId=${move.actionId} freeOp=${move.freeOperation ?? false} ---`);
  console.error(`  viability.viable=${classified.viability.viable} viability.complete=${classified.viability.complete ?? 'n/a'}`);

  // Direct classifier call: free-operation path context.
  const verdictWarnings = [];
  try {
    const verdict = classifyMoveDecisionSequenceAdmissionForLegalMove(
      def,
      capturedInput.state,
      move,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
      {
        budgets: DEFAULT_MOVE_ENUMERATION_BUDGETS,
        onWarning: (w) => verdictWarnings.push(w),
      },
      runtime,
    );
    console.error(`  existing-classifier verdict=${verdict}`);
    console.error(`  classifier warnings (${verdictWarnings.length}):`);
    for (const w of verdictWarnings) {
      console.error(`    ${w.code}: ${w.message}`);
      if (w.context) {
        console.error(`      context=${JSON.stringify(w.context)}`);
      }
    }
  } catch (e) {
    console.error(`  existing-classifier threw: ${e.message}`);
  }

  // Try the plain-action context too.
  const verdictWarnings2 = [];
  try {
    const verdict2 = classifyMoveDecisionSequenceAdmissionForLegalMove(
      def,
      capturedInput.state,
      move,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PLAIN_ACTION_DECISION_SEQUENCE,
      {
        budgets: DEFAULT_MOVE_ENUMERATION_BUDGETS,
        onWarning: (w) => verdictWarnings2.push(w),
      },
      runtime,
    );
    console.error(`  plain-action-context verdict=${verdict2}`);
    console.error(`  plain-action warnings (${verdictWarnings2.length}):`);
    for (const w of verdictWarnings2.slice(0, 3)) {
      console.error(`    ${w.code}: ${w.context ? JSON.stringify(w.context) : ''}`);
    }
  } catch (e) {
    console.error(`  plain-action-context threw: ${e.message}`);
  }

  // Count the chooseN option space by running completeMoveDecisionSequence with identity chooser.
  try {
    const seqResult = completeMoveDecisionSequence(def, capturedInput.state, move, {
      choose: () => undefined,
      chooseStochastic: () => undefined,
    }, runtime);
    if (seqResult.nextDecision) {
      console.error(`  head decision: type=${seqResult.nextDecision.type} min=${seqResult.nextDecision.min} max=${seqResult.nextDecision.max} options=${(seqResult.nextDecision.options ?? []).length}`);
    } else if (seqResult.complete) {
      console.error(`  complete=true (no head chooseN)`);
    } else if (seqResult.illegal) {
      console.error(`  illegal.reason=${seqResult.illegal.reason}`);
    }
  } catch (e) {
    console.error(`  completeMoveDecisionSequence identity threw: ${e.message}`);
  }
}
