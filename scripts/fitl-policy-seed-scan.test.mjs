import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  classifyTraceFailure,
  parseCliArgs,
  runFitlPolicySeedScan,
  writeArtifacts,
} from './fitl-policy-seed-scan.mjs';

async function withTempDir(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'fitl-policy-seed-scan-'));
  try {
    return await callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('parseCliArgs expands a seed range and resolves output directory', () => {
  const parsed = parseCliArgs([
    '--seed-start',
    '7',
    '--seed-count',
    '3',
    '--max-turns',
    '9',
    '--trace-level',
    'verbose',
    '--output-dir',
    './tmp/fitl-scan',
  ]);

  assert.deepEqual(parsed.seeds, [7, 8, 9]);
  assert.equal(parsed.maxTurns, 9);
  assert.equal(parsed.traceLevel, 'verbose');
  assert.equal(parsed.outputDir.endsWith('/tmp/fitl-scan'), true);
});

test('parseCliArgs rejects mixing explicit seed list with seed range inputs', () => {
  assert.throws(
    () => parseCliArgs(['--seed-list', '1,2', '--seed-start', '4']),
    /Use either --seed-list or the --seed-start\/--seed-count range inputs, not both/,
  );
});

test('classifyTraceFailure detects emergency fallback from policy decision metadata', () => {
  const failure = classifyTraceFailure(11, {
    stopReason: 'maxTurns',
    turnsCount: 3,
    moves: [
      {
        player: 0,
        move: { actionId: 'event', params: { choice: 'a' } },
        warnings: [],
        agentDecision: {
          kind: 'policy',
          emergencyFallback: true,
        },
      },
    ],
  });

  assert.deepEqual(failure, {
    seed: 11,
    kind: 'emergencyFallback',
    message: 'PolicyAgent emergency fallback on move 0',
    stopReason: 'maxTurns',
    turnsExecuted: 3,
    lastMoveSummary: {
      moveIndex: 0,
      player: 0,
      actionId: 'event',
      params: { choice: 'a' },
      warningCount: 0,
    },
    warningCount: 0,
  });
});

test('runFitlPolicySeedScan aggregates pass, fallback, and exception results', async () => {
  const fakeGameDef = {
    metadata: { id: 'fitl-test' },
    seats: [{ id: 'us' }, { id: 'arvn' }, { id: 'nva' }, { id: 'vc' }],
  };
  const tracesBySeed = new Map([
    [
      1,
      {
        stopReason: 'terminal',
        turnsCount: 2,
        moves: [{
          warnings: [{ code: 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED', message: 'noop', context: {} }],
          agentDecision: { kind: 'policy', emergencyFallback: false },
        }],
      },
    ],
    [
      2,
      {
        stopReason: 'noLegalMoves',
        turnsCount: 4,
        moves: [{ player: 1, move: { actionId: 'march', params: {} }, warnings: [], agentDecision: { kind: 'policy', emergencyFallback: true } }],
      },
    ],
  ]);

  const report = await runFitlPolicySeedScan(
    {
      seeds: [1, 2, 3],
      maxTurns: 5,
      traceLevel: 'summary',
    },
    {
      compileGameDef: () => fakeGameDef,
      runSimulation: (_def, seed) => {
        if (seed === 3) {
          throw new Error('boom');
        }
        return tracesBySeed.get(seed);
      },
      now: (() => {
        let current = 0;
        return () => {
          current += 5;
          return current;
        };
      })(),
    },
  );

  assert.equal(report.summary.scannedSeedCount, 3);
  assert.equal(report.summary.passedSeedCount, 1);
  assert.equal(report.summary.failedSeedCount, 2);
  assert.deepEqual(report.summary.countsByFailureKind, {
    exception: 1,
    emergencyFallback: 1,
  });
  assert.deepEqual(report.summary.stopReasons, {
    terminal: 1,
    maxTurns: 0,
    noLegalMoves: 1,
  });
  assert.deepEqual(report.summary.warnings, {
    totalWarnings: 1,
    seedsWithWarnings: 1,
    countsByCode: {
      MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED: 1,
    },
  });
  assert.equal(report.failures[0].kind, 'emergencyFallback');
  assert.equal(report.failures[1].kind, 'exception');
});

test('writeArtifacts persists deterministic JSON and NDJSON outputs', () => {
  return withTempDir((dir) => {
    const report = {
      summary: {
        gameDefId: 'fitl',
        config: { seeds: [1], maxTurns: 5, traceLevel: 'summary' },
        scannedSeedCount: 1,
        passedSeedCount: 0,
        failedSeedCount: 1,
        countsByFailureKind: { exception: 1, emergencyFallback: 0 },
        stopReasons: { terminal: 0, maxTurns: 0, noLegalMoves: 0 },
        warnings: { totalWarnings: 0, seedsWithWarnings: 0, countsByCode: {} },
        timing: { durationMs: 5 },
      },
      failures: [
        {
          seed: 1,
          kind: 'exception',
          message: 'boom',
          stopReason: null,
          turnsExecuted: null,
          lastMoveSummary: null,
          warningCount: 0,
          errorName: 'Error',
          durationMs: 5,
        },
      ],
    };

    writeArtifacts(dir, report);

    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    const failures = readFileSync(join(dir, 'failures.ndjson'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));

    assert.deepEqual(summary, report.summary);
    assert.deepEqual(failures, report.failures);
  });
});

test('smoke scan compiles production FITL and emits artifacts for a tiny seed window', async () => {
  await withTempDir(async (dir) => {
    const report = await runFitlPolicySeedScan({
      seeds: [11],
      maxTurns: 1,
      traceLevel: 'summary',
    });
    writeArtifacts(dir, report);

    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    const failuresRaw = readFileSync(join(dir, 'failures.ndjson'), 'utf8');

    assert.equal(summary.scannedSeedCount, 1);
    assert.equal(Array.isArray(summary.config.seeds), true);
    assert.equal(typeof failuresRaw, 'string');
  });
});
