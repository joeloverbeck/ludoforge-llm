#!/usr/bin/env node
/**
 * Spec 207 Phase 1 (ticket 207AGEDECCOS-001) — localize the within-game
 * per-decision cost-accumulation root cause.
 *
 * `packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts`
 * measures the trimmed last-decile / first-decile per-decision time across a single
 * FITL game (seed 1002, maxTurns=3, four `*-baseline` policy agents) against a
 * calibrated 1.75x ceiling (calibrated 2026-04-24 at ~1.108x). On branch
 * implemented-spec-206 it measures ~19-21x. The run still reaches
 * stopReason=terminal, so this is a cost-accumulation regression, not a
 * correctness/termination failure.
 *
 * This diagnostic replays the witness configuration EXACTLY (same loop:
 * advanceAutoresolvable -> publishMicroturn -> agent.chooseDecision ->
 * applyPublishedDecision) and instruments each player decision so the growing
 * structure becomes visible:
 *
 *   1. Splits per-decision time into the AGENT segment (chooseDecision) vs the
 *      KERNEL APPLY segment (applyPublishedDecision) — Spec 207 Acceptance #3.1.
 *   2. Samples a size proxy per decision: process heapUsed, every per-agent
 *      stateful Map (planExecutionState, previewWideningState), and every
 *      run-local runtime cache (.size). This finds the structure whose growth
 *      tracks the cost curve — Spec 207 §3.2.
 *   3. Attributes the agent-segment cost to internal hot-path buckets via the
 *      built-in opt-in profiler (PerfProfiler dynamic buckets + the global
 *      hot-path channel), so the growing internal segment is named.
 *
 * It prints the per-decision-index series (so the growth shape — linear vs
 * super-linear in decision index / turnCount — is visible) plus a decile
 * summary and an explicit ROOT-CAUSE attribution block.
 *
 * Diagnosis only: no production engine source is modified. Imports from
 * packages/engine/dist/ (matching the diagnose-*.mjs precedent), so run
 * `pnpm -F @ludoforge/engine build` first.
 *
 * ---------------------------------------------------------------------------
 * FINDINGS (207AGEDECCOS-001, 2026-05-29)
 *
 * 1. SEGMENT: the ~20-30x within-game drift lives entirely in the AGENT
 *    decision path (chooseDecision), NOT the kernel apply path. On seed 1002
 *    the last-decile agent segment ~= 569ms vs the kernel apply segment ~= 1.5ms
 *    (kernel apply stays flat, ~1.4x first->last). Spec 207 §3.1 confirmed.
 *
 * 2. GROWING STRUCTURE: the `chooseNStep` inner-preview drive
 *    (packages/engine/src/agents/policy-agent-inner-preview.ts ->
 *    `createPolicyAgentChooseNStepInnerPreview` -> `runChooseNStepInnerPreview`
 *    [broad] + `runDeepPass` [deep], hot-path keys
 *    `policyInnerPreview:chooseNStepBroadRun` / `:chooseNStepDeepPass`). Its
 *    per-decision work is bounded only by `capClass` (the arvn-baseline profile
 *    opts into `inner.chooseNStep: true`, `strategy: continuedDeepening`,
 *    `capClass: deep1024`, `deep.depthCap: 16` in data/.../92-agents.md). The
 *    realized work scales with the number of selectable chooseN values at the
 *    microturn, which grows as the FITL board fills. The
 *    `advanceToDecisionPoint` iteration count (`adp:iterations`) explodes to
 *    ~3200 per ARVN chooseNStep decision in the last decile. The biggest ARVN
 *    `chooseNStep` decisions hit 2000-4900ms each.
 *
 * 3. INTRODUCING SPEC: bisect (drift-probe, same config) localized the drift to
 *    Spec 191 (plan-role-semantic-integrity, 191PLAROLSEM) — NOT the 196-206
 *    window the spec originally hypothesised. Measured drift ratio by commit:
 *      39dc4f288 (pre-191 / promoted-arvn-evolved, 2026-05-22): 1.00x (163 decs)
 *      421bd2ef5 (spec-191 merge,                  2026-05-23): 41.5x (218 decs)
 *      dbff70f36 (spec-192 merge):                              38.2x
 *      8d526b206 (spec-195 merge / pre-196 branch point):       26.3x
 *      81bbc93b3 (spec-196 merge):                              27.2x
 *      847ff3b6b (spec-197 merge):                              33.0x
 *      92247448b (spec-199 merge):                              16.1x
 *      HEAD      (implemented-spec-206):                       ~28x
 *    Pre-191 the cost is uniformly ~190ms (flat: deep1024 is already enabled,
 *    so absolute cost is high but DOES NOT DRIFT). Spec 191 changed the
 *    plan-root / plan-proposal path (policy-agent-plan-root.ts +89,
 *    policy-agent.ts, plan-controller.ts) so early decisions became much cheaper
 *    (~190ms -> ~11ms) while late decisions exploded (~190ms -> ~465ms) and the
 *    ARVN trajectory lengthened (163 -> 218 decisions). The deep1024
 *    continuedDeepening config (added 2026-05-12, Spec 164 campaign) is a
 *    necessary cost-multiplier precondition, not the drift cause.
 *
 * The fix (Phase 2) must bound the per-decision chooseNStep continuedDeepening
 * enumeration so its cost no longer scales with the growing selectable-value set
 * / decision index, without changing decision outcomes (Spec 207 §3.3, §6).
 * ---------------------------------------------------------------------------
 *
 * Usage: node campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

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
const DECILE_COUNT = 10;
const WARMUP_DECISIONS = 3;

// ---- Imports from compiled dist ------------------------------------------
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
  createPerfProfiler,
  setHotPathProfilingEnabled,
  resetHotPathProfilerCounters,
  snapshotHotPathProfilerCounters,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { PolicyAgent } = await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));
const { defaultPolicyWasmPath, initializePolicyWasmRuntimeSync } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/policy-wasm-runtime-node-loader.js'));

initializePolicyWasmRuntimeSync({ wasmPath: defaultPolicyWasmPath() });

// ---- Compile the production FITL spec (same gameDef the witness compiles) -
const def = assertValidatedGameDef(
  runGameSpecStagesFromBundle(
    loadGameSpecBundleFromEntrypoint(join(REPO_ROOT, 'data/games/fire-in-the-lake.game-spec.md')),
  ).compilation.result.gameDef,
);
const runtime = createGameDefRuntime(def);
const seatIds = (def.seats ?? []).map((s) => String(s.id));

const createAgentRngByPlayer = () =>
  Array.from({ length: PLAYER_COUNT }, (_unused, i) => createRng(BigInt(SEED) ^ (BigInt(i + 1) * AGENT_RNG_MIX)));

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

const MB = 1024 * 1024;

// Read a Map/Set/LruCache `.size` defensively (private TS fields survive at runtime).
const sizeOf = (obj, key) => {
  const v = obj?.[key];
  if (v == null) return -1;
  const s = v.size;
  return typeof s === 'number' ? s : -1;
};

// Run-local runtime caches whose growth could drive per-decision cost.
const runtimeCacheKeys = [
  'policyEncodedStateProjectionCache',
  'publicationProbeCache',
  'tokenStateIndexCache',
  'policyWasmBytecodeInputCache',
  'policyWasmBytecodeStateWordsCache',
  'ruleCardCache',
];
const zobristCacheKeys = ['keyCache', 'frameDigestCache'];

const sampleRuntimeSizes = () => {
  const out = {};
  for (const k of runtimeCacheKeys) out[k] = sizeOf(runtime, k);
  for (const k of zobristCacheKeys) out[`zobrist.${k}`] = sizeOf(runtime.zobristTable, k);
  return out;
};

const sumAgentMapSizes = (agents, field) =>
  agents.reduce((acc, a) => acc + Math.max(0, sizeOf(a, field)), 0);

// ---- Drive the witness loop, instrumented --------------------------------
setHotPathProfilingEnabled(true);
resetHotPathProfilerCounters();

const agents = POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
const agentRngByPlayer = createAgentRngByPlayer();
let chanceRng = createRng(BigInt(SEED) ^ AGENT_RNG_MIX);
const initial = initialState(def, SEED, PLAYER_COUNT, undefined, runtime);
let state = initial.state;

const rows = [];
let totalDecisionCount = 0;
let prevHotPath = new Map();
let stopReason = 'unknown';
let errorMessage;

const snapshotHotPath = () => {
  const m = new Map();
  for (const b of snapshotHotPathProfilerCounters()) m.set(b.key, b.totalMs);
  return m;
};

const startWall = performance.now();
try {
  while (true) {
    const auto = advanceAutoresolvable(def, state, chanceRng, runtime);
    state = auto.state;
    chanceRng = auto.rng;
    totalDecisionCount += auto.autoResolvedLogs.length;

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
    const agent = playerIndex < 0 ? undefined : agents[playerIndex];
    const agentRng = playerIndex < 0 ? undefined : agentRngByPlayer[playerIndex];
    if (agent === undefined || agentRng === undefined) {
      throw new Error(`missing agent or RNG for seat ${String(microturn.seatId)}`);
    }

    const profiler = createPerfProfiler();

    // AGENT segment.
    const tAgent = performance.now();
    const selected = agent.chooseDecision({ def, state, microturn, rng: agentRng, runtime, profiler });
    const agentMs = performance.now() - tAgent;
    agentRngByPlayer[playerIndex] = selected.rng;

    // KERNEL APPLY segment.
    const tKernel = performance.now();
    const applied = applyPublishedDecision(def, state, microturn, selected.decision, { profiler }, runtime);
    const kernelMs = performance.now() - tKernel;
    state = applied.state;

    totalDecisionCount += 1;

    // Per-decision internal attribution: hot-path deltas + profiler dynamic buckets.
    const nowHot = snapshotHotPath();
    const hotDelta = {};
    for (const [k, v] of nowHot) hotDelta[k] = v - (prevHotPath.get(k) ?? 0);
    prevHotPath = nowHot;
    const dyn = {};
    for (const [k, b] of profiler.dynamic) dyn[k] = b.totalMs;

    rows.push({
      idx: rows.length + 1,
      turnCount: state.turnCount,
      seat: String(microturn.seatId),
      kind: microturn.kind,
      agentMs,
      kernelMs,
      heapMb: process.memoryUsage().heapUsed / MB,
      planStores: sumAgentMapSizes(agents, 'planExecutionState'),
      previewStores: sumAgentMapSizes(agents, 'previewWideningState'),
      activePlanStore: Math.max(0, sizeOf(agent, 'planExecutionState')),
      activePreviewStore: Math.max(0, sizeOf(agent, 'previewWideningState')),
      runtimeSizes: sampleRuntimeSizes(),
      hotDelta,
      dyn,
    });
  }
} catch (error) {
  stopReason = 'error';
  errorMessage = error instanceof Error ? error.message : String(error);
}
const totalWallMs = performance.now() - startWall;
setHotPathProfilingEnabled(false);

// ---- Reporting -----------------------------------------------------------
const decileOf = (rs, i, dropLeading = 0) => {
  if (rs.length === 0) return [];
  const start = Math.floor((rs.length * i) / DECILE_COUNT);
  const end = Math.max(start + 1, Math.ceil((rs.length * (i + 1)) / DECILE_COUNT));
  return rs.slice(start, end).slice(dropLeading);
};
const avg = (xs, sel) => (xs.length === 0 ? NaN : xs.reduce((a, x) => a + sel(x), 0) / xs.length);

const firstDecile = decileOf(rows, 0, WARMUP_DECISIONS);
const lastDecile = decileOf(rows, DECILE_COUNT - 1);

const w = (n, p = 3) => (Number.isFinite(n) ? n.toFixed(p) : 'n/a');

console.log('='.repeat(78));
console.log('Spec 207 / 207AGEDECCOS-001 — within-game per-decision cost-accumulation probe');
console.log('='.repeat(78));
console.log(
  `config: seed=${SEED} maxTurns=${MAX_TURNS} profiles=[${POLICY_PROFILES.join(',')}]`,
);
console.log(
  `stopReason=${stopReason} playerDecisions=${rows.length} totalDecisions=${totalDecisionCount} wallMs=${w(totalWallMs, 0)}` +
    (errorMessage ? ` error=${errorMessage}` : ''),
);

// Per-decision-index series (sampled to keep output readable).
const step = Math.max(1, Math.floor(rows.length / 30));
console.log('\n-- per-decision series (every ' + step + 'th player decision) --');
console.log('idx  turn seat       kind            agentMs  kernelMs   heapMb  planSz prevSz  projCache');
for (let i = 0; i < rows.length; i += step) {
  const r = rows[i];
  console.log(
    `${String(r.idx).padStart(4)} ${String(r.turnCount).padStart(4)} ${r.seat.padEnd(10)} ` +
      `${r.kind.padEnd(15)} ${w(r.agentMs).padStart(8)} ${w(r.kernelMs).padStart(9)} ` +
      `${w(r.heapMb, 1).padStart(8)} ${String(r.planStores).padStart(6)} ${String(r.previewStores).padStart(6)} ` +
      `${String(r.runtimeSizes.policyEncodedStateProjectionCache).padStart(10)}`,
  );
}

// Decile cost split (mirrors the witness, but split agent vs kernel).
const ratio = (a, b) => (b > 0 ? a / b : NaN);
const fdAgent = avg(firstDecile, (r) => r.agentMs);
const ldAgent = avg(lastDecile, (r) => r.agentMs);
const fdKernel = avg(firstDecile, (r) => r.kernelMs);
const ldKernel = avg(lastDecile, (r) => r.kernelMs);
const fdTotal = avg(firstDecile, (r) => r.agentMs + r.kernelMs);
const ldTotal = avg(lastDecile, (r) => r.agentMs + r.kernelMs);

console.log('\n-- decile cost split (first decile drops ' + WARMUP_DECISIONS + ' warmup) --');
console.log(`                first-decile   last-decile    drift-ratio`);
console.log(`agent  (choose)  ${w(fdAgent).padStart(10)}ms ${w(ldAgent).padStart(10)}ms  ${w(ratio(ldAgent, fdAgent)).padStart(8)}x`);
console.log(`kernel (apply)   ${w(fdKernel).padStart(10)}ms ${w(ldKernel).padStart(10)}ms  ${w(ratio(ldKernel, fdKernel)).padStart(8)}x`);
console.log(`combined         ${w(fdTotal).padStart(10)}ms ${w(ldTotal).padStart(10)}ms  ${w(ratio(ldTotal, fdTotal)).padStart(8)}x`);

// Which size proxy grows with the cost curve? Report first-decile vs last-decile.
const sizeProxyKeys = [
  ['heapMb', (r) => r.heapMb],
  ['planStores', (r) => r.planStores],
  ['previewStores', (r) => r.previewStores],
  ['activePreviewStore', (r) => r.activePreviewStore],
  ...runtimeCacheKeys.map((k) => [`rt.${k}`, (r) => r.runtimeSizes[k]]),
  ...zobristCacheKeys.map((k) => [`rt.zobrist.${k}`, (r) => r.runtimeSizes[`zobrist.${k}`]]),
];
console.log('\n-- size proxies: first-decile avg -> last-decile avg (growth x) --');
for (const [name, sel] of sizeProxyKeys) {
  const fd = avg(firstDecile, sel);
  const ld = avg(lastDecile, sel);
  console.log(`${name.padEnd(34)} ${w(fd, 1).padStart(10)} -> ${w(ld, 1).padStart(10)}  (${w(ratio(ld, fd), 2)}x)`);
}

// Which internal hot-path segment's per-decision cost grows the most?
const sumHotByKey = (rs) => {
  const m = new Map();
  for (const r of rs) for (const [k, v] of Object.entries(r.hotDelta)) m.set(k, (m.get(k) ?? 0) + v);
  return m;
};
const fdHot = sumHotByKey(firstDecile);
const ldHot = sumHotByKey(lastDecile);
const allHotKeys = new Set([...fdHot.keys(), ...ldHot.keys()]);
const hotRows = [...allHotKeys]
  .map((k) => {
    const fdPer = (fdHot.get(k) ?? 0) / Math.max(1, firstDecile.length);
    const ldPer = (ldHot.get(k) ?? 0) / Math.max(1, lastDecile.length);
    return { k, fdPer, ldPer, growth: ratio(ldPer, fdPer), absGrowth: ldPer - fdPer };
  })
  .sort((a, b) => b.absGrowth - a.absGrowth);

console.log('\n-- agent hot-path per-decision cost: first-decile avg -> last-decile avg (top 15 by absolute growth) --');
console.log('hotPathKey                                            firstMs   lastMs   growth');
for (const h of hotRows.slice(0, 15)) {
  console.log(
    `${h.k.padEnd(52)} ${w(h.fdPer).padStart(8)} ${w(h.ldPer).padStart(8)} ${w(h.growth, 2).padStart(8)}x`,
  );
}

// Same, for the profiler dynamic buckets (agent:* segments).
const sumDynByKey = (rs) => {
  const m = new Map();
  for (const r of rs) for (const [k, v] of Object.entries(r.dyn)) m.set(k, (m.get(k) ?? 0) + v);
  return m;
};
const fdDyn = sumDynByKey(firstDecile);
const ldDyn = sumDynByKey(lastDecile);
const dynKeys = new Set([...fdDyn.keys(), ...ldDyn.keys()]);
console.log('\n-- profiler dynamic buckets: first-decile avg -> last-decile avg --');
for (const k of dynKeys) {
  const fdPer = (fdDyn.get(k) ?? 0) / Math.max(1, firstDecile.length);
  const ldPer = (ldDyn.get(k) ?? 0) / Math.max(1, lastDecile.length);
  console.log(`${k.padEnd(40)} ${w(fdPer).padStart(8)} -> ${w(ldPer).padStart(8)}  (${w(ratio(ldPer, fdPer), 2)}x)`);
}

// ---- Root-cause attribution ----------------------------------------------
const combinedDrift = ratio(ldTotal, fdTotal);
const agentDominates = ldAgent > ldKernel;
const topHot = hotRows[0];
console.log('\n' + '='.repeat(78));
console.log('ROOT-CAUSE ATTRIBUTION');
console.log('='.repeat(78));
console.log(`combined per-decision drift ratio: ${w(combinedDrift, 2)}x (witness ceiling 1.75x)`);
console.log(
  `segment carrying the growth: ${agentDominates ? 'AGENT decision path (chooseDecision)' : 'KERNEL apply path (applyPublishedDecision)'}` +
    ` — last-decile agent=${w(ldAgent)}ms vs kernel=${w(ldKernel)}ms`,
);
if (topHot) {
  console.log(
    `dominant growing internal segment: ${topHot.k}` +
      ` (first-decile ${w(topHot.fdPer)}ms -> last-decile ${w(topHot.ldPer)}ms, ${w(topHot.growth, 2)}x)`,
  );
}
console.log(
  'growing structure: chooseNStep continuedDeepening inner-preview drive ' +
    '(policy-agent-inner-preview.ts -> runChooseNStepInnerPreview + runDeepPass)',
);
console.log(
  'introducing spec: Spec 191 (plan-role-semantic-integrity / 191PLAROLSEM) — ' +
    'established by commit bisect (see file header FINDINGS #3: pre-191 1.00x flat -> spec-191 41.5x)',
);
console.log('='.repeat(78));
