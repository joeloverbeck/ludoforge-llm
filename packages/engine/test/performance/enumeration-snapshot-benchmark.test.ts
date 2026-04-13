import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createEnumerationSnapshot,
  evalCondition,
  isEvalErrorCode,
  tryCompileCondition,
  type CompiledConditionPredicate,
  type GameDef,
  type GameState,
  type ReadContext,
} from '../../src/kernel/index.js';
import {
  buildCompiledPredicateSamples,
  buildDeterministicFitlStateCorpus,
  compileFitlValidatedGameDef,
  summarizePredicateCoverage,
} from '../helpers/compiled-condition-production-helpers.js';
import { makeEvalContext } from '../helpers/eval-context-test-helpers.js';

type ComparableErrorCode = 'MISSING_BINDING' | 'MISSING_VAR' | 'TYPE_MISMATCH';

interface BenchmarkSample {
  readonly id: string;
  readonly ctx: ReadContext;
  readonly compiled: CompiledConditionPredicate;
  readonly interpret: () => boolean;
}

interface BenchmarkGroup {
  readonly label: string;
  readonly def: GameDef;
  readonly state: GameState;
  readonly samples: readonly BenchmarkSample[];
}

interface SampleExecution {
  readonly kind: 'ok';
  readonly result: boolean;
}

interface SampleExecutionError {
  readonly kind: 'error';
  readonly code: ComparableErrorCode;
}

interface BenchmarkMeasurement {
  readonly durationMs: number;
  readonly okTrueCount: number;
  readonly okFalseCount: number;
  readonly errorCounts: Readonly<Record<ComparableErrorCode, number>>;
}

const BENCHMARK_ITERATIONS = 50;
const WARMUP_ITERATIONS = 5;
const DELTA_THRESHOLD_PCT = 1;

const FITL_DEF = compileFitlValidatedGameDef();
const FITL_COVERAGE = summarizePredicateCoverage(FITL_DEF);
const FITL_STATE_CORPUS = buildDeterministicFitlStateCorpus(FITL_DEF);
const FITL_SAMPLES = buildCompiledPredicateSamples(FITL_DEF, FITL_STATE_CORPUS);

const execute = (run: () => boolean): SampleExecution | SampleExecutionError => {
  try {
    return { kind: 'ok', result: run() };
  } catch (error) {
    if (isEvalErrorCode(error, 'MISSING_BINDING')) {
      return { kind: 'error', code: 'MISSING_BINDING' };
    }
    if (isEvalErrorCode(error, 'MISSING_VAR')) {
      return { kind: 'error', code: 'MISSING_VAR' };
    }
    if (isEvalErrorCode(error, 'TYPE_MISMATCH')) {
      return { kind: 'error', code: 'TYPE_MISMATCH' };
    }
    throw error;
  }
};

const benchmarkGroupId = (def: GameDef, state: GameState): string => {
  const zones = Object.entries(state.zones)
    .map(([zoneId, tokens]) => `${zoneId}:${tokens.length}`)
    .sort()
    .join('|');
  return `${def.metadata.id}::p${state.activePlayer}::turn${state.turnCount}::${zones}`;
};

const buildProductionGroups = (): readonly BenchmarkGroup[] => {
  const groups = new Map<GameState, BenchmarkGroup>();

  for (const sample of FITL_SAMPLES) {
    const existing = groups.get(sample.state);
    const benchmarkSample: BenchmarkSample = {
      id: `${sample.entry.scope}:${sample.entry.profileId}:${sample.entry.stageIndex ?? 'pipeline'}:${sample.entry.predicate}`,
      ctx: sample.ctx,
      compiled: sample.compiled,
      interpret: () => evalCondition(sample.entry.condition, sample.ctx),
    };

    if (existing === undefined) {
      groups.set(sample.state, {
        label: benchmarkGroupId(sample.ctx.def, sample.state),
        def: sample.ctx.def,
        state: sample.state,
        samples: [benchmarkSample],
      });
      continue;
    }

    groups.set(sample.state, {
      ...existing,
      samples: [...existing.samples, benchmarkSample],
    });
  }

  return [...groups.values()];
};

