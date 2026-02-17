import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TurnFlowInterruptCancellationSchema } from '../../../src/kernel/schemas-extensions.js';
import {
  TURN_FLOW_INTERRUPT_SELECTOR_EMPTY_MESSAGE,
  hasTurnFlowInterruptSelectorMatchField,
} from '../../../src/kernel/turn-flow-interrupt-selector-contract.js';

describe('turn-flow interrupt selector contract', () => {
  it('requires at least one matching field', () => {
    assert.equal(hasTurnFlowInterruptSelectorMatchField({}), false);
    assert.equal(hasTurnFlowInterruptSelectorMatchField({ actionId: 'pivot' }), true);
    assert.equal(hasTurnFlowInterruptSelectorMatchField({ actionClass: 'event' }), true);
    assert.equal(hasTurnFlowInterruptSelectorMatchField({ eventCardTagsAny: ['pivotal'] }), true);
    assert.equal(hasTurnFlowInterruptSelectorMatchField({ paramEquals: { eventCardId: 'x' } }), true);
  });

  it('keeps schema-layer empty-selector diagnostics aligned with shared contract message', () => {
    const parsed = TurnFlowInterruptCancellationSchema.safeParse({
      winner: {},
      canceled: { actionId: 'pivot' },
    });

    assert.equal(parsed.success, false);
    if (parsed.success) {
      return;
    }
    assert.equal(parsed.error.issues.some((issue) => issue.message === TURN_FLOW_INTERRUPT_SELECTOR_EMPTY_MESSAGE), true);
  });
});
