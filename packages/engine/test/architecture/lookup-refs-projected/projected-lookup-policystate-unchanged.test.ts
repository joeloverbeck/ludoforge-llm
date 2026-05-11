// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileProjectedLookupConsiderations,
  policyStateLookupExpr,
  policyStateLookupRefId,
} from './projected-lookup-compile-test-helpers.js';

describe('policyState lookup compiler behavior after projected surface split', () => {
  it('keeps current-state lookup fallback and compiled ref shape unchanged', () => {
    const result = compileProjectedLookupConsiderations({
      preferCurrentPopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: policyStateLookupExpr(),
        lookupFallback: { onUnavailable: 'noContribution' },
      },
    });

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    const consideration = result.gameDef?.agents?.compiled.considerations.preferCurrentPopulation;
    assert.equal(consideration?.hasPreviewRef, false);
    assert.equal(consideration?.hasLookupRef, true);
    assert.deepEqual(consideration?.lookupFallback, { onUnavailable: 'noContribution' });
    assert.equal(consideration?.previewFallback, undefined);
    const value = consideration?.value;
    assert.equal(value?.kind, 'ref');
    assert.deepEqual(
      value?.kind === 'ref' && value.ref.kind === 'lookup'
        ? {
            refId: `${value.ref.kind}.${value.ref.surface}.${value.ref.collection}.${value.ref.path.join('.')}`,
            surface: value.ref.surface,
            collection: value.ref.collection,
            keyType: value.ref.keyType,
            path: value.ref.path,
            onMissing: value.ref.onMissing,
            onHidden: value.ref.onHidden,
          }
        : undefined,
      {
        refId: policyStateLookupRefId,
        surface: 'policyState',
        collection: 'zones',
        keyType: 'ZoneId',
        path: ['properties', 'population'],
        onMissing: 'unavailable',
        onHidden: 'unavailable',
      },
    );
  });
});
