// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import type { PolicyPreviewDependencies } from '../../../src/agents/policy-preview.js';
import { __internal_for_tests as policyWasmRuntimeInternals } from '../../../src/agents/policy-wasm-runtime.js';
import { initializePolicyWasmRuntimeSync } from '../../../src/agents/policy-wasm-runtime-node-loader.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentDependencyRefs,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { createTrustedExecutableMove } from '../../../src/kernel/trusted-move.js';
import { setVar } from '../../../src/kernel/ast-builders.js';

const phaseId = asPhaseId('main');
const actionId = asActionId('choose');
const coverageActionIds = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map(asActionId);
const emptyDeps: CompiledAgentDependencyRefs = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
};

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: Extract<AgentPolicyExpr, { readonly kind: 'ref' }>['ref']): AgentPolicyExpr => ({ kind: 'ref', ref });

function createDef(
  fullCandidateCap: number,
  options: {
    readonly materializePreviewInPruning?: boolean;
    readonly usePreviewStateFeatureRows?: boolean;
    readonly minPerGroup?: number;
    readonly actionEffects?: Readonly<Record<string, GameDef['actions'][number]['effects']>>;
  } = {},
): GameDef {
  const catalog: AgentPolicyCatalog = withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'preview-budget-test',
    surfaceVisibility: {
      globalVars: {
        projected: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      },
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        currentRank: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      },
      activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    parameterDefs: {},
    candidateParamDefs: {
      rank: { type: 'number' },
    },
    library: {
      stateFeatures: {
        projected: {
          type: 'number',
          costClass: 'state',
          expr: refExpr({ kind: 'currentSurface', family: 'globalVar', id: 'projected' }),
          dependencies: emptyDeps,
        },
      },
      candidateFeatures: {
        ...(options.usePreviewStateFeatureRows === true
          ? {
              projectedFromStateFeature: {
                type: 'number',
                costClass: 'preview',
                expr: refExpr({
                  kind: 'library',
                  refKind: 'previewStateFeature',
                  id: 'projected',
                } as never),
                dependencies: {
                  parameters: [],
                  stateFeatures: ['projected'],
                  candidateFeatures: [],
                  aggregates: [],
                  strategicConditions: [],
                },
              },
            }
          : {}),
      },
      candidateAggregates: {},
      pruningRules: {
        ...(options.materializePreviewInPruning === true
          ? {
              warmPreview: {
                costClass: 'preview',
                when: {
                  kind: 'op',
                  op: 'coalesce',
                  args: [
                    refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'projected' }),
                    literal(false),
                  ],
                },
                dependencies: emptyDeps,
                onEmpty: 'skipRule',
              },
            }
          : {}),
      },
      considerations: {
        moveRank: {
          scopes: ['move'],
          costClass: 'state',
          weight: literal(1),
          value: refExpr({ kind: 'candidateParam', id: 'rank' }),
          dependencies: emptyDeps,
        },
        projectedScore: {
          scopes: ['move'],
          costClass: 'preview',
          weight: literal(1),
          value: options.usePreviewStateFeatureRows === true
            ? refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedFromStateFeature' })
            : {
                kind: 'op',
                op: 'coalesce',
                args: [
                  refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'projected' }),
                  literal(0),
                ],
              },
          dependencies: options.usePreviewStateFeatureRows === true
            ? {
                parameters: [],
                stateFeatures: ['projected'],
                candidateFeatures: ['projectedFromStateFeature'],
                aggregates: [],
                strategicConditions: [],
              }
            : emptyDeps,
        },
      },
      tieBreakers: {
        stable: { kind: 'stableMoveKey', costClass: 'state', dependencies: emptyDeps },
      },
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: `preview-budget-${fullCandidateCap}`,
        params: {},
        preview: {
          mode: 'exactWorld',
          budget: { strategy: 'balancedCoverage', fullCandidateCap, minPerGroup: options.minPerGroup ?? 1 },
        },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: options.materializePreviewInPruning === true ? ['warmPreview'] : [],
          considerations: ['moveRank', 'projectedScore'],
          tieBreakers: ['stable'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: options.usePreviewStateFeatureRows === true ? ['projectedFromStateFeature'] : [],
          candidateAggregates: [],
          considerations: ['moveRank', 'projectedScore'],
        },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });

  return {
    metadata: { id: 'preview-budget-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'projected', type: 'int', init: 0, min: 0, max: 1000 },
      { name: 'unrelated', type: 'int', init: 0, min: 0, max: 1000 },
    ],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
    ],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [actionId, ...coverageActionIds].map((id) => ({
      id,
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: options.actionEffects?.[String(id)] ?? [],
      limits: [],
    })),
    triggers: [],
    terminal: { conditions: [] },
  };
}

