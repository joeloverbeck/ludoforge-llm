// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

type PolicyProfileQualityRecord = {
  readonly file: string;
  readonly variantId: string;
  readonly seed: number;
  readonly passed: boolean;
  readonly stopReason: string;
  readonly decisions: number;
};

type ReportModule = {
  readonly DEFAULT_INPUT_PATH: string;
  readonly parsePolicyProfileQualityReport: (reportText: string) => PolicyProfileQualityRecord[];
  readonly buildPolicyProfileQualityAnnotations: (records: PolicyProfileQualityRecord[]) => string[];
  readonly buildPolicyProfileQualityComment: (
    records: PolicyProfileQualityRecord[],
    baselineRecords?: PolicyProfileQualityRecord[],
  ) => string;
  readonly main: (
    argv?: readonly string[],
    options?: {
      readonly readFileSyncImpl?: (path: string, encoding: string) => string;
      readonly stdout?: { write: (chunk: string) => void };
      readonly commentPoster?: (commentBody: string) => void;
    },
  ) => number;
};

const thisDir = dirname(fileURLToPath(import.meta.url));
const engineRootCandidate = resolve(thisDir, '..', '..', '..', '..');
const engineRoot = engineRootCandidate.endsWith('/dist') ? dirname(engineRootCandidate) : engineRootCandidate;
const scriptPath = resolve(engineRoot, 'scripts/emit-policy-profile-quality-report.mjs');

const loadModule = async (): Promise<ReportModule> => import(pathToFileURL(scriptPath).href) as Promise<ReportModule>;

const SAMPLE_REPORT = [
  {
    file: '/workspace/packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts',
    variantId: 'all-baselines',
    seed: 1020,
    passed: true,
    stopReason: 'terminal',
    decisions: 288,
  },
  {
    file: '/workspace/packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts',
    variantId: 'all-baselines',
    seed: 1049,
    passed: true,
    stopReason: 'terminal',
    decisions: 291,
  },
  {
    file: '/workspace/packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts',
    variantId: 'arvn-evolved',
    seed: 1020,
    passed: true,
    stopReason: 'terminal',
    decisions: 289,
  },
  {
    file: '/workspace/packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts',
    variantId: 'arvn-evolved',
    seed: 1049,
    passed: false,
    stopReason: 'maxTurns',
    decisions: 300,
  },
] satisfies PolicyProfileQualityRecord[];

const BASELINE_REPORT = [
  {
    file: '/workspace/packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts',
    variantId: 'all-baselines',
    seed: 1020,
    passed: true,
    stopReason: 'terminal',
    decisions: 287,
  },
  {
    file: '/workspace/packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts',
    variantId: 'all-baselines',
    seed: 1049,
    passed: true,
    stopReason: 'terminal',
    decisions: 290,
  },
  {
    file: '/workspace/packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts',
    variantId: 'arvn-evolved',
    seed: 1020,
    passed: true,
    stopReason: 'terminal',
    decisions: 285,
  },
  {
    file: '/workspace/packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts',
    variantId: 'arvn-evolved',
    seed: 1049,
    passed: true,
    stopReason: 'terminal',
    decisions: 292,
  },
] satisfies PolicyProfileQualityRecord[];

describe('emit-policy-profile-quality-report script', () => {
  it('parses captured report lines into structured records', async () => {
    const { parsePolicyProfileQualityReport } = await loadModule();

    const parsed = parsePolicyProfileQualityReport(SAMPLE_REPORT.map((record) => JSON.stringify(record)).join('\n'));

    assert.deepEqual(parsed, SAMPLE_REPORT);
  });

  it('formats warning annotations for failing records only', async () => {
    const { buildPolicyProfileQualityAnnotations } = await loadModule();

    const annotations = buildPolicyProfileQualityAnnotations(SAMPLE_REPORT);

    assert.deepEqual(annotations, [
      '::warning file=/workspace/packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts::POLICY_PROFILE_QUALITY_REGRESSION variant=arvn-evolved seed=1049 stopReason=maxTurns decisions=300',
    ]);
  });

  it('builds a markdown report grouped by variant with baseline deltas when provided', async () => {
    const { buildPolicyProfileQualityComment } = await loadModule();

    const comment = buildPolicyProfileQualityComment(SAMPLE_REPORT, BASELINE_REPORT);

    assert.match(comment, /## Policy-Profile Quality Report/u);
    assert.match(comment, /\| all-baselines \| 2\/2 -> 2\/2 \| {2}\|/u);
    assert.match(
      comment,
      /\| arvn-evolved \| 2\/2 -> 1\/2 \| seed 1049 did not converge \(stopReason=maxTurns, decisions=300\) \|/u,
    );
    assert.match(comment, /Determinism corpus is the blocking gate\./u);
  });

  it('keeps current-run-only formatting when no baseline report is provided', async () => {
    const { buildPolicyProfileQualityComment } = await loadModule();

    const comment = buildPolicyProfileQualityComment(SAMPLE_REPORT);

    assert.match(comment, /\| all-baselines \| 2\/2 \| {2}\|/u);
    assert.doesNotMatch(comment, /\d+\/\d+ -> \d+\/\d+/u);
  });

  it('writes annotations and markdown to stdout and posts the sticky comment when enabled', async () => {
    const { DEFAULT_INPUT_PATH, main } = await loadModule();
    let stdout = '';
    let postedComment = '';

    const exitCode = main(
      ['--input', DEFAULT_INPUT_PATH, '--baseline-input', 'baseline.ndjson', '--pr-comment'],
      {
        readFileSyncImpl: (path: string) =>
          path === 'baseline.ndjson'
            ? BASELINE_REPORT.map((record) => JSON.stringify(record)).join('\n')
            : SAMPLE_REPORT.map((record) => JSON.stringify(record)).join('\n'),
        stdout: {
          write(chunk: string) {
            stdout += chunk;
          },
        },
        commentPoster(commentBody: string) {
          postedComment = commentBody;
        },
      },
    );

    assert.equal(exitCode, 0);
    assert.match(stdout, /POLICY_PROFILE_QUALITY_REGRESSION variant=arvn-evolved seed=1049/u);
    assert.match(stdout, /2\/2 -> 1\/2/u);
    assert.match(stdout, /## Policy-Profile Quality Report/u);
    assert.equal(postedComment.includes('<!-- policy-profile-quality-report -->'), true);
  });
});
