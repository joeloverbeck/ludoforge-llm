import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  lowerConditionNode,
  type ConditionLoweringContext,
} from '../../../src/cnl/compile-conditions.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { assertNoDiagnostics } from '../../helpers/diagnostic-helpers.js';

const context: ConditionLoweringContext = {
  ownershipByBase: {
    deck: 'none',
    hand: 'player',
    board: 'none',
  },
};

describe('condition operator field-name mismatch diagnostics', () => {
  describe('membership operator (op: in)', () => {
    it('emits MEMBERSHIP_FIELD_MISMATCH when left/right are used instead of item/set', () => {
      const result = lowerConditionNode(
        { op: 'in', left: 1, right: [1, 2, 3] },
        context,
        'doc.actions.0.pre',
      );

      assert.equal(result.value, null);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(
        result.diagnostics[0]?.code,
        CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONDITION_MEMBERSHIP_FIELD_MISMATCH,
      );
      assert.equal(result.diagnostics[0]?.severity, 'error');
      assert.ok(result.diagnostics[0]?.message.includes('"item" and "set"'));
      assert.ok(result.diagnostics[0]?.message.includes('"left" and "right"'));
      assert.ok(result.diagnostics[0]?.suggestion?.includes('Rename'));
    });

    it('emits MEMBERSHIP_FIELD_MISMATCH when only left is present (no item)', () => {
      const result = lowerConditionNode(
        { op: 'in', left: 'x' },
        context,
        'doc.actions.0.pre',
      );

      assert.equal(result.value, null);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(
        result.diagnostics[0]?.code,
        CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONDITION_MEMBERSHIP_FIELD_MISMATCH,
      );
    });

    it('compiles successfully with correct item/set fields', () => {
      const result = lowerConditionNode(
        { op: 'in', item: 1, set: [1, 2, 3] },
        context,
        'doc.actions.0.pre',
      );

      assertNoDiagnostics(result);
      assert.deepEqual(result.value, { op: 'in', item: 1, set: { scalarArray: [1, 2, 3] } });
    });
  });

  describe('comparison operators (==, !=, <, <=, >, >=)', () => {
    it('emits COMPARISON_FIELD_MISMATCH when item/set are used instead of left/right', () => {
      const result = lowerConditionNode(
        { op: '==', item: 1, set: [1, 2, 3] },
        context,
        'doc.actions.0.pre',
      );

      assert.equal(result.value, null);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(
        result.diagnostics[0]?.code,
        CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONDITION_COMPARISON_FIELD_MISMATCH,
      );
      assert.equal(result.diagnostics[0]?.severity, 'error');
      assert.ok(result.diagnostics[0]?.message.includes('"left" and "right"'));
      assert.ok(result.diagnostics[0]?.message.includes('"item" and "set"'));
      assert.ok(result.diagnostics[0]?.suggestion?.includes('Rename'));
    });

    it('emits COMPARISON_FIELD_MISMATCH for != with item/set', () => {
      const result = lowerConditionNode(
        { op: '!=', item: 'a', set: 'b' },
        context,
        'doc.actions.0.pre',
      );

      assert.equal(result.value, null);
      assert.equal(
        result.diagnostics[0]?.code,
        CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONDITION_COMPARISON_FIELD_MISMATCH,
      );
    });

    it('compiles successfully with correct left/right fields', () => {
      const result = lowerConditionNode(
        { op: '==', left: 1, right: 1 },
        context,
        'doc.actions.0.pre',
      );

      assertNoDiagnostics(result);
      assert.deepEqual(result.value, { op: '==', left: 1, right: 1 });
    });
  });
});
