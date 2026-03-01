import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TurnFlowActionClassSchema } from '../../../src/kernel/schemas-extensions.js';
import {
  TURN_FLOW_ACTION_CLASS_VALUES,
  isTurnFlowActionClass,
} from '../../../src/contracts/turn-flow-action-class-contract.js';

describe('turn-flow action-class schema/runtime parity', () => {
  it('accepts every canonical action-class value in both runtime guard and schema', () => {
    for (const value of TURN_FLOW_ACTION_CLASS_VALUES) {
      assert.equal(isTurnFlowActionClass(value), true, `runtime guard should accept ${value}`);
      assert.equal(TurnFlowActionClassSchema.safeParse(value).success, true, `schema should accept ${value}`);
    }
  });

  it('rejects non-canonical action-class values in both runtime guard and schema', () => {
    const invalidValues = [
      '',
      'pass ',
      'PASS',
      'freeOperation',
      'operation_plus_special_activity',
      'limited-operation',
    ] as const;

    for (const value of invalidValues) {
      assert.equal(isTurnFlowActionClass(value), false, `runtime guard should reject ${value}`);
      assert.equal(TurnFlowActionClassSchema.safeParse(value).success, false, `schema should reject ${value}`);
    }
  });

  it('keeps schema enum options exactly aligned with canonical action-class values', () => {
    assert.deepEqual(
      TurnFlowActionClassSchema.options,
      [...TURN_FLOW_ACTION_CLASS_VALUES],
      'schema enum options must match canonical action-class values exactly',
    );
  });
});