const makeFocusedDef = (): GameDef =>
  ({
    metadata: { id: 'enumeration-snapshot-benchmark-focused', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeFocusedState = (resourceCount: number, tokenCount: number): GameState => ({
  globalVars: {},
  perPlayerVars: {
    0: { resources: resourceCount },
    1: { resources: 1 },
  },
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': Array.from({ length: tokenCount }, (_unused, index) => ({
      id: asTokenId(`focused-token-${resourceCount}-${tokenCount}-${index}`),
      type: 'piece',
      props: {},
    })),
  },
  nextTokenOrdinal: tokenCount,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: tokenCount + resourceCount,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const buildFocusedGroups = (): readonly BenchmarkGroup[] => {
  const def = makeFocusedDef();
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const pvarCondition = {
    op: '>=',
    left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' },
    right: 5,
  } as const;
  const aggregateCondition = {
    op: '>=',
    left: { _t: 5, aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'board:none' } } },
    right: 2,
  } as const;
  const compiledPvar = tryCompileCondition(pvarCondition);
  const compiledAggregate = tryCompileCondition(aggregateCondition);
  assert.ok(compiledPvar !== null);
  assert.ok(compiledAggregate !== null);

  const cases: ReadonlyArray<{ readonly resourceCount: number; readonly tokenCount: number }> = [
    { resourceCount: 1, tokenCount: 1 },
    { resourceCount: 6, tokenCount: 1 },
    { resourceCount: 1, tokenCount: 3 },
    { resourceCount: 6, tokenCount: 3 },
  ];

  return cases.map(({ resourceCount, tokenCount }) => {
    const state = makeFocusedState(resourceCount, tokenCount);
    const ctx = makeEvalContext({
      def,
      adjacencyGraph,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(1),
      bindings: {},
    });

    const buildInterpreter = (condition: typeof pvarCondition | typeof aggregateCondition, evalCtx: ReadContext) =>
      (): boolean => evalCondition(condition, evalCtx);

    return {
      label: `focused:r${resourceCount}:t${tokenCount}`,
      def,
      state,
      samples: [
        {
          id: `focused-pvar:r${resourceCount}:t${tokenCount}`,
          ctx,
          compiled: compiledPvar,
          interpret: buildInterpreter(pvarCondition, ctx),
        },
        {
          id: `focused-aggregate:r${resourceCount}:t${tokenCount}`,
          ctx,
          compiled: compiledAggregate,
          interpret: buildInterpreter(aggregateCondition, ctx),
        },
      ],
    };
  });
};

const PRODUCTION_GROUPS = buildProductionGroups();
const FOCUSED_GROUPS = buildFocusedGroups();
const ALL_GROUPS = [...PRODUCTION_GROUPS, ...FOCUSED_GROUPS];

const assertParity = (groups: readonly BenchmarkGroup[]): void => {
  for (const group of groups) {
    const snapshot = createEnumerationSnapshot(group.def, group.state);
    for (const sample of group.samples) {
      const raw = execute(() => sample.compiled(sample.ctx));
      const withSnapshot = execute(() => sample.compiled(sample.ctx, snapshot));
      const interpreted = execute(sample.interpret);
      assert.deepEqual(
        raw,
        interpreted,
        `Expected raw compiled parity for ${group.label}:${sample.id}`,
      );
      assert.deepEqual(
        withSnapshot,
        interpreted,
        `Expected snapshot parity for ${group.label}:${sample.id}`,
      );
    }
  }
};

