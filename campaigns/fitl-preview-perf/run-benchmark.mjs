#!/usr/bin/env node
/**
 * fitl-preview-perf benchmark runner.
 *
 * Replicates `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts`'s
 * measurement function but parameterizes the preview mode and emits structured
 * diagnostics for the harness aggregator.
 *
 * Modes:
 *   --mode on   — primary metric path: arvn-evolved with mode=exactWorld,
 *                 completion=agentGuided, completionDepthCap=8, topK=4
 *                 (the production target the campaign is optimizing for).
 *   --mode off  — Goodhart watchdog: arvn-evolved with mode=disabled. Should
 *                 stay near the static baseline (~12s) regardless of changes
 *                 to the preview pipeline.
 *
 * The arvn-evolved YAML is immutable per campaign rules. Override is applied
 * in-memory by spread-cloning def.agents.profiles and re-binding the arvn
 * seat to a synthetic profile entry (`arvn-evolved-bench-on` /
 * `arvn-evolved-bench-off`).
 *
 * Output: a single JSON line on stdout (last line) consumed by harness.sh.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  let cursor = HERE;
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) return cursor;
    cursor = join(cursor, '..');
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();

const {
  createGameDefRuntime,
  assertValidatedGameDef,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));

const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));

const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));

// --- Sampling agent + corpus-complete sentinel ---

class CorpusComplete extends Error {
  constructor(sampledActionSelectionCount, candidateBudget) {
    super('Corpus complete (sampled enough ARVN action-selection microturns).');
    this.sampledActionSelectionCount = sampledActionSelectionCount;
    this.candidateBudget = candidateBudget;
  }
}

class SamplingPolicyAgent {
  constructor(profileId, sampleSize) {
    this.delegate = new PolicyAgent({ profileId, traceLevel: 'verbose' });
    this.sampleSize = sampleSize;
    this.sampledActionSelectionCount = 0;
    this.candidateBudget = 0;
    this.gatedCountTotal = 0;
    this.driveDepths = [];
    this.gatedCounts = [];
    this.failureReasons = [];
    this.outcomeKinds = [];
    this.unknownReasons = [];
  }

  chooseDecision(input) {
    const result = this.delegate.chooseDecision(input);
    if (input.microturn.kind !== 'actionSelection' || result.agentDecision?.kind !== 'policy') {
      return result;
    }
    const decision = result.agentDecision;
    this.sampledActionSelectionCount += 1;
    this.candidateBudget += decision.initialCandidateCount ?? 0;
    if (typeof decision.previewGatedCount === 'number') {
      this.gatedCountTotal += decision.previewGatedCount;
      this.gatedCounts.push(decision.previewGatedCount);
    }
    if (Array.isArray(decision.candidates)) {
      for (const cand of decision.candidates) {
        if (typeof cand.previewDriveDepth === 'number') {
          this.driveDepths.push(cand.previewDriveDepth);
        }
        if (typeof cand.previewOutcome === 'string') {
          this.outcomeKinds.push(cand.previewOutcome);
          if (cand.previewOutcome !== 'ready' && cand.previewOutcome !== 'stochastic') {
            this.unknownReasons.push(cand.previewOutcome);
          }
        }
        if (typeof cand.previewFailureReason === 'string') {
          this.failureReasons.push(cand.previewFailureReason);
        }
      }
    }
    if (this.sampledActionSelectionCount >= this.sampleSize) {
      throw new CorpusComplete(this.sampledActionSelectionCount, this.candidateBudget);
    }
    return result;
  }
}

// --- CLI argument parsing ---
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] !== undefined ? args[idx + 1] : defaultValue;
}

const MODE = getArg('mode', 'on');
if (MODE !== 'on' && MODE !== 'off') {
  process.stderr.write(`ERROR: --mode must be 'on' or 'off', got '${MODE}'\n`);
  process.exit(1);
}

// --- Corpus binding (mirrors preview-pipeline.perf.test.ts CORPUS) ---
const CORPUS = {
  seed: 1000,
  maxTurns: 200,
  playerCount: 4,
  evolvedSeat: 'arvn',
  sampleSize: 50,
  seatProfiles: ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'],
};

// --- Step 1: Compile FITL spec ---
const compileStart = performance.now();
const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
if (!existsSync(entrypoint)) {
  process.stderr.write(`ERROR: Entrypoint not found: ${entrypoint}\n`);
  process.exit(1);
}

const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
const staged = runGameSpecStagesFromBundle(bundle);

if (staged.validation.blocked) {
  process.stderr.write('ERROR: Validation blocked\n');
  for (const d of staged.validation.diagnostics ?? []) {
    process.stderr.write(`  ${d.severity}: ${d.message}\n`);
  }
  process.exit(1);
}
if (staged.compilation.blocked) {
  process.stderr.write('ERROR: Compilation blocked\n');
  for (const d of staged.compilation.diagnostics ?? []) {
    process.stderr.write(`  ${d.severity}: ${d.message}\n`);
  }
  process.exit(1);
}

const compiled = staged.compilation.result;
if (!compiled || !compiled.gameDef) {
  process.stderr.write('ERROR: Compilation produced no gameDef\n');
  process.exit(1);
}

const baseDef = compiled.gameDef;
const compilation_ms = performance.now() - compileStart;

// --- Step 2: Build benchmark def with synthetic profile overrides ---
// The shipped agent profiles in 92-agents.md are immutable per campaign
// rules. We override in-memory across ALL FOUR seat profiles so that:
//   - mode 'on'  measures the production target uniformly: every seat runs
//                preview with agentGuided completion, depthCap=8, topK=4.
//   - mode 'off' measures the disabled-path baseline uniformly: every seat
//                runs preview disabled (mirrors the static baseline JSON's
//                baselinePreviewMode='disabled' across all seatProfiles).
// Same-mode-on-every-seat is the only configuration that decouples the
// preview-cost measurement from cross-seat profile heterogeneity, and it
// matches the spec-145 perf-test corpus binding (seatProfiles us-baseline
// arvn-evolved nva-baseline vc-baseline).

const SEAT_PROFILE_BINDINGS = [
  { seatId: 'us', sourceProfileId: 'us-baseline' },
  { seatId: 'arvn', sourceProfileId: 'arvn-evolved' },
  { seatId: 'nva', sourceProfileId: 'nva-baseline' },
  { seatId: 'vc', sourceProfileId: 'vc-baseline' },
];

const PREVIEW_ON_OVERRIDE = {
  mode: 'exactWorld',
  completion: 'agentGuided',
  completionDepthCap: 8,
  topK: 4,
};

const PREVIEW_OFF_OVERRIDE = {
  mode: 'disabled',
};

const benchSuffix = MODE === 'on' ? '-bench-on' : '-bench-off';
const previewOverride = MODE === 'on' ? PREVIEW_ON_OVERRIDE : PREVIEW_OFF_OVERRIDE;

const syntheticProfiles = {};
const syntheticBindings = {};

for (const { seatId, sourceProfileId } of SEAT_PROFILE_BINDINGS) {
  const source = baseDef.agents?.profiles?.[sourceProfileId];
  if (!source) {
    process.stderr.write(`ERROR: source profile '${sourceProfileId}' not found in compiled GameDef\n`);
    process.exit(1);
  }
  const benchProfileId = `${sourceProfileId}${benchSuffix}`;
  syntheticProfiles[benchProfileId] = {
    ...source,
    preview: {
      ...(source.preview ?? {}),
      ...previewOverride,
    },
  };
  syntheticBindings[seatId] = benchProfileId;
}

const benchDef = {
  ...baseDef,
  agents: {
    ...baseDef.agents,
    profiles: {
      ...baseDef.agents.profiles,
      ...syntheticProfiles,
    },
    bindingsBySeat: {
      ...baseDef.agents.bindingsBySeat,
      ...syntheticBindings,
    },
  },
};

const def = assertValidatedGameDef(benchDef);

// --- Step 3: Create agents (ARVN wrapped to sample + count) ---
const runtime = createGameDefRuntime(def);

const arvnBenchProfileId = syntheticBindings[CORPUS.evolvedSeat];
const arvnAgent = new SamplingPolicyAgent(arvnBenchProfileId, CORPUS.sampleSize);

const agents = [
  new PolicyAgent({ profileId: syntheticBindings.us, traceLevel: 'summary' }),
  arvnAgent,
  new PolicyAgent({ profileId: syntheticBindings.nva, traceLevel: 'summary' }),
  new PolicyAgent({ profileId: syntheticBindings.vc, traceLevel: 'summary' }),
];

// --- Step 4: Measure ---
const measureStart = performance.now();
let completed = null;
let trace = null;
try {
  trace = runGame(
    def,
    CORPUS.seed,
    agents,
    CORPUS.maxTurns,
    CORPUS.playerCount,
    { skipDeltas: true, traceRetention: 'finalStateOnly' },
    runtime,
  );
} catch (error) {
  if (error instanceof CorpusComplete) {
    completed = error;
  } else {
    process.stderr.write(`ERROR: runGame threw: ${error?.stack ?? error}\n`);
    process.exit(1);
  }
}
const totalMs = performance.now() - measureStart;

if (completed === null) {
  process.stderr.write(
    `ERROR: Expected to collect ${CORPUS.sampleSize} ARVN action-selection decisions before maxTurns.\n` +
    `       Sampled: ${arvnAgent.sampledActionSelectionCount}\n`,
  );
  process.exit(1);
}

// --- Step 5: Aggregate diagnostics ---
const driveDepths = arvnAgent.driveDepths.slice().sort((a, b) => a - b);
const gatedCounts = arvnAgent.gatedCounts.slice().sort((a, b) => a - b);

const percentile = (sorted, q) => {
  if (sorted.length === 0) return -1;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q));
  return sorted[idx];
};

const failureReasonCounts = aggregateCounts(arvnAgent.failureReasons);
const outcomeKindCounts = aggregateCounts(arvnAgent.outcomeKinds);
const unknownReasonCounts = aggregateCounts(arvnAgent.unknownReasons);

const failureReason_top3 = Object.entries(failureReasonCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([reason, count]) => ({ reason, count }));

const stateHash = trace?.finalState?.stateHash != null
  ? String(trace.finalState.stateHash)
  : 'corpus-cutoff'; // CorpusComplete throws before runGame returns finalState

// When CorpusComplete short-circuits, we need a stable identity for determinism.
// Use the seed + sampled candidate-budget + per-microturn outcome fingerprint as
// a deterministic cross-run hash.
const determinismFingerprint = computeDeterminismFingerprint(arvnAgent);

const result = {
  mode: MODE,
  totalMs,
  candidateBudget: arvnAgent.candidateBudget,
  sampledActionSelectionCount: arvnAgent.sampledActionSelectionCount,
  state_hash: stateHash === 'corpus-cutoff' ? determinismFingerprint : stateHash,
  compilation_ms,
  diagnostics: {
    driveDepth_p50: percentile(driveDepths, 0.5),
    driveDepth_p95: percentile(driveDepths, 0.95),
    driveDepth_max: driveDepths.length > 0 ? driveDepths[driveDepths.length - 1] : -1,
    gatedCount_total: arvnAgent.gatedCountTotal,
    gatedCount_p50: percentile(gatedCounts, 0.5),
    failureReason_top3,
    outcomeKind_counts: outcomeKindCounts,
    unknownReason_counts: unknownReasonCounts,
  },
};

process.stdout.write(`${JSON.stringify(result)}\n`);

// ============================================================================
// Helpers
// ============================================================================

function aggregateCounts(items) {
  const counts = {};
  for (const item of items) {
    if (item == null) continue;
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return counts;
}

function computeDeterminismFingerprint(agent) {
  // Order-sensitive concatenation of per-sample outcome-kind sequences.
  // Deterministic input → deterministic fingerprint, independent of timing.
  let acc = 0n;
  const PRIME = 1099511628211n;
  for (const kind of agent.outcomeKinds) {
    acc = (acc ^ BigInt(stringHashCode(String(kind)))) * PRIME;
    acc &= 0xffffffffffffffffn;
  }
  for (const reason of agent.unknownReasons) {
    acc = (acc ^ BigInt(stringHashCode(String(reason ?? 'none')))) * PRIME;
    acc &= 0xffffffffffffffffn;
  }
  for (const depth of agent.driveDepths) {
    acc = (acc ^ BigInt(depth)) * PRIME;
    acc &= 0xffffffffffffffffn;
  }
  acc ^= BigInt(agent.candidateBudget);
  return acc.toString(16);
}

function stringHashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
