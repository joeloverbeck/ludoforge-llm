import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listIntegrationTestsForLane, toDistTestPath } from './test-lane-manifest.mjs';

const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FITL_LANES = [
  'integration:fitl-events-shard-a',
  'integration:fitl-events-shard-b',
  'integration:fitl-events-shard-c',
  'integration:fitl-rules',
];
const NO_TESTS_PATTERN = '^$';
const BUDGET_MS = 30_000;
const TEST_CLASS_REPORTER_ARGS = [
  '--test-reporter=./scripts/test-class-reporter.mjs',
  '--test-reporter-destination=stdout',
];
const REPRESENTATIVE_FILES = [
  'dist/test/integration/fitl-events-1965-us.test.js',
  'dist/test/integration/fitl-events-1968-vc.test.js',
  'dist/test/integration/fitl-production-map-cities.test.js',
];
const FITL_TEST_TIMEOUT_MS = 10 * 60 * 1000;

const testFiles = FITL_LANES.flatMap((lane) => listIntegrationTestsForLane(lane)).map(toDistTestPath);

if (testFiles.length === 0) {
  throw new Error(`FITL lane manifest produced no files for ${FITL_LANES.join(', ')}`);
}

const fullBatched = process.argv.includes('--full-batched');
const representativePerFile = runPerFile(REPRESENTATIVE_FILES);
const representativeBatched = runBatched(REPRESENTATIVE_FILES);
const summary = {
  fileCount: testFiles.length,
  representativeFiles: REPRESENTATIVE_FILES,
  currentPerFileRepresentativeMs: representativePerFile.cumulativeMs,
  currentPerFileSamples: representativePerFile.samples,
  batchedRepresentativeMs: representativeBatched.elapsedMs,
  batchedRepresentativeReductionPct: percentReduction(
    representativePerFile.cumulativeMs,
    representativeBatched.elapsedMs,
  ),
  fastestRepresentativeLowerBoundMs:
    Math.min(...representativePerFile.samples.map((sample) => sample.elapsedMs)) * testFiles.length,
  batchedFullNoTestMs: fullBatched ? runBatched(testFiles).elapsedMs : null,
  budgetMs: BUDGET_MS,
  selectedTopology: 'batched node --test supervisor with --test-concurrency=1 and the shared class reporter',
  proofSurface:
    'informational no-test topology diagnostic over warmed compiled dist; representative mode is the default bounded command',
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (summary.batchedFullNoTestMs !== null && summary.batchedFullNoTestMs >= BUDGET_MS) {
  process.stderr.write(
    `WARN: batched full no-test topology ${summary.batchedFullNoTestMs} ms exceeds ${BUDGET_MS} ms historical budget`
      + ' - measurement is informational, runner hardware varies.\n',
  );
}

function runPerFile(files) {
  let cumulativeMs = 0;
  const samples = [];

  for (const file of files) {
    const elapsedMs = runNodeTest(
      ['--test', '--test-name-pattern', NO_TESTS_PATTERN, ...TEST_CLASS_REPORTER_ARGS, file],
      file,
    );
    cumulativeMs += elapsedMs;
    samples.push({ file, elapsedMs });
  }

  return {
    cumulativeMs: Math.round(cumulativeMs),
    samples,
  };
}

function runBatched(files) {
  return {
    elapsedMs: runNodeTest(
      [
        '--test',
        `--test-timeout=${FITL_TEST_TIMEOUT_MS}`,
        '--test-concurrency=1',
        '--test-name-pattern',
        NO_TESTS_PATTERN,
        ...TEST_CLASS_REPORTER_ARGS,
        ...files,
      ],
      `${files.length} batched files`,
    ),
  };
}

function runNodeTest(args, label) {
  const startedAt = process.hrtime.bigint();
  const result = spawnSync(process.execPath, args, {
    cwd: ENGINE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const elapsedMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);

  if (result.error) {
    throw result.error;
  }

  const exitCode = result.status ?? (result.signal === null ? 0 : 1);
  if (exitCode !== 0) {
    process.stderr.write(`Topology measurement failed for ${label} exit=${exitCode}`);
    if (result.signal !== null) {
      process.stderr.write(` signal=${result.signal}`);
    }
    process.stderr.write('\n');
    writeCapturedOutput('stdout', result.stdout);
    writeCapturedOutput('stderr', result.stderr);
    process.exit(exitCode);
  }

  return elapsedMs;
}

function percentReduction(baselineMs, currentMs) {
  if (baselineMs === 0) {
    return null;
  }
  return Number(((1 - currentMs / baselineMs) * 100).toFixed(2));
}

function writeCapturedOutput(label, output) {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return;
  }

  process.stderr.write(`--- child ${label} ---\n${trimmed}\n`);
}