const measure = (
  groups: readonly BenchmarkGroup[],
  options: { readonly useSnapshot: boolean; readonly iterations: number },
): BenchmarkMeasurement => {
  let okTrueCount = 0;
  let okFalseCount = 0;
  const errorCounts: Record<ComparableErrorCode, number> = {
    MISSING_BINDING: 0,
    MISSING_VAR: 0,
    TYPE_MISMATCH: 0,
  };

  const started = performance.now();

  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    for (const group of groups) {
      const snapshot = options.useSnapshot === true
        ? createEnumerationSnapshot(group.def, group.state)
        : undefined;
      for (const sample of group.samples) {
        const execution = execute(() => sample.compiled(sample.ctx, snapshot));
        if (execution.kind === 'ok') {
          if (execution.result) {
            okTrueCount += 1;
          } else {
            okFalseCount += 1;
          }
          continue;
        }
        errorCounts[execution.code] += 1;
      }
    }
  }

  return {
    durationMs: performance.now() - started,
    okTrueCount,
    okFalseCount,
    errorCounts,
  };
};

const determineVerdict = (deltaPct: number): 'improved' | 'within_threshold' | 'regressed' => {
  if (deltaPct <= -DELTA_THRESHOLD_PCT) {
    return 'improved';
  }
  if (Math.abs(deltaPct) <= DELTA_THRESHOLD_PCT) {
    return 'within_threshold';
  }
  return 'regressed';
};

describe('enumeration snapshot benchmark', () => {
  it('emits same-process compiled-with-snapshot vs raw-compiled timings', () => {
    assert.ok(FITL_COVERAGE.compiled > 0, 'Expected compiled FITL production predicates for benchmark coverage');
    assert.ok(PRODUCTION_GROUPS.length > 0, 'Expected grouped FITL production states for benchmark coverage');
    assert.ok(FOCUSED_GROUPS.length > 0, 'Expected focused snapshot benchmark states');

    assertParity(ALL_GROUPS);

    measure(ALL_GROUPS, { useSnapshot: false, iterations: WARMUP_ITERATIONS });
    measure(ALL_GROUPS, { useSnapshot: true, iterations: WARMUP_ITERATIONS });

    const rawMeasurement = measure(ALL_GROUPS, { useSnapshot: false, iterations: BENCHMARK_ITERATIONS });
    const snapshotMeasurement = measure(ALL_GROUPS, { useSnapshot: true, iterations: BENCHMARK_ITERATIONS });

    assert.equal(snapshotMeasurement.okTrueCount, rawMeasurement.okTrueCount);
    assert.equal(snapshotMeasurement.okFalseCount, rawMeasurement.okFalseCount);
    assert.deepEqual(snapshotMeasurement.errorCounts, rawMeasurement.errorCounts);

    const deltaPct = ((snapshotMeasurement.durationMs - rawMeasurement.durationMs) / rawMeasurement.durationMs) * 100;
    const verdict = determineVerdict(deltaPct);
    const sign = deltaPct > 0 ? '+' : '';

    console.warn(
      [
        'FITL enumeration snapshot benchmark:',
        `raw_compiled_duration_ms=${rawMeasurement.durationMs.toFixed(2)}`,
        `snapshot_compiled_duration_ms=${snapshotMeasurement.durationMs.toFixed(2)}`,
        `combined_duration_ms=${snapshotMeasurement.durationMs.toFixed(2)}`,
        `delta_pct=${sign}${deltaPct.toFixed(2)}`,
        `verdict=${verdict}`,
        `production_states=${PRODUCTION_GROUPS.length}`,
        `production_samples=${FITL_SAMPLES.length}`,
        `focused_states=${FOCUSED_GROUPS.length}`,
        `focused_samples=${FOCUSED_GROUPS.reduce((total, group) => total + group.samples.length, 0)}`,
        `iterations=${BENCHMARK_ITERATIONS}`,
        `compiled_predicates=${FITL_COVERAGE.compiled}`,
      ].join(' '),
    );

    assert.ok(Number.isFinite(rawMeasurement.durationMs) && rawMeasurement.durationMs >= 0);
    assert.ok(Number.isFinite(snapshotMeasurement.durationMs) && snapshotMeasurement.durationMs >= 0);
  });
});
