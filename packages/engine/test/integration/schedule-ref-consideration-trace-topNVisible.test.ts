// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SCHEDULE_REF_ID,
  evaluatePartialVisibilityPolicy,
  makePartialVisibilityDef,
  stateWithVisiblePrefix,
} from './fixtures/partial-visibility-fixtures.js';

describe('topNVisible schedule ref consideration trace', () => {
  it('pins ready observer metadata on per-candidate inputRefs', () => {
    const result = evaluatePartialVisibilityPolicy(def, stateWithVisiblePrefix(def, ['op-1'], ['coup-1']));

    assert.equal(result.kind, 'success');
    const govern = result.metadata.candidates.find((candidate) => candidate.actionId === 'govern');
    assert.deepEqual(govern?.inputRefs, {
      [SCHEDULE_REF_ID]: {
        status: 'ready',
        value: 1,
        observerPolicy: 'topNVisible',
        visiblePrefixLength: 2,
        visibleSequenceSources: [
          { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
          { zoneId: 'leader:none', availablePublic: 1, taken: 1 },
        ],
      },
    });
    assert.deepEqual(govern?.scoreContributions, [{ termId: 'useLowerBound', contribution: 10 }]);
    assert.equal(govern?.scheduleFallbackFired, undefined);
  });

  it('pins partial lowerBound metadata and fallbackApplied on per-candidate inputRefs', () => {
    const result = evaluatePartialVisibilityPolicy(def, stateWithVisiblePrefix(def, ['op-1'], ['op-2']));

    assert.equal(result.kind, 'success');
    const govern = result.metadata.candidates.find((candidate) => candidate.actionId === 'govern');
    assert.deepEqual(govern?.inputRefs, {
      [SCHEDULE_REF_ID]: {
        status: 'partial',
        partialKind: 'lowerBound',
        lowerBound: 2,
        observerPolicy: 'topNVisible',
        visiblePrefixLength: 2,
        visibleSequenceSources: [
          { zoneId: 'lookahead:none', availablePublic: 1, taken: 1 },
          { zoneId: 'leader:none', availablePublic: 1, taken: 1 },
        ],
        fallbackApplied: { kind: 'useLowerBound', numericValue: 2 },
      },
    });
    assert.deepEqual(govern?.scoreContributions, [{ termId: 'useLowerBound', contribution: 20 }]);
    assert.deepEqual(govern?.scheduleFallbackFired, {
      termId: 'useLowerBound',
      kind: 'useLowerBound',
      value: 2,
      reason: 'partial.lowerBound.visiblePrefixExhausted',
    });
  });
});

const def = makePartialVisibilityDef();
