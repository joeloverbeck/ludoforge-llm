#!/usr/bin/env node
/**
 * Diagnose noLegalMoves terminations by re-running a seed under the current
 * microturn simulator contract and dumping the pre-terminal state plus the
 * final player decision that led into the failure.
 *
 * Usage: node diagnose-nolegalmoves.mjs --seed 1000 [--max-turns 200] [--evolved-seat arvn]
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const {
  assertValidatedGameDef,
  createGameDefRuntime,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));
const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));

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
const seatNames = seats.map((s) => s.id.toLowerCase());
const agents = seatProfiles.map((pid) => new PolicyAgent({ profileId: pid, traceLevel: 'summary' }));

function compactValue(value) {
  if (typeof value === 'bigint') return `${value}n`;
  if (Array.isArray(value)) return value.map(compactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, innerValue]) => [key, compactValue(innerValue)]),
    );
  }
  return value;
}

function nonDefaultEntries(record) {
  return Object.entries(record ?? {}).filter(([, value]) =>
    value !== null && value !== undefined && value !== 0 && value !== false);
}

function getDecisionActionId(decision) {
  if (decision?.kind === 'actionSelection') {
    return decision.actionId ?? decision.move?.actionId ?? 'unknown';
  }
  return decision?.kind ?? 'unknown';
}

const captureDecisionLog = (log, turnCount, stateHash) => ({
  turnCount,
  seat: log.seatId?.toLowerCase?.() ?? null,
  playerId: log.playerId ?? null,
  actionId: getDecisionActionId(log.decision),
  legalCount: log.legalActionCount ?? 0,
  decisionKind: log.decision?.kind ?? null,
  stateHash,
  agentDecision: log.agentDecision ?? null,
  preDecisionSnapshot: log.snapshot === undefined
    ? null
    : {
        turnCount: log.snapshot.turnCount,
        phaseId: log.snapshot.phaseId,
        activePlayer: log.snapshot.activePlayer,
        seatStandings: compactValue(log.snapshot.seatStandings),
        globalVars: compactValue(log.snapshot.globalVars),
      },
});

const captureRecoveryLog = (log, turnCount, stateHash) => ({
  turnCount,
  kind: 'probeHoleRecovery',
  seat: log.seatId.toLowerCase(),
  blacklistedActionId: log.blacklistedActionId,
  reason: log.reason,
  stateHash,
});

export function runNoLegalMovesDiagnostic(options = {}) {
  const seed = options.seed ?? SEED;
  const maxTurns = options.maxTurns ?? MAX_TURNS;
  const captured = { decisions: [], stoppedAt: null };
  const trace = runGame(
    def,
    seed,
    agents,
    maxTurns,
    PLAYER_COUNT,
    {
      traceRetention: 'full',
      snapshotDepth: 'standard',
      decisionHook: (ctx) => {
        if (ctx.kind === 'decision') {
          captured.decisions.push(captureDecisionLog(ctx.decisionLog, ctx.turnCount, ctx.stateHash));
        } else {
          captured.decisions.push(captureRecoveryLog(ctx.probeHoleRecovery, ctx.turnCount, ctx.stateHash));
        }
        captured.stoppedAt = ctx.stateHash;
      },
    },
    runtime,
  );

  return {
    trace,
    captured,
    seatNames,
  };
}

function printDiagnostic(result, seed) {
  const { trace, captured } = result;
  const decisionLogs = captured.decisions;
  console.error(`\n=== seed ${seed}: stopReason=${trace.stopReason} decisions=${decisionLogs.length} ===\n`);

  if (trace.stopReason !== 'noLegalMoves') {
    console.error('Seed did not terminate at noLegalMoves under this run. (Non-reproducible or fixed?)');
    return;
  }

  const s = trace.finalState;
  console.error('--- PRE-TERMINAL STATE ---');
  console.error(`turnCount=${s.turnCount} activePlayer=${s.activePlayer} (${seatNames[s.activePlayer]})`);
  console.error(`phase=${JSON.stringify(compactValue(s.phase ?? null))}`);
  console.error(`stateHash=${String(s.stateHash)}`);

  console.error('\n--- GLOBAL VARS (non-null) ---');
  for (const [key, value] of nonDefaultEntries(s.globalVars ?? {})) {
    console.error(`  ${key}=${typeof value === 'object' ? JSON.stringify(compactValue(value)).slice(0, 200) : compactValue(value)}`);
  }

  console.error('\n--- PLAYER STATE ---');
  for (let i = 0; i < (s.players?.length ?? 0); i++) {
    const player = s.players[i];
    const handCount = player.hand?.length ?? 0;
    const vars = nonDefaultEntries(player.playerVars ?? {});
    console.error(`  ${seatNames[i] ?? `p${i}`}: hand=${handCount}, playerVars(nonDefault)=${vars.length}`);
    for (const [key, value] of vars.slice(0, 8)) {
      console.error(`    ${key}=${typeof value === 'object' ? JSON.stringify(compactValue(value)).slice(0, 120) : compactValue(value)}`);
    }
  }

  console.error('\n--- ZONE TOKEN SUMMARY (top 20 by count) ---');
  const zoneTokens = s.zones ?? {};
  const entries = Object.entries(zoneTokens).map(([zoneId, data]) => {
    const count = Array.isArray(data?.tokens) ? data.tokens.length : 0;
    return [zoneId, count];
  }).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [zoneId, count] of entries) {
    console.error(`  ${zoneId}: ${count}`);
  }

  console.error('\n--- LAST 10 DECISIONS ---');
  for (const decision of decisionLogs.slice(-10)) {
    if (decision.kind === 'probeHoleRecovery') {
      console.error(
        `  ${decision.seat} recovery blacklisted=${decision.blacklistedActionId} reason=${decision.reason}`,
      );
      continue;
    }
    const extra = decision.agentDecision?.selectedStableMoveKey
      ? ` stable=${decision.agentDecision.selectedStableMoveKey}`
      : '';
    console.error(
      `  ${decision.seat ?? 'auto'} action=${decision.actionId} kind=${decision.decisionKind} legal=${decision.legalCount}${extra}`,
    );
  }

  console.error('\n--- LAST PLAYER DECISION SNAPSHOT ---');
  const lastPlayerDecision = [...decisionLogs]
    .reverse()
    .find((decision) => decision.kind !== 'probeHoleRecovery' && decision.playerId !== null);
  if (!lastPlayerDecision) {
    console.error('  none');
  } else {
    console.error(`  seat=${lastPlayerDecision.seat}`);
    console.error(`  action=${lastPlayerDecision.actionId}`);
    console.error(`  kind=${lastPlayerDecision.decisionKind}`);
    console.error(`  legal=${lastPlayerDecision.legalCount}`);
    if (lastPlayerDecision.agentDecision?.selectedStableMoveKey) {
      console.error(`  selectedStableMoveKey=${lastPlayerDecision.agentDecision.selectedStableMoveKey}`);
    }
    console.error(`  snapshot=${JSON.stringify(compactValue(lastPlayerDecision.preDecisionSnapshot)).slice(0, 1200)}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  printDiagnostic(runNoLegalMovesDiagnostic(), SEED);
}
