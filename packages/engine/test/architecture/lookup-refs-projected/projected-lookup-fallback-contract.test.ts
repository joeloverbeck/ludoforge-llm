// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import {
  compileProjectedLookupConsiderations,
  policyStateLookupExpr,
  projectedLookupExpr,
  projectedLookupRefId,
} from './projected-lookup-compile-test-helpers.js';

const REQUIRED_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROJECTED_LOOKUP_REQUIRES_PREVIEW_FALLBACK;

describe('projected lookup fallback contract', () => {
  it('rejects projected lookups that declare only lookupFallback', () => {
    const result = compileProjectedLookupConsiderations({
      preferProjectedPopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: projectedLookupExpr(),
        lookupFallback: { onUnavailable: 'noContribution' },
      },
    });

    const diagnostic = result.diagnostics.find((entry) => entry.code === REQUIRED_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.considerations.preferProjectedPopulation.previewFallback');
    assert.match(diagnostic?.message ?? '', new RegExp(projectedLookupRefId.replaceAll('.', '\\.'), 'u'));
  });

  it('compiles projected lookups with only previewFallback', () => {
    const result = compileProjectedLookupConsiderations({
      preferProjectedPopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: projectedLookupExpr(),
        previewFallback: { onUnavailable: 'noContribution' },
      },
    });

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    const consideration = result.gameDef?.agents?.compiled.considerations.preferProjectedPopulation;
    assert.equal(consideration?.hasPreviewRef, true);
    assert.equal(consideration?.hasLookupRef, true);
    assert.deepEqual(consideration?.previewFallback, { onUnavailable: 'noContribution' });
    assert.equal(consideration?.lookupFallback, undefined);
  });

  it('compiles mixed current-state and projected-state lookups when both fallbacks are declared', () => {
    const result = compileProjectedLookupConsiderations({
      preferPopulationDelta: {
        scopes: ['microturn'],
        weight: 1,
        value: {
          add: [
            { coalesce: [projectedLookupExpr(), 0] },
            { coalesce: [policyStateLookupExpr(), 0] },
          ],
        },
        previewFallback: { onUnavailable: 'noContribution' },
        lookupFallback: { onUnavailable: 'noContribution' },
      },
    });

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    const consideration = result.gameDef?.agents?.compiled.considerations.preferPopulationDelta;
    assert.equal(consideration?.hasPreviewRef, true);
    assert.equal(consideration?.hasLookupRef, true);
    assert.deepEqual(consideration?.previewFallback, { onUnavailable: 'noContribution' });
    assert.deepEqual(consideration?.lookupFallback, { onUnavailable: 'noContribution' });
  });
});
