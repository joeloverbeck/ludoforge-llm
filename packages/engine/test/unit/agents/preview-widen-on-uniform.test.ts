// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import type { PolicyPreviewDependencies } from '../../../src/agents/policy-preview.js';
import type { PreviewWideningState } from '../../../src/agents/preview-budget-allocator.js';
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
  type CompiledAgentPreviewBudgetConfig,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { createTrustedExecutableMove } from '../../../src/kernel/trusted-move.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

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

function createDef(budget: CompiledAgentPreviewBudgetConfig): GameDef {
  const catalog: AgentPolicyCatalog = withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'preview-widen-test',
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
      projected: { type: 'number' },
    },
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
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
        fingerprint: 'preview-widen-test',
        params: {},
        preview: { mode: 'exactWorld', budget },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: [],
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
    bindingsBySeat: { alpha: 'baseline', beta: 'baseline' },
  });

  return {
    metadata: { id: 'preview-widen-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'projected', type: 'int', init: 0, min: 0, max: 1000 },
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
    actions: [{
      id: actionId,
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    triggers: [],
    terminal: { conditions: [] },
  };
}

function createMoves(projectedValues: readonly number[]): readonly Move[] {
  return projectedValues.map((projected, index) => ({
    actionId,
    params: { rank: projectedValues.length - index, projected },
  }));
}

function evaluate(
  budget: CompiledAgentPreviewBudgetConfig,
  moves: readonly Move[],
  wideningState: PreviewWideningState,
  context: { readonly turnId: number; readonly seatId: string } = { turnId: 0, seatId: 'alpha' },
): ReturnType<typeof evaluatePolicyMoveCore> {
  const def = createDef(budget);
  const { state } = initialState(def, 42, 2);
  const trustedMoveIndex = new Map(
    moves.map((move) => [
      toMoveIdentityKey(def, move),
      createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
    ]),
  );
  const previewDependencies: PolicyPreviewDependencies = {
    applyMove(currentDef, currentState, trustedMove) {
      return {
        state: {
          ...currentState,
          globalVars: {
            ...currentState.globalVars,
            projected: Number(trustedMove.move.params.projected),
          },
        },
      };
    },
  };

  return evaluatePolicyMoveCore({
    def,
    state,
    playerId: context.seatId === 'beta' ? asPlayerId(1) : asPlayerId(0),
    legalMoves: moves,
    trustedMoveIndex,
    rng: { state: state.rng },
    previewDependencies,
    previewWideningState: wideningState,
    previewDecisionContext: context,
  });
}

const widenBudget: CompiledAgentPreviewBudgetConfig = {
  strategy: 'balancedCoverage',
  fullCandidateCap: 2,
  minPerGroup: 1,
  widenOnUniformProjection: true,
  widenCap: 4,
  widenStep: 2,
};

describe('preview widen-on-uniform allocator memory', () => {
  it('widens the next same-class decision after constant preview utility', () => {
    const wideningState: PreviewWideningState = new Map();
    const moves = createMoves([7, 7, 7, 7]);

    const first = evaluate(widenBudget, moves, wideningState);
    const second = evaluate(widenBudget, moves, wideningState);

    assert.equal(first.kind, 'success');
    assert.equal(first.metadata.previewUsage.utility, 'constant');
    assert.equal(first.metadata.previewUsage.widenedBecauseUniform, false);
    assert.equal(first.metadata.previewUsage.outcomeBreakdown.ready, 2);
    assert.equal(second.kind, 'success');
    assert.equal(second.metadata.previewUsage.widenedBecauseUniform, true);
    assert.equal(second.metadata.previewUsage.outcomeBreakdown.ready, 4);
    assert.equal(second.metadata.candidates.filter((candidate) => candidate.selectionReason === 'widening').length, 2);
  });

  it('does not widen after differentiating preview utility', () => {
    const wideningState: PreviewWideningState = new Map();
    const moves = createMoves([7, 9, 7, 7]);

    const first = evaluate(widenBudget, moves, wideningState);
    const second = evaluate(widenBudget, moves, wideningState);

    assert.equal(first.kind, 'success');
    assert.equal(first.metadata.previewUsage.utility, 'differentiating');
    assert.equal(second.kind, 'success');
    assert.equal(second.metadata.previewUsage.widenedBecauseUniform, false);
    assert.equal(second.metadata.previewUsage.outcomeBreakdown.ready, 2);
  });

  it('bounds cumulative widening by widenStep times widenCap', () => {
    const wideningState: PreviewWideningState = new Map();
    const budget: CompiledAgentPreviewBudgetConfig = {
      ...widenBudget,
      fullCandidateCap: 1,
      widenCap: 2,
      widenStep: 2,
    };
    const moves = createMoves([7, 7, 7, 7, 7]);

    const results = [
      evaluate(budget, moves, wideningState),
      evaluate(budget, moves, wideningState),
      evaluate(budget, moves, wideningState),
      evaluate(budget, moves, wideningState),
    ];

    assert.deepEqual(results.map((result) => result.kind), ['success', 'success', 'success', 'success']);
    assert.deepEqual(results.map((result) => result.metadata.previewUsage.outcomeBreakdown.ready), [1, 3, 3, 1]);
    assert.deepEqual(results.map((result) => result.metadata.previewUsage.widenedBecauseUniform), [false, true, true, false]);
  });

  it('clears memory on turn boundary', () => {
    const wideningState: PreviewWideningState = new Map();
    const moves = createMoves([7, 7, 7, 7]);

    const first = evaluate(widenBudget, moves, wideningState, { turnId: 0, seatId: 'alpha' });
    const nextTurn = evaluate(widenBudget, moves, wideningState, { turnId: 1, seatId: 'alpha' });

    assert.equal(first.kind, 'success');
    assert.equal(first.metadata.previewUsage.utility, 'constant');
    assert.equal(nextTurn.kind, 'success');
    assert.equal(nextTurn.metadata.previewUsage.widenedBecauseUniform, false);
    assert.equal(nextTurn.metadata.previewUsage.outcomeBreakdown.ready, 2);
  });

  it('isolates memory by decision-class seat', () => {
    const wideningState: PreviewWideningState = new Map();
    const moves = createMoves([7, 7, 7, 7]);

    const alpha = evaluate(widenBudget, moves, wideningState, { turnId: 0, seatId: 'alpha' });
    const beta = evaluate(widenBudget, moves, wideningState, { turnId: 0, seatId: 'beta' });

    assert.equal(alpha.kind, 'success');
    assert.equal(alpha.metadata.previewUsage.utility, 'constant');
    assert.equal(beta.kind, 'success');
    assert.equal(beta.metadata.previewUsage.widenedBecauseUniform, false);
    assert.equal(beta.metadata.previewUsage.outcomeBreakdown.ready, 2);
  });

  it('keeps Phase B allocation unchanged when widening is disabled', () => {
    const wideningState: PreviewWideningState = new Map([['0:alpha', { lastUtility: 'constant', usedWidenSteps: 0 }]]);
    const moves = createMoves([7, 7, 7, 7]);
    const budget: CompiledAgentPreviewBudgetConfig = {
      strategy: 'balancedCoverage',
      fullCandidateCap: 2,
      minPerGroup: 1,
    };

    const result = evaluate(budget, moves, wideningState);

    assert.equal(result.kind, 'success');
    assert.equal(result.metadata.previewUsage.widenedBecauseUniform, false);
    assert.equal(result.metadata.previewUsage.outcomeBreakdown.ready, 2);
    assert.equal(result.metadata.candidates.some((candidate) => candidate.selectionReason === 'widening'), false);
  });
});
