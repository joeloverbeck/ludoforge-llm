// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asZoneId } from '../../../src/kernel/branded.js';
import { createEvalError } from '../../../src/kernel/eval-error.js';
import { evaluateFreeOperationZoneFilterProbe } from '../../../src/kernel/free-operation-zone-filter-probe.js';

describe('evaluateFreeOperationZoneFilterProbe()', () => {
  it('defers interpolated per-zone missing vars for the candidate zone', () => {
    const result = evaluateFreeOperationZoneFilterProbe({
      surface: 'legalChoices',
      zoneId: asZoneId('can-tho:none'),
      baseBindings: {},
      rebindableAliases: new Set<string>(),
      evaluateWithBindings: () => {
        throw createEvalError('MISSING_VAR', 'Binding not found: $movingTroops@can-tho:none', {
          binding: '$movingTroops@can-tho:none',
          bindingTemplate: '$movingTroops@{$space}',
          query: {
            query: 'binding',
            name: '$movingTroops@{$space}',
          },
        });
      },
    });

    assert.deepEqual(result, {
      status: 'deferred',
      reason: 'missingVar',
    });
  });

  it('defers unresolved binding-query template missing vars on legalChoices', () => {
    const error = createEvalError('MISSING_VAR', 'Binding not found: $targetSpaces', {
      binding: '$targetSpaces',
      bindingTemplate: '$targetSpaces',
      query: {
        query: 'binding',
        name: '$targetSpaces',
      },
    });
    const result = evaluateFreeOperationZoneFilterProbe({
      surface: 'legalChoices',
      zoneId: asZoneId('can-tho:none'),
      baseBindings: {},
      rebindableAliases: new Set<string>(),
      evaluateWithBindings: () => {
        throw error;
      },
    });

    assert.deepEqual(result, {
      status: 'deferred',
      reason: 'missingVar',
    });
  });

  it('fails unresolved binding-query template missing vars on turnFlowEligibility', () => {
    const error = createEvalError('MISSING_VAR', 'Binding not found: $targetSpaces', {
      binding: '$targetSpaces',
      bindingTemplate: '$targetSpaces',
      query: {
        query: 'binding',
        name: '$targetSpaces',
      },
    });
    const result = evaluateFreeOperationZoneFilterProbe({
      surface: 'turnFlowEligibility',
      zoneId: asZoneId('can-tho:none'),
      baseBindings: {},
      rebindableAliases: new Set<string>(),
      evaluateWithBindings: () => {
        throw error;
      },
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.error, error);
  });
});
