import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectTurnFlowEligibilityOverrideWindowIds,
  findMissingTurnFlowLinkedWindows,
} from '../../../src/contracts/index.js';

describe('turn-flow linked window contract', () => {
  it('collects override window ids in declaration order', () => {
    const ids = collectTurnFlowEligibilityOverrideWindowIds({
      eligibility: {
        overrideWindows: [
          { id: 'window-a' },
          { id: 'window-b' },
        ],
      },
    });
    assert.deepEqual(ids, ['window-a', 'window-b']);
  });

  it('canonicalizes override window ids during collection', () => {
    const ids = collectTurnFlowEligibilityOverrideWindowIds({
      eligibility: {
        overrideWindows: [
          { id: ' window-a ' },
          { id: 'cafe\u0301' },
        ],
      },
    });

    assert.deepEqual(ids, ['window-a', 'caf\u00e9']);
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
