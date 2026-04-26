#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const DIST_ROOT = join(PACKAGE_ROOT, 'dist');
const HARD_TARGET_MS = 25600;
const DEFAULT_RUNS = 3;
const CORPUS = {
  seed: 1000,
  maxTurns: 200,
  playerCount: 4,
  evolvedSeat: 'arvn',
  sampleSize: 50,
  seatProfiles: ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'],
};

const [
  { PolicyAgent },
  { assertValidatedGameDef, createGameDefRuntime },
  { runGame },
  { getFitlProductionFixture },
] = await Promise.all([
  import(join(DIST_ROOT, 'src', 'agents', 'index.js')),
  import(join(DIST_ROOT, 'src', 'kernel', 'index.js')),
  import(join(DIST_ROOT, 'src', 'sim', 'index.js')),
  import(join(DIST_ROOT, 'test', 'helpers', 'production-spec-helpers.js')),
]);

const args = process.argv.slice(2);

function readPositiveIntegerFlag(name, defaultValue) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return defaultValue;
  }
  const value = Number.parseInt(String(args[index + 1]), 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    process.stderr.write(`ERROR: --${name} must be a positive integer.\n`);
    process.exit(1);
  }
  return value;
}

const runs = readPositiveIntegerFlag('runs', DEFAULT_RUNS);
const samples = [];
const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);

function measurePreviewPipeline(validatedDef) {
  const runtime = createGameDefRuntime(validatedDef);
  const arvnAgent = new SamplingPolicyAgent('arvn-evolved');
  const agents = [
    new PolicyAgent({ profileId: 'us-baseline', traceLevel: 'summary' }),
    arvnAgent,
    new PolicyAgent({ profileId: 'nva-baseline', traceLevel: 'summary' }),
    new PolicyAgent({ profileId: 'vc-baseline', traceLevel: 'summary' }),
  ];

  const startedAt = performance.now();
  let completed = null;
  try {
    runGame(
      validatedDef,
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
      throw error;
    }
  }
  const totalMs = performance.now() - startedAt;
  if (completed === null) {
    throw new Error(`Expected to collect ${CORPUS.sampleSize} ARVN action-selection decisions before maxTurns.`);
  }
  return {
    totalMs,
    candidateBudget: completed.candidateBudget,
    sampledActionSelectionCount: completed.sampledActionSelectionCount,
  };
}

class CorpusComplete extends Error {
  constructor(sampledActionSelectionCount, candidateBudget) {
    super('Spec 146 hard-target preview-pipeline corpus complete.');
    this.sampledActionSelectionCount = sampledActionSelectionCount;
    this.candidateBudget = candidateBudget;
  }
}

class SamplingPolicyAgent {
  constructor(profileId) {
    this.delegate = new PolicyAgent({ profileId, traceLevel: 'summary' });
    this.sampledActionSelectionCount = 0;
    this.candidateBudget = 0;
  }

  chooseDecision(input) {
    const result = this.delegate.chooseDecision(input);
    if (input.microturn.kind !== 'actionSelection' || result.agentDecision?.kind !== 'policy') {
      return result;
    }
    this.sampledActionSelectionCount += 1;
    this.candidateBudget += result.agentDecision.initialCandidateCount;
    if (this.sampledActionSelectionCount >= CORPUS.sampleSize) {
      throw new CorpusComplete(this.sampledActionSelectionCount, this.candidateBudget);
    }
    return result;
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function uniqueNumbers(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function formatValue(value) {
  return Array.isArray(value) ? value.join(',') : String(value);
}

for (let index = 0; index < runs; index += 1) {
  const measurement = measurePreviewPipeline(def);
  samples.push(measurement);
  process.stderr.write(
    `[preview-hard-target] run ${index + 1}/${runs}: totalMs=${round2(measurement.totalMs)} ` +
    `candidateBudget=${measurement.candidateBudget} sampledActionSelectionCount=${measurement.sampledActionSelectionCount}\n`,
  );
}

const totalMsSamples = samples.map((sample) => sample.totalMs);
const meanTotalMs = mean(totalMsSamples);
const meanAbsoluteDeviation = mean(totalMsSamples.map((sample) => Math.abs(sample - meanTotalMs)));
const madPct = meanTotalMs === 0 ? 0 : (meanAbsoluteDeviation / meanTotalMs) * 100;
const candidateBudgets = uniqueNumbers(samples.map((sample) => sample.candidateBudget));
const sampledCounts = uniqueNumbers(samples.map((sample) => sample.sampledActionSelectionCount));
const pass = meanTotalMs <= HARD_TARGET_MS && madPct < 1.5;

const summary = {
  previewOn_totalMs_ms: totalMsSamples.map(round2),
  mean_totalMs: round2(meanTotalMs),
  mad_pct: round2(madPct),
  hardTargetMs: HARD_TARGET_MS,
  pass,
  candidateBudget: candidateBudgets.length === 1 ? candidateBudgets[0] : candidateBudgets,
  sampledActionSelectionCount: sampledCounts.length === 1 ? sampledCounts[0] : sampledCounts,
  corpus: {
    source: 'live-production-fitl',
    game: 'fire-in-the-lake',
    seed: CORPUS.seed,
    maxTurns: CORPUS.maxTurns,
    playerCount: CORPUS.playerCount,
    evolvedSeat: CORPUS.evolvedSeat,
    sampleSize: CORPUS.sampleSize,
    seatProfiles: CORPUS.seatProfiles,
  },
};

console.log(`previewOn_totalMs_ms=${summary.previewOn_totalMs_ms.join(',')}`);
console.log(`mean_totalMs=${summary.mean_totalMs}`);
console.log(`mad_pct=${summary.mad_pct}`);
console.log(`hardTargetMs=${summary.hardTargetMs}`);
console.log(`pass=${summary.pass}`);
console.log(`candidateBudget=${formatValue(summary.candidateBudget)}`);
console.log(`sampledActionSelectionCount=${formatValue(summary.sampledActionSelectionCount)}`);
console.log(JSON.stringify(summary));
