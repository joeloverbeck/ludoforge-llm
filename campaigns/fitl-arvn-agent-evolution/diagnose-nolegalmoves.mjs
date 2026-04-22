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
const {
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  terminalResult,
  publishMicroturn,
  applyPublishedDecision,
  advanceAutoresolvable,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { CHANCE_RNG_MIX } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/microturn/constants.js'));
const { extractMicroturnSnapshot } =
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

const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;

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

let state = initialState(def, SEED, PLAYER_COUNT, undefined, runtime).state;
let currentChanceRng = createRng(BigInt(SEED) ^ CHANCE_RNG_MIX);
const agentRngByPlayer = Array.from({ length: state.playerCount }, (_, i) =>
  createRng(BigInt(SEED) ^ (BigInt(i + 1) * AGENT_RNG_MIX)),
);
const decisionLogs = [];
let stopReason = 'unknown';
let preTerminalState = null;
let failureMessage = null;

while (true) {
  const autoResult = advanceAutoresolvable(def, state, currentChanceRng, runtime);
  state = autoResult.state;
  currentChanceRng = autoResult.rng;
  decisionLogs.push(...autoResult.autoResolvedLogs.map((log) => ({
    seat: log.seatId?.toLowerCase?.() ?? null,
    actionId: getDecisionActionId(log.decision),
    legalCount: log.legalActionCount ?? 0,
    decisionKind: log.decision?.kind ?? null,
    playerId: log.playerId ?? null,
  })));

  const terminal = terminalResult(def, state, runtime);
  if (terminal !== null) {
    stopReason = 'terminal';
    break;
  }
  if (state.turnCount >= MAX_TURNS) {
    stopReason = 'maxTurns';
    break;
  }

  let microturn;
  try {
    microturn = publishMicroturn(def, state, runtime);
  } catch (error) {
    stopReason = 'noLegalMoves';
    preTerminalState = state;
    failureMessage = error instanceof Error ? error.message : String(error);
    break;
  }

  const player = state.activePlayer;
  const agent = agents[player];
  const snapshot = extractMicroturnSnapshot(def, state, microturn, runtime, 'standard');

  let selected;
  try {
    selected = agent.chooseDecision({
      def,
      state,
      microturn,
      rng: agentRngByPlayer[player],
      runtime,
    });
  } catch (error) {
    console.error(`Agent threw at decision ${decisionLogs.length}: ${error.message}`);
    stopReason = 'agentThrew';
    preTerminalState = state;
    failureMessage = error instanceof Error ? error.message : String(error);
    break;
  }

  agentRngByPlayer[player] = selected.rng;
  const applied = applyPublishedDecision(def, state, microturn, selected.decision, undefined, runtime);
  state = applied.state;
  decisionLogs.push({
    seat: seatNames[player] ?? `p${player}`,
    playerId: player,
    actionId: getDecisionActionId(selected.decision),
    legalCount: microturn.legalActions.length,
    decisionKind: selected.decision.kind,
    agentDecision: selected.agentDecision ?? null,
    preDecisionSnapshot: {
      turnCount: snapshot.turnCount,
      phaseId: snapshot.phaseId,
      activePlayer: snapshot.activePlayer,
      seatStandings: compactValue(snapshot.seatStandings),
      globalVars: compactValue(snapshot.globalVars),
    },
  });
}

console.error(`\n=== seed ${SEED}: stopReason=${stopReason} decisions=${decisionLogs.length} ===\n`);

if (stopReason !== 'noLegalMoves' || !preTerminalState) {
  console.error('Seed did not terminate at noLegalMoves under this run. (Non-reproducible or fixed?)');
  process.exit(0);
}

const s = preTerminalState;
console.error('--- PRE-TERMINAL STATE ---');
console.error(`turnCount=${s.turnCount} activePlayer=${s.activePlayer} (${seatNames[s.activePlayer]})`);
console.error(`phase=${JSON.stringify(compactValue(s.phase ?? null))}`);
console.error(`stateHash=${String(s.stateHash)}`);
if (failureMessage !== null) {
  console.error(`failure=${failureMessage}`);
}

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
  const extra = decision.agentDecision?.selectedStableMoveKey
    ? ` stable=${decision.agentDecision.selectedStableMoveKey}`
    : '';
  console.error(
    `  ${decision.seat ?? 'auto'} action=${decision.actionId} kind=${decision.decisionKind} legal=${decision.legalCount}${extra}`,
  );
}

console.error('\n--- LAST PLAYER DECISION SNAPSHOT ---');
const lastPlayerDecision = [...decisionLogs].reverse().find((decision) => decision.playerId !== null);
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
