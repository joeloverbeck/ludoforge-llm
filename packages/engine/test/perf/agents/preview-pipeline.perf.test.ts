// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type Agent,
  type AgentMicroturnDecisionInput,
  type AgentMicroturnDecisionResult,
  type ValidatedGameDef,
  type PolicyAgentDecisionTrace,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';

const CORPUS = {
  seed: 1000,
  maxTurns: 200,
  playerCount: 4,
  evolvedSeat: 'arvn',
  sampleSize: 50,
  seatProfiles: ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'],
} as const;

interface BaselineFixture {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly totalMs: number;
  readonly perCandidateMs: number;
  readonly candidateBudget: number;
  readonly sampledActionSelectionCount: number;
  readonly corpus: {
    readonly source: 'live-production-fitl';
    readonly game: 'fire-in-the-lake';
    readonly seed: number;
    readonly maxTurns: number;
    readonly playerCount: number;
    readonly evolvedSeat: string;
    readonly sampleSize: number;
    readonly baselinePreviewMode: 'disabled';
    readonly seatProfiles: readonly string[];
  };
}

interface Measurement {
  readonly totalMs: number;
  readonly candidateBudget: number;
  readonly sampledActionSelectionCount: number;
}

describe('Spec 145 preview pipeline performance', () => {
  it('emits a non-blocking warning when current preview cost exceeds the checked-in disabled-preview baseline', () => {
    const baseline = readBaseline();
    assertBaselineMatchesCorpus(baseline);

    const current = measurePreviewPipeline(assertValidatedGameDef(getFitlProductionFixture().gameDef));
    const thresholdMs = baseline.totalMs * 1.05 + 30 * current.candidateBudget;

    assert.equal(current.sampledActionSelectionCount, CORPUS.sampleSize);
    assert.ok(current.candidateBudget > 0, 'Expected sampled ARVN action-selection decisions to expose candidates.');
    assert.ok(Number.isFinite(current.totalMs) && current.totalMs > 0, `Expected positive totalMs, got ${current.totalMs}.`);

    if (current.totalMs > thresholdMs) {
      console.warn(
        `POLICY_PERF_REGRESSION previewPipeline totalMs=${round2(current.totalMs)} ` +
        `thresholdMs=${round2(thresholdMs)} baselineMs=${round2(baseline.totalMs)} ` +
        `candidateBudget=${current.candidateBudget} sampledActionSelectionCount=${current.sampledActionSelectionCount}`,
      );
    }
  });
});

function measurePreviewPipeline(def: ValidatedGameDef): Measurement {
  const runtime = createGameDefRuntime(def);
  const arvnAgent = new SamplingPolicyAgent('arvn-evolved');
  const agents: Agent[] = [
    new PolicyAgent({ profileId: 'us-baseline', traceLevel: 'summary' }),
    arvnAgent,
    new PolicyAgent({ profileId: 'nva-baseline', traceLevel: 'summary' }),
    new PolicyAgent({ profileId: 'vc-baseline', traceLevel: 'summary' }),
  ];

  const startedAt = performance.now();
  let completed: CorpusComplete | null = null;
  try {
    runGame(
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
      throw error;
    }
  }
  const totalMs = performance.now() - startedAt;
  if (completed === null) {
    assert.fail(`Expected to collect ${CORPUS.sampleSize} ARVN action-selection decisions before maxTurns.`);
  }

  return {
    totalMs,
    candidateBudget: completed.candidateBudget,
    sampledActionSelectionCount: completed.sampledActionSelectionCount,
  };
}

function readBaseline(): BaselineFixture {
  const path = join(process.cwd(), 'test', 'perf', 'agents', 'preview-pipeline.baseline.json');
  return JSON.parse(readFileSync(path, 'utf8')) as BaselineFixture;
}

function assertBaselineMatchesCorpus(baseline: BaselineFixture): void {
  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.corpus.source, 'live-production-fitl');
  assert.equal(baseline.corpus.game, 'fire-in-the-lake');
  assert.equal(baseline.corpus.seed, CORPUS.seed);
  assert.equal(baseline.corpus.maxTurns, CORPUS.maxTurns);
  assert.equal(baseline.corpus.playerCount, CORPUS.playerCount);
  assert.equal(baseline.corpus.evolvedSeat, CORPUS.evolvedSeat);
  assert.equal(baseline.corpus.sampleSize, CORPUS.sampleSize);
  assert.equal(baseline.corpus.baselinePreviewMode, 'disabled');
  assert.deepEqual(baseline.corpus.seatProfiles, CORPUS.seatProfiles);
  assert.equal(baseline.sampledActionSelectionCount, CORPUS.sampleSize);
  assert.ok(Number.isFinite(baseline.totalMs) && baseline.totalMs > 0, `Invalid baseline totalMs=${baseline.totalMs}.`);
  assert.ok(
    Number.isSafeInteger(baseline.candidateBudget) && baseline.candidateBudget > 0,
    `Invalid baseline candidateBudget=${baseline.candidateBudget}.`,
  );
  assert.ok(Number.isFinite(baseline.perCandidateMs) && baseline.perCandidateMs > 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

class CorpusComplete extends Error {
  readonly sampledActionSelectionCount: number;
  readonly candidateBudget: number;

  constructor(sampledActionSelectionCount: number, candidateBudget: number) {
    super('Spec 145 preview pipeline perf corpus complete.');
    this.sampledActionSelectionCount = sampledActionSelectionCount;
    this.candidateBudget = candidateBudget;
  }
}

class SamplingPolicyAgent implements Agent {
  private readonly delegate: PolicyAgent;
  private sampledActionSelectionCount = 0;
  private candidateBudget = 0;

  constructor(profileId: string) {
    this.delegate = new PolicyAgent({ profileId, traceLevel: 'summary' });
  }

  chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
    const result = this.delegate.chooseDecision(input);
    if (input.microturn.kind !== 'actionSelection' || result.agentDecision?.kind !== 'policy') {
      return result;
    }

    const agentDecision: PolicyAgentDecisionTrace = result.agentDecision;
    this.sampledActionSelectionCount += 1;
    this.candidateBudget += agentDecision.initialCandidateCount;
    if (this.sampledActionSelectionCount >= CORPUS.sampleSize) {
      throw new CorpusComplete(this.sampledActionSelectionCount, this.candidateBudget);
    }
    return result;
  }
}
