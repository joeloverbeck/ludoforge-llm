import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { clearGameDefCache } from '../dist/test/helpers/gamedef-cache.js';
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

const testFiles = FITL_LANES.flatMap((lane) => listIntegrationTestsForLane(lane)).map(toDistTestPath);

if (testFiles.length === 0) {
  throw new Error(`FITL lane manifest produced no files for ${FITL_LANES.join(', ')}`);
}

const cold = runPhase(testFiles, { clearBeforeEachFile: true });
const hot = runPhase(testFiles, { clearBeforeEachFile: false });
const summary = {
  fileCount: testFiles.length,
  coldCumulativeMs: cold.cumulativeMs,
  hotCumulativeMs: hot.cumulativeMs,
  speedupRatio: hot.cumulativeMs === 0 ? null : cold.cumulativeMs / hot.cumulativeMs,
  hotMeetsBudget: hot.cumulativeMs < BUDGET_MS,
  budgetMs: BUDGET_MS,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (!summary.hotMeetsBudget) {
  process.stderr.write(
    `WARN: hot cumulative startup ${summary.hotCumulativeMs} ms exceeds ${BUDGET_MS} ms budget - measurement is informational, runner hardware varies.\n`,
  );
}

function runPhase(files, options) {
  let cumulativeMs = 0;

  for (const file of files) {
    if (options.clearBeforeEachFile) {
      clearGameDefCache();
    }

    const startedAt = process.hrtime.bigint();
    const result = spawnSync(process.execPath, ['--test', '--test-name-pattern', NO_TESTS_PATTERN, file], {
      cwd: ENGINE_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    cumulativeMs += elapsedMs;

    if (result.error) {
      throw result.error;
    }

    const exitCode = result.status ?? (result.signal === null ? 0 : 1);
    if (exitCode !== 0) {
      process.stderr.write(`Child startup measurement failed for ${file} exit=${exitCode}`);
      if (result.signal !== null) {
        process.stderr.write(` signal=${result.signal}`);
      }
      process.stderr.write('\n');
      writeCapturedOutput('stdout', result.stdout);
      writeCapturedOutput('stderr', result.stderr);
      process.exit(exitCode);
    }
  }

  return {
    cumulativeMs: Math.round(cumulativeMs),
  };
}

function writeCapturedOutput(label, output) {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return;
  }

  process.stderr.write(`--- child ${label} ---\n${trimmed}\n`);
}