function createMoves(ranks: readonly number[]): readonly Move[] {
  return ranks.map((rank) => ({ actionId, params: { rank } }));
}

function createCoverageMoves(): readonly Move[] {
  return coverageActionIds.flatMap((id, index) => [
    { actionId: id, params: { rank: 1 + index * 2 } },
    { actionId: id, params: { rank: 2 + index * 2 } },
  ]);
}

function runPreviewBudget(
  fullCandidateCap: number,
  moves: readonly Move[],
  options: {
    readonly materializePreviewInPruning?: boolean;
    readonly usePreviewStateFeatureRows?: boolean;
    readonly minPerGroup?: number;
    readonly actionEffects?: Readonly<Record<string, GameDef['actions'][number]['effects']>>;
  } = {},
): {
  readonly result: ReturnType<typeof evaluatePolicyMoveCore>;
  readonly previewedKeys: ReadonlySet<string>;
  readonly state: GameState;
  readonly def: GameDef;
} {
  const def = createDef(fullCandidateCap, options);
  const { state } = initialState(def, 42, 2);
  const trustedMoveIndex = new Map(
    moves.map((move) => [
      toMoveIdentityKey(def, move),
      createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
    ]),
  );
  const previewedKeys = new Set<string>();
  const previewDependencies: PolicyPreviewDependencies = {
    applyMove(currentDef, currentState, trustedMove) {
      previewedKeys.add(toMoveIdentityKey(currentDef, trustedMove.move));
      const projected = trustedMove.move.params.projected;
      const rank = trustedMove.move.params.rank;
      return {
        state: {
          ...currentState,
          globalVars: {
            ...currentState.globalVars,
            projected: typeof projected === 'number'
              ? projected
              : typeof rank === 'number' ? rank * 10 : 0,
          },
        },
      };
    },
  };

  return {
    def,
    state,
    previewedKeys,
    result: evaluatePolicyMoveCore({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: moves,
      trustedMoveIndex,
      rng: { state: state.rng },
      previewDependencies,
    }),
  };
}

function keyFor(def: GameDef, rank: number): string {
  return toMoveIdentityKey(def, { actionId, params: { rank } });
}

