import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  toFreeOperationChoiceIllegalReason,
  toFreeOperationDeniedCauseForLegality,
} from '../../../src/kernel/free-operation-legality-policy.js';

describe('free-operation legality policy', () => {
  it('classifies legality-relevant denial causes and ignores non-legality causes', () => {
    assert.equal(toFreeOperationDeniedCauseForLegality('granted'), null);
    assert.equal(toFreeOperationDeniedCauseForLegality('notFreeOperationMove'), null);
    assert.equal(toFreeOperationDeniedCauseForLegality('nonCardDrivenTurnOrder'), null);

    assert.equal(toFreeOperationDeniedCauseForLegality('noActiveSeatGrant'), 'noActiveSeatGrant');
    assert.equal(toFreeOperationDeniedCauseForLegality('sequenceLocked'), 'sequenceLocked');
    assert.equal(toFreeOperationDeniedCauseForLegality('actionClassMismatch'), 'actionClassMismatch');
    assert.equal(toFreeOperationDeniedCauseForLegality('actionIdMismatch'), 'actionIdMismatch');
    assert.equal(toFreeOperationDeniedCauseForLegality('zoneFilterMismatch'), 'zoneFilterMismatch');
  });

  it('maps denied causes to legalChoices illegal reasons deterministically', () => {
    assert.equal(toFreeOperationChoiceIllegalReason('noActiveSeatGrant'), 'freeOperationNoActiveSeatGrant');
    assert.equal(toFreeOperationChoiceIllegalReason('sequenceLocked'), 'freeOperationSequenceLocked');
    assert.equal(toFreeOperationChoiceIllegalReason('actionClassMismatch'), 'freeOperationActionClassMismatch');
    assert.equal(toFreeOperationChoiceIllegalReason('actionIdMismatch'), 'freeOperationActionIdMismatch');
    assert.equal(toFreeOperationChoiceIllegalReason('zoneFilterMismatch'), 'freeOperationZoneFilterMismatch');
  });
});
