// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectTurnFlowEligibilityOverrideWindowIds,
  collectTurnFlowActionPipelineWindowIds,
  findMissingTurnFlowLinkedWindows,
} from '../../../src/contracts/index.js';

describe('turn-flow linked window contract', () => {
  it('collects override window ids in declaration order', () => {
    const ids = collectTurnFlowEligibilityOverrideWindowIds({
      windows: [
        { id: 'window-a', usages: ['eligibilityOverride'] },
        { id: 'window-b', usages: ['eligibilityOverride', 'actionPipeline'] },
      ],
    });
    assert.deepEqual(ids, ['window-a', 'window-b']);
  });

  it('canonicalizes override window ids during collection', () => {
    const ids = collectTurnFlowEligibilityOverrideWindowIds({
      windows: [
        { id: ' window-a ', usages: ['eligibilityOverride'] },
        { id: 'cafe\u0301', usages: ['eligibilityOverride'] },
      ],
    });

    assert.deepEqual(ids, ['window-a', 'caf\u00e9']);
  });

  it('ignores windows that are not declared for eligibility override usage', () => {
    const ids = collectTurnFlowEligibilityOverrideWindowIds({
      windows: [
        { id: 'window-a', usages: ['actionPipeline'] },
        { id: 'window-b', usages: ['eligibilityOverride', 'actionPipeline'] },
      ],
    });

    assert.deepEqual(ids, ['window-b']);
  });

  it('fails closed when turnFlow.windows is absent instead of throwing', () => {
    assert.deepEqual(collectTurnFlowEligibilityOverrideWindowIds({}), []);
    assert.deepEqual(collectTurnFlowActionPipelineWindowIds({}), []);
  });

  it('returns missing linked window references with stable indices', () => {
    const missing = findMissingTurnFlowLinkedWindows(['window-a', 'missing', 'other-missing'], ['window-a']);
    assert.deepEqual(missing, [
      { index: 1, windowId: 'missing' },
      { index: 2, windowId: 'other-missing' },
    ]);
  });

  it('treats linked window ids as equivalent under trim and NFC canonicalization', () => {
    const missing = findMissingTurnFlowLinkedWindows([' window-a ', 'caf\u00e9'], ['window-a', 'cafe\u0301']);
    assert.deepEqual(missing, []);
  });
});
