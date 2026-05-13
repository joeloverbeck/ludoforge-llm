// @test-class: architectural-invariant
//
// Spec 168 Phase 0 baseline fixture.
//
// This test intentionally asserts only structural validity. Wall-clock values
// are captured for downstream reports, not treated as deterministic pass/fail
// criteria.

import * as assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, type } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const FIXTURE_VERSION = 'spec-168-phase-0-v1';
const ARTIFACT_PATH = join(
  process.cwd(),
  'test',
  'perf',
  '.artifacts',
  'per-decision-cost-budget.json',
);

const PROFILE_COMMAND = [
  'scripts/profile-fitl-preview-drive.mjs',
  '--seed',
  '42',
  '--maxTurns',
  '1',
  '--profilesAll',
  '--perCard',
  '--profileBuckets',
  '--label',
  'spec-168-phase-0-fixture',
] as const;

const REQUIRED_RESULT_KEYS = [
  'elapsedMs',
  'msPerDecision',
  'tokenStateIndexBuildCount',
  'draftTokenStateIndexDeltaCount',
  'wasmScoreRowRouteCount',
  'wasmPreviewCandidateFeatureRowRouteCount',
  'wasmProductionPreviewDriveBatchCount',
  'driveExitTotal',
] as const;

const REQUIRED_BUCKET_KEYS = [
  'simAgentChooseMove',
  'agent:evaluatePolicyExpression',
  'simApplyMove',
  'evalQuery:countMatchingTokens',
  'zobrist:digestDecisionStackFrame',
  'tokenStateIndex:build',
  'tokenStateIndex:refreshCachedEntries',
  'policyWasmRuntime:encodeBytecodeInput',
  'zobrist:encodeDecisionStackFrame',
  'evalQuery:applyTokenFilter',
  'simTerminalResult',
  'simLegalMoves',
] as const;

interface ProfileSummary {
  readonly label: string;
  readonly config: Record<string, unknown>;
  readonly result: {
    readonly elapsedMs: number;
    readonly decisions: number;
    readonly stopReason: string;
    readonly msPerDecision: number | null;
    readonly perCardRows: readonly unknown[];
    readonly profileBuckets: readonly ProfileBucket[];
    readonly [key: string]: unknown;
  };
}

interface ProfileBucket {
  readonly key: string;
  readonly count: number;
  readonly totalMs: number;
}

describe('Spec 168 per-decision cost budget fixture', () => {
  it('emits stable structural JSON for the canonical one-card probe', () => {
    const summary = runProfileProbe();

    assert.equal(summary.label, 'spec-168-phase-0-fixture');
    assert.equal(summary.result.stopReason, 'maxTurns');
    assert.ok(
      Number.isFinite(summary.result.elapsedMs) && summary.result.elapsedMs > 0,
      `Expected positive elapsedMs, got ${summary.result.elapsedMs}.`,
    );
    const perCardRow = assertSinglePerCardRow(summary);
    assert.ok(
      perCardRow.decisions > 0,
      `Expected positive per-card decision count, got ${perCardRow.decisions}.`,
    );
    assert.ok(
      Number.isFinite(perCardRow.msPerDecision) && perCardRow.msPerDecision > 0,
      `Expected positive per-card msPerDecision, got ${perCardRow.msPerDecision}.`,
    );

    for (const key of REQUIRED_RESULT_KEYS) {
      assert.ok(Object.hasOwn(summary.result, key), `Missing result key: ${key}.`);
    }

    const bucketKeys = new Set(summary.result.profileBuckets.map((bucket) => bucket.key));
    for (const key of REQUIRED_BUCKET_KEYS) {
      assert.ok(bucketKeys.has(key), `Missing profile bucket: ${key}.`);
    }

    const artifact = {
      schemaVersion: 1,
      fixtureVersion: FIXTURE_VERSION,
      generatedAt: new Date().toISOString(),
      metadata: {
        kernelCommitSha: readCommand('git', ['rev-parse', 'HEAD']),
        nodeVersion: process.version,
        pnpmVersion: readCommand('pnpm', ['--version']),
        os: `${type()} ${release()} ${platform()}`,
        cpu: cpus()[0]?.model ?? 'unknown',
      },
      command: ['node', ...PROFILE_COMMAND],
      topLine: {
        elapsedMs: summary.result.elapsedMs,
        perCardElapsedMs: perCardRow.elapsedMs,
        perCardDecisions: perCardRow.decisions,
        perCardMsPerDecision: perCardRow.msPerDecision,
      },
      summary,
    };

    mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
    writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  });
});

function runProfileProbe(): ProfileSummary {
  const result = spawnSync(process.execPath, PROFILE_COMMAND, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  assert.equal(
    result.status,
    0,
    `Profile probe failed with exit ${result.status}.\nSTDERR:\n${result.stderr}\nSTDOUT:\n${result.stdout}`,
  );
  return JSON.parse(result.stdout) as ProfileSummary;
}

function assertSinglePerCardRow(summary: ProfileSummary): {
  readonly elapsedMs: number;
  readonly decisions: number;
  readonly msPerDecision: number;
} {
  assert.equal(summary.result.perCardRows.length, 1);
  const [row] = summary.result.perCardRows;
  assertPerCardRow(row);
  return row;
}

function assertPerCardRow(value: unknown): asserts value is {
  readonly elapsedMs: number;
  readonly decisions: number;
  readonly msPerDecision: number;
} {
  assert.ok(typeof value === 'object' && value !== null);
  assert.ok('elapsedMs' in value);
  assert.ok('decisions' in value);
  assert.ok('msPerDecision' in value);
  const row = value as Record<string, unknown>;
  assert.equal(typeof row.elapsedMs, 'number');
  assert.equal(typeof row.decisions, 'number');
  assert.equal(typeof row.msPerDecision, 'number');
}

function readCommand(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed with exit ${result.status}.\n${result.stderr}`,
  );
  return result.stdout.trim();
}
