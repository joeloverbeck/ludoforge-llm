// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecPolicyExpr } from '../../../src/cnl/game-spec-doc.js';
import { compileProjectedLookupConsiderations } from './projected-lookup-compile-test-helpers.js';

const UNKNOWN_SURFACE_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_LOOKUP_UNKNOWN_SURFACE;

const unknownSurfaceLookup = {
  lookup: {
    surface: 'foo',
    collection: 'zones',
    keyType: 'ZoneId',
    key: { ref: 'microturn.option.value' },
    path: ['variables', 'population'],
    onMissing: 'unavailable',
  },
} as unknown as GameSpecPolicyExpr;

describe('projected lookup unknown surface diagnostic', () => {
  it('rejects unsupported lookup.surface literals with the registered surface diagnostic', () => {
    const result = compileProjectedLookupConsiderations({
      preferProjectedPopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: unknownSurfaceLookup,
        previewFallback: { onUnavailable: 'noContribution' },
      },
    });

    const diagnostic = result.diagnostics.find((entry) => entry.code === UNKNOWN_SURFACE_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.considerations.preferProjectedPopulation.value.lookup.surface');
    assert.match(diagnostic?.message ?? '', /foo/u);
  });
});
