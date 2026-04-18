// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EVAL_ERROR_DEFER_CLASS } from '../../../src/kernel/eval-error-defer-class.js';
import { createEvalError } from '../../../src/kernel/eval-error.js';
import { FREE_OPERATION_ZONE_FILTER_SURFACES } from '../../../src/kernel/free-operation-zone-filter-contract.js';
import {
  MISSING_BINDING_POLICY_CONTEXTS,
  isPerZoneInterpolatedBindingMissingVar,
  isUnresolvedTemplateBindingMissingVar,
  shouldDeferFreeOperationZoneFilterFailure,
  shouldDeferMissingBinding,
} from '../../../src/kernel/missing-binding-policy.js';

describe('shouldDeferMissingBinding()', () => {
  const policyContexts = Object.values(MISSING_BINDING_POLICY_CONTEXTS);

  it('defers missing-binding errors for supported discovery contexts', () => {
    const missing = createEvalError('MISSING_BINDING', 'missing');
    for (const context of policyContexts) {
      assert.equal(shouldDeferMissingBinding(missing, context), true);
    }
  });

  it('does not defer non-missing-binding eval errors', () => {
    const missingVar = createEvalError('MISSING_VAR', 'missing var');
    for (const context of policyContexts) {
      assert.equal(shouldDeferMissingBinding(missingVar, context), false);
    }
  });

  it('does not defer arbitrary non-eval errors', () => {
    assert.equal(
      shouldDeferMissingBinding(new Error('boom'), MISSING_BINDING_POLICY_CONTEXTS.PIPELINE_DISCOVERY_PREDICATE),
      false,
    );
  });

  it('defers structured unresolved-binding selector-cardinality only for event decision probing', () => {
    const selectorCardinality = createEvalError(
      'SELECTOR_CARDINALITY',
      'Expected exactly one zone',
      {
        selectorKind: 'zone',
        selector: 'hand:allOther',
        resolvedCount: 0,
        resolvedZones: [],
        deferClass: EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
      },
    );
    for (const context of policyContexts) {
      assert.equal(
        shouldDeferMissingBinding(selectorCardinality, context),
        context === MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE,
      );
    }
  });

  it('does not defer selector-cardinality without structured unresolved-binding metadata', () => {
    const selectorCardinality = createEvalError('SELECTOR_CARDINALITY', 'Expected exactly one zone', {
      selectorKind: 'zone',
      selector: '$targetProvince',
      resolvedCount: 0,
      resolvedZones: [],
    });
    assert.equal(
      shouldDeferMissingBinding(selectorCardinality, MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE),
      false,
    );
  });
});

describe('shouldDeferFreeOperationZoneFilterFailure()', () => {
  it('defers missing-binding only on legalChoices surface', () => {
    const missing = createEvalError('MISSING_BINDING', 'missing');
    assert.equal(shouldDeferFreeOperationZoneFilterFailure('legalChoices', missing), true);
    assert.equal(shouldDeferFreeOperationZoneFilterFailure('turnFlowEligibility', missing), false);
  });

  it('defers per-zone interpolated missing vars on legalChoices and turnFlowEligibility only', () => {
    const missingVar = createEvalError('MISSING_VAR', 'Binding not found: $movingTroops@can-tho:none', {
      binding: '$movingTroops@can-tho:none',
      bindingTemplate: '$movingTroops@{$space}',
      query: {
        query: 'binding',
        name: '$movingTroops@{$space}',
      },
    });
    assert.equal(shouldDeferFreeOperationZoneFilterFailure('legalChoices', missingVar), true);
    assert.equal(shouldDeferFreeOperationZoneFilterFailure('turnFlowEligibility', missingVar), true);
  });

  it('does not defer non-per-zone missing vars on either surface', () => {
    const missingVar = createEvalError('MISSING_VAR', 'Binding not found: $targetSpaces', {
      binding: '$targetSpaces',
      bindingTemplate: '$targetSpaces',
      query: {
        query: 'binding',
        name: '$targetSpaces',
      },
    });
    for (const surface of FREE_OPERATION_ZONE_FILTER_SURFACES) {
      assert.equal(shouldDeferFreeOperationZoneFilterFailure(surface, missingVar), false);
    }
  });
});

describe('isUnresolvedTemplateBindingMissingVar()', () => {
  it('recognizes unresolved binding-query templates that are still absent from the current bindings', () => {
    const missingVar = createEvalError('MISSING_VAR', 'Binding not found: $targetSpaces', {
      binding: '$targetSpaces',
      bindingTemplate: '$targetSpaces',
      query: {
        query: 'binding',
        name: '$targetSpaces',
      },
    });

    assert.equal(isUnresolvedTemplateBindingMissingVar(missingVar, {}), true);
    assert.equal(isUnresolvedTemplateBindingMissingVar(missingVar, { $targetSpaces: [] }), false);
  });

  it('rejects non-binding-query missing vars', () => {
    const missingVar = createEvalError('MISSING_VAR', 'Binding not found: $targetSpaces', {
      binding: '$targetSpaces',
      bindingTemplate: '$targetSpaces',
      query: {
        query: 'gvar',
        name: '$targetSpaces',
      },
    });

    assert.equal(isUnresolvedTemplateBindingMissingVar(missingVar, {}), false);
  });
});

describe('isPerZoneInterpolatedBindingMissingVar()', () => {
  it('recognizes interpolated binding-query missing vars and respects the candidate zone when provided', () => {
    const missingVar = createEvalError('MISSING_VAR', 'Binding not found: $movingTroops@can-tho:none', {
      binding: '$movingTroops@can-tho:none',
      bindingTemplate: '$movingTroops@{$space}',
      query: {
        query: 'binding',
        name: '$movingTroops@{$space}',
      },
    });

    assert.equal(isPerZoneInterpolatedBindingMissingVar(missingVar), true);
    assert.equal(isPerZoneInterpolatedBindingMissingVar(missingVar, 'can-tho:none'), true);
    assert.equal(isPerZoneInterpolatedBindingMissingVar(missingVar, 'an-loc:none'), false);
  });
});
