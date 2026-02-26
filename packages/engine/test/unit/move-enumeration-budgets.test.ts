import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_MOVE_ENUMERATION_BUDGETS,
  resolveMoveEnumerationBudgets,
} from '../../src/kernel/index.js';

describe('resolveMoveEnumerationBudgets', () => {
  it('returns defaults when no override provided', () => {
    const result = resolveMoveEnumerationBudgets();
    assert.deepEqual(result, DEFAULT_MOVE_ENUMERATION_BUDGETS);
  });

  it('returns defaults when override is undefined', () => {
    const result = resolveMoveEnumerationBudgets(undefined);
    assert.deepEqual(result, DEFAULT_MOVE_ENUMERATION_BUDGETS);
  });

  it('overrides individual fields correctly', () => {
    const result = resolveMoveEnumerationBudgets({ maxTemplates: 500 });
    assert.equal(result.maxTemplates, 500);
    assert.equal(result.maxParamExpansions, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxParamExpansions);
    assert.equal(result.maxDecisionProbeSteps, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxDecisionProbeSteps);
    assert.equal(result.maxDeferredPredicates, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxDeferredPredicates);
  });

  it('overrides multiple fields at once', () => {
    const result = resolveMoveEnumerationBudgets({
      maxTemplates: 100,
      maxParamExpansions: 200,
    });
    assert.equal(result.maxTemplates, 100);
    assert.equal(result.maxParamExpansions, 200);
  });

  it('rejects negative values (falls back to default)', () => {
    const result = resolveMoveEnumerationBudgets({ maxTemplates: -1 });
    assert.equal(result.maxTemplates, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxTemplates);
  });

  it('rejects non-integer values (falls back to default)', () => {
    const result = resolveMoveEnumerationBudgets({ maxTemplates: 3.7 });
    assert.equal(result.maxTemplates, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxTemplates);
  });

  it('rejects NaN (falls back to default)', () => {
    const result = resolveMoveEnumerationBudgets({ maxTemplates: NaN });
    assert.equal(result.maxTemplates, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxTemplates);
  });

  it('rejects Infinity (falls back to default)', () => {
    const result = resolveMoveEnumerationBudgets({ maxTemplates: Infinity });
    assert.equal(result.maxTemplates, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxTemplates);
  });

  it('accepts zero as a valid budget', () => {
    const result = resolveMoveEnumerationBudgets({ maxTemplates: 0 });
    assert.equal(result.maxTemplates, 0);
  });

  it('accepts large safe integers', () => {
    const result = resolveMoveEnumerationBudgets({ maxTemplates: Number.MAX_SAFE_INTEGER });
    assert.equal(result.maxTemplates, Number.MAX_SAFE_INTEGER);
  });
});