describe('policy evaluation preview budget allocator', () => {
  it('uses the move-only prior within a group when the cap is one', () => {
    const { def, previewedKeys, result } = runPreviewBudget(1, createMoves([1, 3, 2]));

    assert.equal(result.kind, 'success');
    assert.deepEqual([...previewedKeys], [keyFor(def, 3)]);
    assert.equal(result.move?.params.rank, 3);
    assert.equal(result.metadata.previewGatedCount, 2);
    assert.equal(result.metadata.previewGatedTopFlipDetected, undefined);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.ready, 1);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.unknownGated, 2);
    assert.equal(result.metadata.candidates.find((candidate) => candidate.stableMoveKey === keyFor(def, 1))?.previewOutcome, 'gated');
    assert.equal(result.metadata.candidates.find((candidate) => candidate.stableMoveKey === keyFor(def, 2))?.previewOutcome, 'gated');
    assert.equal(result.metadata.candidates.find((candidate) => candidate.stableMoveKey === keyFor(def, 3))?.previewOutcome, 'ready');
  });

  it('previews every candidate when fullCandidateCap is at least the candidate count', () => {
    const moves = createMoves([1, 2, 3]);
    const { previewedKeys, result } = runPreviewBudget(3, moves);

    assert.equal(result.kind, 'success');
    assert.equal(previewedKeys.size, 3);
    assert.equal(result.metadata.previewGatedCount, 0);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.ready, 3);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.unknownGated, 0);
  });

  it('with fullCandidateCap=4 over twelve same-group candidates gates the lower eight', () => {
    const moves = createMoves([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const { previewedKeys, result } = runPreviewBudget(4, moves);

    assert.equal(result.kind, 'success');
    assert.equal(previewedKeys.size, 4);
    assert.equal(result.metadata.previewGatedCount, 8);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.ready, 4);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.unknownGated, 8);
  });

  it('covers the first four action groups before prior fill when cap is four', () => {
    const moves = createCoverageMoves();
    const { def, previewedKeys, result } = runPreviewBudget(4, moves);
    const previewedActionIds = new Set(
      moves
        .filter((move) => previewedKeys.has(toMoveIdentityKey(def, move)))
        .map((move) => String(move.actionId)),
    );

    assert.equal(result.kind, 'success');
    assert.deepEqual([...previewedActionIds].sort(), ['alpha', 'bravo', 'charlie', 'delta']);
    assert.equal(result.metadata.previewGatedCount, 8);
    assert.equal(result.metadata.candidates.filter((candidate) => candidate.selectionReason === 'coverage').length, 4);
  });

  it('uses stableMoveKey ordering to break ties at the budget boundary', () => {
    const moves = [
      { actionId, params: { rank: 7, label: 'charlie' } },
      { actionId, params: { rank: 7, label: 'alpha' } },
      { actionId, params: { rank: 7, label: 'bravo' } },
    ];
    const { def, previewedKeys, result } = runPreviewBudget(2, moves);
    const expectedPreviewedKeys = moves
      .map((move) => toMoveIdentityKey(def, move))
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 2);

    assert.equal(result.kind, 'success');
    assert.deepEqual([...previewedKeys].sort((left, right) => left.localeCompare(right)), expectedPreviewedKeys);
    assert.equal(result.metadata.previewGatedCount, 1);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.ready, 2);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.unknownGated, 1);
  });

  it('uses structural impact to rank the prior pass after coverage is skipped', () => {
    const moves = [
      { actionId: asActionId('alpha'), params: { rank: 1 } },
      { actionId: asActionId('bravo'), params: { rank: 1 } },
    ];
    const actionEffects: NonNullable<Parameters<typeof createDef>[1]>['actionEffects'] = {
      alpha: [setVar({ scope: 'global', var: 'unrelated', value: 1 })],
      bravo: [setVar({ scope: 'global', var: 'projected', value: 1 })],
    };
    const { def, previewedKeys, result } = runPreviewBudget(1, moves, { minPerGroup: 0, actionEffects });

    assert.equal(result.kind, 'success');
    assert.deepEqual([...previewedKeys], [toMoveIdentityKey(def, moves[1]!)]);
    assert.equal(result.metadata.candidates.find((candidate) => candidate.stableMoveKey === toMoveIdentityKey(def, moves[1]!))?.selectionReason, 'prior');
  });

  it('detects when an already-cached gated preview would have flipped the selected candidate', () => {
    const moves = [
      { actionId, params: { rank: 10, projected: 0 } },
      { actionId, params: { rank: 1, projected: 1000 } },
    ];
    const { result } = runPreviewBudget(1, moves, { materializePreviewInPruning: true });

    assert.equal(result.kind, 'success');
    assert.equal(result.move?.params.rank, 10);
    assert.equal(result.metadata.previewGatedCount, 1);
    assert.equal(result.metadata.previewGatedTopFlipDetected, true);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.unknownGated, 1);
  });

  it('materializes preview-state feature rows through the production WASM route', () => {
    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(initializePolicyWasmRuntimeSync());
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    try {
      const moves = createMoves([3]);
      const { result, previewedKeys } = runPreviewBudget(3, moves, { usePreviewStateFeatureRows: true });

      assert.equal(result.kind, 'success');
      assert.equal(result.move?.params.rank, 3);
      assert.equal(previewedKeys.size, 0);
      assert.equal(policyWasmRuntimeInternals.getProductionScoreRowRouteCount(), 1);
      assert.equal(policyWasmRuntimeInternals.getProductionScoreRowUnsupportedCount(), 0);
      assert.equal(policyWasmRuntimeInternals.getProductionScoreRowBytecodeCompileCount(), 3);
      assert.equal(policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowRouteCount(), 1);
      assert.equal(policyWasmRuntimeInternals.getProductionPreviewCandidateFeatureRowUnsupportedCount(), 0);
      assert.equal(result.metadata.previewUsage.outcomeBreakdown.ready, 1);
    } finally {
      policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
      policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    }
  });
});
