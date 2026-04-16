#!/usr/bin/env node
/**
 * Diagnostic: reproduce an agentStuck seed with instrumentation.
 *
 * Wraps PolicyAgent.chooseMove to capture:
 *   - the legal moves available (actionIds + viability.code)
 *   - the state hash and active player
 *   - the phase1 selected actionId
 *   - whether prepared.completedMoves and prepared.stochasticMoves were empty
 *   - whether broader fallback was also empty
 *   - last N moves leading to the failure
 *
 * Usage: node diagnose-agent-stuck.mjs --seed 1000 [--max-turns 200]
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
const SEED = Number(getArg('seed', '1000'));
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
const { preparePlayableMoves } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/prepare-playable-moves.js'));
const { completeTemplateMove } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/move-completion.js'));
const { probeMoveViability } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/apply-move.js'));
const { completeMoveDecisionSequence } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/move-decision-completion.js'));
const { enumerateLegalMoves } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/legal-moves.js'));

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

// Wrap PolicyAgent to capture failure context.
class InstrumentedPolicyAgent {
  constructor(config) {
    this.inner = new PolicyAgent(config);
    this.profileId = config.profileId;
    this.moveCount = 0;
  }
  chooseMove(input) {
    this.moveCount++;
    try {
      return this.inner.chooseMove(input);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('could not derive a playable move')) {
        throw err;
      }
      // Instrument: rerun the failing prep path and log.
      console.error('\n=== AGENT STUCK DIAGNOSTIC ===');
      console.error(`seed=${SEED} profile=${this.profileId} player=${input.playerId} moveCount=${this.moveCount}`);
      console.error(`stateHash=${input.state.stateHash}`);
      console.error(`activePlayer=${input.state.activePlayer} turnCount=${input.state.turnCount}`);
      console.error(`legalMoves.length=${input.legalMoves.length}`);

      // Tally legal moves by actionId + viability code.
      const byAction = new Map();
      const byViability = new Map();
      for (const cm of input.legalMoves) {
        const aid = String(cm.move.actionId);
        byAction.set(aid, (byAction.get(aid) ?? 0) + 1);
        const vcode = cm.viability.viable ? 'VIABLE' : (cm.viability.code ?? 'UNKNOWN');
        byViability.set(vcode, (byViability.get(vcode) ?? 0) + 1);
      }
      console.error('legalMoves by actionId:');
      for (const [k, v] of [...byAction.entries()].sort((a, b) => b[1] - a[1])) {
        console.error(`  ${k}: ${v}`);
      }
      console.error('legalMoves by viability code:');
      for (const [k, v] of [...byViability.entries()].sort((a, b) => b[1] - a[1])) {
        console.error(`  ${k}: ${v}`);
      }

      // Show first few non-viable moves' detail.
      const nonViable = input.legalMoves.filter((cm) => !cm.viability.viable).slice(0, 5);
      console.error(`First ${nonViable.length} non-viable moves:`);
      for (const cm of nonViable) {
        const ctx = cm.viability.context ?? {};
        console.error(`  actionId=${cm.move.actionId} code=${cm.viability.code} reason=${ctx.reason ?? 'n/a'} freeOp=${cm.move.freeOperation ?? false}`);
        if (ctx.freeOperationDenial) {
          console.error(`    denial.cause=${ctx.freeOperationDenial.cause}`);
        }
      }

      // Rerun prep without filter (broader) and see why even it fails.
      const broader = preparePlayableMoves(input, { pendingTemplateCompletions: 3 });
      console.error(`\nBroader preparePlayableMoves (no actionIdFilter):`);
      console.error(`  completedMoves.length=${broader.completedMoves.length}`);
      console.error(`  stochasticMoves.length=${broader.stochasticMoves.length}`);
      console.error(`  statistics.templateCompletionAttempts=${broader.statistics?.templateCompletionAttempts ?? 'n/a'}`);
      console.error(`  statistics.templateCompletionSuccesses=${broader.statistics?.templateCompletionSuccesses ?? 'n/a'}`);
      console.error(`  statistics.templateCompletionUnsatisfiable=${broader.statistics?.templateCompletionUnsatisfiable ?? 'n/a'}`);
      console.error(`  statistics.rejectedNotViable=${broader.statistics?.rejectedNotViable ?? 'n/a'}`);
      console.error(`  statistics.duplicatesRemoved=${broader.statistics?.duplicatesRemoved ?? 'n/a'}`);
      console.error(`  movePreparations.length=${broader.movePreparations?.length ?? 'n/a'}`);

      // Show first few preparation traces.
      const preps = broader.movePreparations ?? [];
      console.error(`\nFirst ${Math.min(8, preps.length)} movePreparations:`);
      for (const p of preps.slice(0, 8)) {
        console.error(`  actionId=${p.actionId} init=${p.initialClassification} final=${p.finalClassification} entered=${p.enteredTrustedMoveIndex} dup=${p.skippedAsDuplicate ?? false} attempts=${p.templateCompletionAttempts ?? 'n/a'} outcome=${JSON.stringify(p.templateCompletionOutcome ?? 'n/a')}`);
        if (p.rejection) {
          console.error(`    rejection=${JSON.stringify(p.rejection)}`);
        }
      }

      // Re-enumerate legal moves fresh from the same state, compare with input.
      console.error(`\n--- Fresh enumerate vs. input.legalMoves ---`);
      const freshEnum = enumerateLegalMoves(input.def, input.state, undefined, input.runtime);
      console.error(`freshEnum.moves.length=${freshEnum.moves.length}`);
      for (let i = 0; i < Math.min(freshEnum.moves.length, input.legalMoves.length, 4); i++) {
        const f = freshEnum.moves[i];
        const orig = input.legalMoves[i];
        const fcode = f.viability.viable ? 'VIABLE' : f.viability.code;
        const ocode = orig.viability.viable ? 'VIABLE' : orig.viability.code;
        console.error(`  [${i}] fresh=${fcode} orig=${ocode} sameObj=${f === orig}`);
      }

      // Drill into one of the legal moves: run probe, then run completion step-by-step.
      if (input.legalMoves.length > 0) {
        const cm = input.legalMoves[0];
        const move = cm.move;
        console.error(`\n--- Probe for first legal move ---`);
        console.error(`actionId=${move.actionId} freeOp=${move.freeOperation ?? false}`);
        console.error(`move.params keys=${Object.keys(move.params ?? {}).join(',')}`);
        const probe = probeMoveViability(input.def, input.state, move, input.runtime);
        console.error(`probe.viable=${probe.viable}`);
        if (probe.viable) {
          console.error(`probe.complete=${probe.complete}`);
          console.error(`probe.stochasticDecision=${probe.stochasticDecision !== undefined}`);
        } else {
          console.error(`probe.code=${probe.code}`);
        }
        // Try completeTemplateMove with identity choose that records requests.
        const requests = [];
        const completed = completeTemplateMove(input.def, input.state, move, input.rng, input.runtime, {
          choose: (req) => {
            requests.push({
              type: req.type,
              min: req.min,
              max: req.max,
              decisionId: req.decisionId,
              options: (req.options ?? []).slice(0, 5),
              optionCount: (req.options ?? []).length,
            });
            return undefined; // fall through to random
          },
        });
        console.error(`completeTemplateMove.kind=${completed.kind}`);
        console.error(`captured ${requests.length} choice requests (first 5):`);
        for (const r of requests.slice(0, 5)) {
          console.error(`  type=${r.type} decisionId=${r.decisionId} min=${r.min} max=${r.max} optionCount=${r.optionCount}`);
        }

        // Try completeMoveDecisionSequence directly with an identity chooser that
        // fails on the first chooseN with min>0, optionCount=0 — that's the likely
        // root cause.
        try {
          const seqResult = completeMoveDecisionSequence(input.def, input.state, move, {
            choose: () => undefined,
            chooseStochastic: () => undefined,
          }, input.runtime);
          console.error(`\ncompleteMoveDecisionSequence (identity chooser):`);
          console.error(`  complete=${seqResult.complete}`);
          console.error(`  illegal=${seqResult.illegal !== undefined}`);
          if (seqResult.illegal) console.error(`  illegal.code=${seqResult.illegal.code}`);
          console.error(`  nextDecision=${seqResult.nextDecision ? JSON.stringify({ type: seqResult.nextDecision.type, decisionId: seqResult.nextDecision.decisionId, min: seqResult.nextDecision.min, max: seqResult.nextDecision.max, optionCount: (seqResult.nextDecision.options ?? []).length }) : 'undefined'}`);
          console.error(`  stochasticDecision=${seqResult.stochasticDecision !== undefined}`);
        } catch (e) {
          console.error(`completeMoveDecisionSequence threw: ${e.message}`);
        }
      }

      throw err;
    }
  }
}

const agents = seatProfiles.map(
  (pid) => new InstrumentedPolicyAgent({ profileId: pid, traceLevel: 'summary' }),
);

console.error(`Running seed ${SEED} with max-turns=${MAX_TURNS}`);
try {
  const trace = runGame(def, SEED, agents, MAX_TURNS, PLAYER_COUNT, undefined, runtime);
  console.error(`Completed: stopReason=${trace.stopReason} turns=${trace.turnsCount} moves=${trace.moves.length}`);
} catch (err) {
  console.error(`Threw: ${err.message}`);
}
