#!/usr/bin/env node
/**
 * Diagnose noLegalMoves terminations by re-running a seed and dumping the
 * pre-terminal state: turn/phase, activePlayer, globalVars, hand sizes, last
 * moves, and a cross-seat legal-moves check (what if another seat were active).
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
  enumerateLegalMoves,
  initialState,
  applyTrustedMove,
  terminalResult,
  extractMoveContext,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
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

// Replicate sim loop, but capture pre-noLegalMoves state.
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;
let state = initialState(def, SEED, PLAYER_COUNT, undefined, runtime).state;
const agentRngByPlayer = Array.from({ length: state.playerCount }, (_, i) =>
  createRng(BigInt(SEED) ^ (BigInt(i + 1) * AGENT_RNG_MIX)),
);
const moveLogs = [];
let stopReason = 'unknown';
let preTerminalState = null;
let lastMove = null;

while (true) {
  const terminal = terminalResult(def, state, runtime);
  if (terminal !== null) {
    stopReason = 'terminal';
    break;
  }
  if (moveLogs.length >= MAX_TURNS) {
    stopReason = 'maxTurns';
    break;
  }

  const legalMoveResult = enumerateLegalMoves(def, state, undefined, runtime);
  if (legalMoveResult.moves.length === 0) {
    stopReason = 'noLegalMoves';
    preTerminalState = state;
    break;
  }

  const player = state.activePlayer;
  const agent = agents[player];
  const agentRng = agentRngByPlayer[player];

  let selected;
  try {
    selected = agent.chooseMove({
      def, state, playerId: player, legalMoves: legalMoveResult.moves, rng: agentRng, runtime,
    });
  } catch (err) {
    console.error(`Agent threw at move ${moveLogs.length}: ${err.message}`);
    stopReason = 'agentThrew';
    preTerminalState = state;
    break;
  }
  agentRngByPlayer[player] = selected.rng;

  const applied = applyTrustedMove(def, state, selected.move, undefined, runtime);
  state = applied.state;
  lastMove = { player, seat: seatNames[player], move: selected.move.move, legalCount: legalMoveResult.moves.length };
  moveLogs.push(lastMove);
}

console.error(`\n=== seed ${SEED}: stopReason=${stopReason} moves=${moveLogs.length} ===\n`);

if (stopReason !== 'noLegalMoves' || !preTerminalState) {
  console.error('Seed did not terminate at noLegalMoves under this run. (Non-reproducible or fixed?)');
  process.exit(0);
}

const s = preTerminalState;
console.error('--- PRE-TERMINAL STATE ---');
console.error(`turnCount=${s.turnCount} activePlayer=${s.activePlayer} (${seatNames[s.activePlayer]})`);
console.error(`phase=${JSON.stringify(s.phase ?? null)}`);
console.error(`activeTurnFlowWindow=${JSON.stringify(s.activeTurnFlowWindow ?? null)}`);
console.error(`pendingMove.present=${s.pendingMove !== undefined}`);
if (s.pendingMove) {
  console.error(`  pendingMove.move.actionId=${s.pendingMove.move?.actionId}`);
  console.error(`  pendingMove.decisions=${JSON.stringify(s.pendingMove.decisions ?? null).slice(0, 500)}`);
}
console.error(`roundRobin=${JSON.stringify(s.roundRobin ?? null)}`);
console.error(`stateHash=${s.stateHash}`);

console.error(`\n--- GLOBAL VARS (non-null) ---`);
const gvars = s.globalVars ?? {};
for (const k of Object.keys(gvars)) {
  const v = gvars[k];
  if (v !== null && v !== undefined && v !== 0 && v !== false) {
    console.error(`  ${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : v}`);
  }
}

console.error(`\n--- PLAYER STATE ---`);
for (let i = 0; i < (s.players?.length ?? 0); i++) {
  const p = s.players[i];
  const handCount = p.hand?.length ?? 0;
  const pvars = p.playerVars ?? {};
  const nonDefaultPvars = Object.entries(pvars).filter(([, v]) => v !== null && v !== undefined && v !== 0 && v !== false);
  console.error(`  ${seatNames[i] ?? 'p' + i}: hand=${handCount}, playerVars(nonDefault)=${nonDefaultPvars.length}`);
  for (const [k, v] of nonDefaultPvars.slice(0, 8)) {
    console.error(`    ${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : v}`);
  }
}

console.error(`\n--- ZONE TOKEN SUMMARY (top 20 by count) ---`);
const zoneTokens = s.zones ?? {};
const entries = Object.entries(zoneTokens).map(([z, data]) => {
  const count = Array.isArray(data?.tokens) ? data.tokens.length : 0;
  return [z, count];
}).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [z, count] of entries) {
  console.error(`  ${z}: ${count}`);
}

console.error(`\n--- LAST 10 MOVES ---`);
for (const m of moveLogs.slice(-10)) {
  const params = m.move?.params ?? {};
  const paramsStr = Object.keys(params).slice(0, 4).map((k) => `${k}=${JSON.stringify(params[k]).slice(0, 40)}`).join(', ');
  console.error(`  ${m.seat} action=${m.move?.actionId} legal=${m.legalCount} params={${paramsStr}}`);
}

console.error(`\n--- CROSS-SEAT LEGAL-MOVES CHECK ---`);
for (let i = 0; i < (s.players?.length ?? 0); i++) {
  if (i === s.activePlayer) continue;
  // Probe: what would enumerateLegalMoves return if seat i were active?
  // We cannot legally rotate activePlayer (it would be a trust violation) — instead,
  // just enumerate with activePlayer override via a shallow copy for diagnostic only.
  const probeState = { ...s, activePlayer: i };
  const probe = enumerateLegalMoves(def, probeState, undefined, runtime);
  console.error(`  if active=${seatNames[i]}: legal=${probe.moves.length}`);
}

// Probe: enumerate moves with NO activePlayer filter (as the active one), but
// show by-actionId for the actual active player.
console.error(`\n--- TOP ACTIONS AVAILABLE (none, since legal=0) ---`);
const finalEnum = enumerateLegalMoves(def, s, undefined, runtime);
console.error(`  finalEnum.moves.length=${finalEnum.moves.length}`);
console.error(`  finalEnum.diagnostics=${JSON.stringify(finalEnum.diagnostics ?? {}).slice(0, 500)}`);
