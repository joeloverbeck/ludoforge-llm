#!/usr/bin/env node
/**
 * Spec 207 Phase 2 (ticket 207AGEDECCOS-002) — outcome-preservation oracle.
 *
 * Replays the EXACT witness configuration of
 * `fitl-spec-143-cost-stability.test.ts` (seed 1002, maxTurns=3, four
 * `*-baseline` policy agents) and emits a byte-exact fingerprint of the
 * realized decision sequence:
 *
 *   - per-decision (idx, seat, kind, selectedStableMoveKey)
 *   - the FNV-1a hash of that whole sequence
 *   - the final GameState.stateHash and stopReason / decision counts
 *
 * The Phase 2 bound on the chooseNStep continuedDeepening enumeration must
 * change cost only, not outcomes (Spec 207 §4, Foundation 8). This script is
 * the self-contained proof: run it pre-fix to record the golden fingerprint,
 * then re-run post-fix; the fingerprint must be byte-identical.
 *
 * It also runs the config twice in-process to prove replay-identity.
 *
 * Diagnosis only: no production engine source is modified. Imports from
 * packages/engine/dist/, so run `pnpm -F @ludoforge/engine build` first.
 *
 * Usage: node campaigns/fitl-arvn-agent-evolution/capture-decision-sequence.mjs
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = (() => {
  let cur = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur;
    cur = join(cur, '..');
  }
  return process.cwd();
})();

// ---- Witness-identical configuration -------------------------------------
const SEED = 1002;
const MAX_TURNS = 3;
const PLAYER_COUNT = 4;
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;
const POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'];

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));
const {
  advanceAutoresolvable,
  applyPublishedDecision,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  terminalResult,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { PolicyAgent } = await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));
const { defaultPolicyWasmPath, initializePolicyWasmRuntimeSync } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/policy-wasm-runtime-node-loader.js'));

initializePolicyWasmRuntimeSync({ wasmPath: defaultPolicyWasmPath() });

const def = assertValidatedGameDef(
  runGameSpecStagesFromBundle(
    loadGameSpecBundleFromEntrypoint(join(REPO_ROOT, 'data/games/fire-in-the-lake.game-spec.md')),
  ).compilation.result.gameDef,
);
const seatIds = (def.seats ?? []).map((s) => String(s.id));

const resolvePlayerIndexForSeat = (seatId) => {
  const explicit = seatIds.indexOf(seatId);
  if (explicit >= 0) return explicit;
  const parsed = Number(seatId);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
};

const isNoBridgeableMicroturnError = (error) =>
  error instanceof Error &&
  (error.message.includes('no simple actionSelection moves are currently bridgeable') ||
    error.message.includes('has no bridgeable continuations'));

// Stable, dependency-free decision fingerprint of a single decision.
const decisionKeyOf = (decision) => {
  switch (decision.kind) {
    case 'actionSelection':
      return `actionSelection:${String(decision.actionId)}:${decision.move === undefined ? '-' : JSON.stringify(decision.move)}`;
    case 'chooseOne':
      return `chooseOne:${String(decision.decisionKey)}:${JSON.stringify(decision.value ?? null)}`;
    case 'chooseNStep':
      return `chooseNStep:${String(decision.decisionKey)}:${decision.command}:${JSON.stringify(decision.value ?? null)}`;
    case 'stochasticResolve':
      return `stochasticResolve:${String(decision.decisionKey)}:${JSON.stringify(decision.value ?? null)}`;
    case 'outcomeGrantResolve':
      return `outcomeGrantResolve:${String(decision.grantId)}`;
    case 'turnRetirement':
      return `turnRetirement:${String(decision.retiringTurnId)}`;
    default:
      return `unknown:${JSON.stringify(decision)}`;
  }
};

const fnv1a = (str) => {
  let h = 0x811c9dc5n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < str.length; i += 1) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * 0x100000001b3n) & mask;
  }
  return h;
};

const runOnce = () => {
  const runtime = createGameDefRuntime(def);
  const agents = POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
  const agentRngByPlayer = Array.from({ length: PLAYER_COUNT }, (_u, i) =>
    createRng(BigInt(SEED) ^ (BigInt(i + 1) * AGENT_RNG_MIX)));
  let chanceRng = createRng(BigInt(SEED) ^ AGENT_RNG_MIX);
  let state = initialState(def, SEED, PLAYER_COUNT, undefined, runtime).state;
  const decisions = [];
  let stopReason = 'unknown';

  while (true) {
    const auto = advanceAutoresolvable(def, state, chanceRng, runtime);
    state = auto.state;
    chanceRng = auto.rng;
    if (terminalResult(def, state, runtime) !== null) { stopReason = 'terminal'; break; }
    if (state.turnCount >= MAX_TURNS) { stopReason = 'maxTurns'; break; }
    let microturn;
    try {
      microturn = publishMicroturn(def, state, runtime);
    } catch (error) {
      if (isNoBridgeableMicroturnError(error)) { stopReason = 'noLegalMoves'; break; }
      throw error;
    }
    const playerIndex = resolvePlayerIndexForSeat(String(microturn.seatId));
    const agent = agents[playerIndex];
    const agentRng = agentRngByPlayer[playerIndex];
    const selected = agent.chooseDecision({ def, state, microturn, rng: agentRng, runtime });
    agentRngByPlayer[playerIndex] = selected.rng;
    decisions.push(`${String(microturn.seatId)}|${microturn.kind}|${decisionKeyOf(selected.decision)}`);
    state = applyPublishedDecision(def, state, microturn, selected.decision, {}, runtime).state;
  }
  return {
    stopReason,
    playerDecisions: decisions.length,
    finalHash: state.stateHash.toString(16),
    seqHash: fnv1a(decisions.join('\n')).toString(16),
    decisions,
  };
};

const a = runOnce();
const b = runOnce();

const replayIdentical = a.seqHash === b.seqHash && a.finalHash === b.finalHash;

console.log('='.repeat(78));
console.log('Spec 207 / 207AGEDECCOS-002 — decision-sequence outcome fingerprint (seed 1002)');
console.log('='.repeat(78));
console.log(`stopReason          = ${a.stopReason}`);
console.log(`playerDecisions     = ${a.playerDecisions}`);
console.log(`finalStateHash      = ${a.finalHash}`);
console.log(`decisionSeqHash     = ${a.seqHash}`);
console.log(`replayIdentical     = ${replayIdentical}`);
if (!replayIdentical) {
  console.log(`  run2 finalHash    = ${b.finalHash}`);
  console.log(`  run2 seqHash      = ${b.seqHash}`);
  const firstDiff = a.decisions.findIndex((d, i) => d !== b.decisions[i]);
  console.log(`  first divergence  = idx ${firstDiff}`);
}
console.log('='.repeat(78));
if (!replayIdentical) {
  process.exitCode = 1;
}
