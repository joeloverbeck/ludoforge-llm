// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecPolicyExpr } from '../../../src/cnl/game-spec-doc.js';
import { compileProjectedLookupConsiderations } from './projected-lookup-compile-test-helpers.js';

const HIDDEN_OVERRIDE_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED;

const projectedLookupWithHiddenOverride = {
  lookup: {
    surface: 'previewOptionState',
    collection: 'zones',
    keyType: 'ZoneId',
    key: { ref: 'microturn.option.value' },
    path: ['variables', 'population'],
    onMissing: 'unavailable',
    onHidden: { kind: 'constant', value: 0 },
  },
} as unknown as GameSpecPolicyExpr;

describe('projected lookup hidden override diagnostic', () => {
  it('rejects constant onHidden overrides for projected lookups', () => {
    const result = compileProjectedLookupConsiderations({
      preferProjectedPopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: projectedLookupWithHiddenOverride,
        previewFallback: { onUnavailable: 'noContribution' },
      },
    });

    const diagnostic = result.diagnostics.find((entry) => entry.code === HIDDEN_OVERRIDE_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.considerations.preferProjectedPopulation.value.lookup.onHidden');
    assert.match(diagnostic?.message ?? '', /hidden state/u);
  });
});
