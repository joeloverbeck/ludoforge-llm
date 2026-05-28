// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../src/agents/policy-evaluation-core.js';
import {
  asActionId,
  asPlayerId,
  type CompiledPolicyExpr,
  type GameState,
} from '../../src/kernel/index.js';
import {
  makePartialVisibilityDef,
  scheduleDistanceRef,
  stateWithVisiblePrefix,
} from './fixtures/partial-visibility-fixtures.js';

describe('partial-visibility expression lower-bound fallback', () => {
  it('uses partial.lowerBound only when the schedule ref is explicitly wrapped', () => {
    const state = stateWithVisiblePrefix(def, ['op-1'], ['op-2']);
    const plain = evaluate(refExpr(), state);
    const wrapped = evaluate(scheduleLowerBoundExpr(), state);

    assert.equal(plain.value, undefined);
    assert.deepEqual(plain.trace?.get('schedule.distance.toBoundary.coupEntry.cards'), {
      status: 'partial',
      partialKind: 'lowerBound',
      lowerBound: 2,
      observerPolicy: 'topNVisible',
      visiblePrefixLength: 2,
      visibleSequenceSources: [
        { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
        { zoneId: 'leader:none', availablePublic: 1, taken: 1 },
      ],
    });
    assert.equal(wrapped.value, 2);
    const wrappedTrace = wrapped.trace?.get('schedule.distance.toBoundary.coupEntry.cards');
    assert.equal(wrappedTrace?.status, 'partial');
    assert.deepEqual(wrappedTrace.fallbackApplied, {
      kind: 'useLowerBound',
      numericValue: 2,
    });
  });

  it('preserves ready schedule-distance values through the explicit wrapper', () => {
    assert.equal(evaluate(scheduleLowerBoundExpr(), stateWithVisiblePrefix(def, ['coup-1'], ['op-1'])).value, 0);
    assert.equal(evaluate(scheduleLowerBoundExpr(), stateWithVisiblePrefix(def, ['op-1'], ['coup-1'])).value, 1);
  });
});

const def = makePartialVisibilityDef();

function refExpr(): CompiledPolicyExpr {
  return { kind: 'ref', ref: scheduleDistanceRef() };
}

function scheduleLowerBoundExpr(): CompiledPolicyExpr {
  return {
    kind: 'op',
    op: 'scheduleLowerBound',
    args: [refExpr()],
  };
}

function evaluate(expr: CompiledPolicyExpr, state: GameState) {
  const candidate = candidateForTrace();
  const context = new PolicyEvaluationContext({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: 'solo',
    catalog: def.agents!,
    parameterValues: {},
    trustedMoveIndex: new Map(),
    cacheBinding: { kind: 'isolated' },
  }, [candidate]);
  try {
    return {
      value: context.evaluateCompiledExpr(expr, candidate),
      trace: candidate.scheduleInputRefs,
    };
  } finally {
    context.dispose();
  }
}

function candidateForTrace(): PolicyEvaluationCandidate {
  return {
    move: { actionId: asActionId('govern'), params: {} },
    stableMoveKey: 'govern|{}|false|unclassified',
    actionId: 'govern',
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
}
