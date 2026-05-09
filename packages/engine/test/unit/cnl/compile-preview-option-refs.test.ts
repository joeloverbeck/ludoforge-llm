// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';
import type { AgentPolicyExpr, CompiledAgentPolicyRef } from '../../../src/kernel/types.js';

const refExpr = (ref: string) => ({ ref }) as const;

function createDoc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'compile-preview-option-refs-test', players: { min: 2, max: 2 } },
    observability: {
      observers: {
        testObserver: {
          surfaces: {
            victory: { currentMargin: 'public' },
            globalVars: { score: { current: 'public' } },
            perPlayerVars: { tempo: { current: 'public' } },
            derivedMetrics: { pressure: { current: 'public' } },
          },
        },
      },
    },
    globalVars: [{ name: 'score', type: 'int', init: 0, min: -100, max: 100 }],
    perPlayerVars: [{ name: 'tempo', type: 'int', init: 0, min: -100, max: 100 }],
    derivedMetrics: [{
      id: 'pressure',
      computation: 'markerTotal',
      requirements: [{ key: 'population', expectedType: 'number' }],
      runtime: {
        kind: 'markerTotal',
        markerId: 'support',
        markerConfig: {
          activeState: 'activeSupport',
          passiveState: 'passiveSupport',
        },
        defaultMarkerState: 'neutral',
      },
    }],
    zones: [{ id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set', attributes: { population: 1 } }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{
      id: 'pass',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [{ seat: 'us', value: 0 }, { seat: 'arvn', value: 0 }],
      ranking: { order: 'desc' },
    },
    dataAssets: [{
      id: 'seats',
      kind: 'seatCatalog',
      payload: { seats: [{ id: 'us' }, { id: 'arvn' }] },
    }],
  };
}

function collectRefs(expr: AgentPolicyExpr | undefined): readonly CompiledAgentPolicyRef[] {
  if (expr === undefined) return [];
  if (expr.kind === 'ref') return [expr.ref];
  if (expr.kind === 'op') return expr.args.flatMap((arg) => collectRefs(arg));
  if (expr.kind === 'seatAgg') return collectRefs(expr.expr);
  return [];
}

describe('preview.option policy refs', () => {
  it('lowers every authored preview.option ref to the compiled preview-option ref family', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          considerations: {
            margin: { scopes: ['microturn'], weight: 1, value: { coalesce: [refExpr('preview.option.victory.currentMargin.self'), 0] }, previewFallback: { onUnavailable: 'noContribution' } },
            rank: { scopes: ['microturn'], weight: 1, value: { coalesce: [refExpr('preview.option.victory.currentRank.self'), 0] }, previewFallback: { onUnavailable: 'noContribution' } },
            delta: { scopes: ['microturn'], weight: 1, value: { coalesce: [refExpr('preview.option.delta.victory.currentMargin.self'), 0] }, previewFallback: { onUnavailable: 'noContribution' } },
            globalVar: { scopes: ['microturn'], weight: 1, value: { coalesce: [refExpr('preview.option.var.global.score'), 0] }, previewFallback: { onUnavailable: 'noContribution' } },
            playerVar: { scopes: ['microturn'], weight: 1, value: { coalesce: [refExpr('preview.option.var.player.self.tempo'), 0] }, previewFallback: { onUnavailable: 'noContribution' } },
            metric: { scopes: ['microturn'], weight: 1, value: { coalesce: [refExpr('preview.option.metric.pressure'), 0] }, previewFallback: { onUnavailable: 'noContribution' } },
            outcome: {
              scopes: ['microturn'],
              weight: 1,
              value: { boolToNumber: { eq: [refExpr('preview.option.outcome'), 'ready'] } },
              previewFallback: { onUnavailable: 'noContribution' },
            },
            driveDepth: { scopes: ['microturn'], weight: 1, value: { coalesce: [refExpr('preview.option.driveDepth'), 0] }, previewFallback: { onUnavailable: 'noContribution' } },
          },
          tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        },
        profiles: {
          baseline: {
            observer: 'testObserver',
            params: {},
            use: {
              pruningRules: [],
              considerations: ['margin', 'rank', 'delta', 'globalVar', 'playerVar', 'metric', 'outcome', 'driveDepth'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: { us: 'baseline', arvn: 'baseline' },
      },
    });

    assert.equal(result.gameDef === null, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);

    const refs = Object.values(result.gameDef!.agents!.compiled.considerations)
      .flatMap((consideration) => [
        ...collectRefs(consideration.when),
        ...collectRefs(consideration.weight),
        ...collectRefs(consideration.value),
      ])
      .filter((ref) => ref.kind === 'previewOptionRef');

    assert.deepEqual(refs, [
      { kind: 'previewOptionRef', refKind: 'victoryCurrentMarginSelf' },
      { kind: 'previewOptionRef', refKind: 'victoryCurrentRankSelf' },
      { kind: 'previewOptionRef', refKind: 'deltaVictoryCurrentMarginSelf' },
      { kind: 'previewOptionRef', refKind: 'globalVar', id: 'score' },
      { kind: 'previewOptionRef', refKind: 'perPlayerVarSelf', id: 'tempo' },
      { kind: 'previewOptionRef', refKind: 'derivedMetric', id: 'pressure' },
      { kind: 'previewOptionRef', refKind: 'outcome' },
      { kind: 'previewOptionRef', refKind: 'driveDepth' },
    ]);
  });

  it('keeps preview.option refs microturn-scoped', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          considerations: {
            invalid: {
              scopes: ['move'],
              weight: 1,
              value: { coalesce: [refExpr('preview.option.driveDepth'), 0] },
              previewFallback: { onUnavailable: 'noContribution' },
            },
          },
          tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        },
        profiles: {
          baseline: {
            observer: 'testObserver',
            params: {},
            use: { pruningRules: [], considerations: ['invalid'], tieBreakers: ['stableMoveKey'] },
          },
        },
        bindings: { us: 'baseline', arvn: 'baseline' },
      },
    });

    assert.equal(result.gameDef, null);
    assert.ok(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION'
        && diagnostic.message.includes('move-scoped')
        && diagnostic.message.includes('microturn-only refs')),
    );
  });
});
