// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import type { PolicyPreviewDependencies } from '../../../src/agents/policy-preview.js';
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
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { createTrustedExecutableMove } from '../../../src/kernel/trusted-move.js';

const phaseId = asPhaseId('main');
const actionId = asActionId('choose');
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
  topK: number,
  options: { readonly materializePreviewInPruning?: boolean } = {},
): GameDef {
  const catalog: AgentPolicyCatalog = {
    schemaVersion: 2,
    catalogFingerprint: 'topk-test',
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
      candidateFeatures: {},
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
          value: {
            kind: 'op',
            op: 'coalesce',
            args: [
              refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'projected' }),
              literal(0),
            ],
          },
          dependencies: emptyDeps,
        },
      },
      tieBreakers: {
        stable: { kind: 'stableMoveKey', costClass: 'state', dependencies: emptyDeps },
      },
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: `topk-${topK}`,
        params: {},
        preview: { mode: 'exactWorld', topK },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: options.materializePreviewInPruning === true ? ['warmPreview'] : [],
          considerations: ['moveRank', 'projectedScore'],
          tieBreakers: ['stable'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
          considerations: ['moveRank', 'projectedScore'],
        },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  };

  return {
    metadata: { id: 'topk-preview-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'projected', type: 'int', init: 0, min: 0, max: 1000 }],
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
    actions: [
      {
        id: actionId,
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  };
}

function createMoves(ranks: readonly number[]): readonly Move[] {
  return ranks.map((rank) => ({ actionId, params: { rank } }));
}

function runTopK(
  topK: number,
  moves: readonly Move[],
  options: { readonly materializePreviewInPruning?: boolean } = {},
): {
  readonly result: ReturnType<typeof evaluatePolicyMoveCore>;
  readonly previewedKeys: ReadonlySet<string>;
  readonly state: GameState;
  readonly def: GameDef;
} {
  const def = createDef(topK, options);
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

describe('policy evaluation top-K preview gate', () => {
  it('previews only the highest move-only candidate when topK=1', () => {
    const { def, previewedKeys, result } = runTopK(1, createMoves([1, 3, 2]));

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

  it('previews every candidate when topK is at least the candidate count', () => {
    const moves = createMoves([1, 2, 3]);
    const { previewedKeys, result } = runTopK(3, moves);

    assert.equal(result.kind, 'success');
    assert.equal(previewedKeys.size, 3);
    assert.equal(result.metadata.previewGatedCount, 0);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.ready, 3);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.unknownGated, 0);
  });

  it('with default-sized topK=4 over twelve candidates gates the lower eight', () => {
    const moves = createMoves([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const { previewedKeys, result } = runTopK(4, moves);

    assert.equal(result.kind, 'success');
    assert.equal(previewedKeys.size, 4);
    assert.equal(result.metadata.previewGatedCount, 8);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.ready, 4);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.unknownGated, 8);
  });

  it('uses stableMoveKey ordering to break ties at the top-K boundary', () => {
    const moves = [
      { actionId, params: { rank: 7, label: 'charlie' } },
      { actionId, params: { rank: 7, label: 'alpha' } },
      { actionId, params: { rank: 7, label: 'bravo' } },
    ];
    const { def, previewedKeys, result } = runTopK(2, moves);
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

  it('detects when an already-cached gated preview would have flipped the selected candidate', () => {
    const moves = [
      { actionId, params: { rank: 10, projected: 0 } },
      { actionId, params: { rank: 1, projected: 1000 } },
    ];
    const { result } = runTopK(1, moves, { materializePreviewInPruning: true });

    assert.equal(result.kind, 'success');
    assert.equal(result.move?.params.rank, 10);
    assert.equal(result.metadata.previewGatedCount, 1);
    assert.equal(result.metadata.previewGatedTopFlipDetected, true);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.unknownGated, 1);
  });
});
