// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AGENT_POLICY_PREVIEW_PLAN_REF_KINDS } from '../../../src/contracts/policy-contract.js';
import {
  composePreviewPlanDelta,
  previewPlanRefKey,
} from '../../../src/agents/policy-evaluation-core.js';

describe('preview plan delta composition', () => {
  it('registers the plan-delta ref kind and trace key', () => {
    assert.deepEqual(AGENT_POLICY_PREVIEW_PLAN_REF_KINDS, ['deltaVictoryCurrentMarginSelf']);
    assert.equal(
      previewPlanRefKey({ kind: 'previewPlanRef', refKind: 'deltaVictoryCurrentMarginSelf' }),
      'preview.plan.delta.victory.currentMargin.self',
    );
  });

  it('aggregates supplied ready per-step deltas', () => {
    assert.deepEqual(
      composePreviewPlanDelta({
        stepCap: 3,
        stepStatuses: [
          { kind: 'ready', value: 4 },
          { kind: 'ready', value: -1 },
          { kind: 'ready', value: 2 },
        ],
      }),
      { kind: 'ready', value: 5 },
    );
  });

  it('folds the first non-ready step status without coercing a number', () => {
    assert.deepEqual(
      composePreviewPlanDelta({
        stepCap: 3,
        stepStatuses: [
          { kind: 'ready', value: 4 },
          { kind: 'unavailable', reason: 'postGrantCap' },
          { kind: 'ready', value: 2 },
        ],
      }),
      { kind: 'unavailable', reason: 'postGrantCap' },
    );
  });

  it('reports cap overflow as non-ready instead of escalating the cap', () => {
    assert.deepEqual(
      composePreviewPlanDelta({
        stepCap: 1,
        stepStatuses: [
          { kind: 'ready', value: 4 },
          { kind: 'ready', value: 2 },
        ],
      }),
      { kind: 'unavailable', reason: 'depthCap' },
    );
  });
});
