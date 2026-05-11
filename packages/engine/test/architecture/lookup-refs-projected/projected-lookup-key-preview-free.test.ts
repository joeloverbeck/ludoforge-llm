// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import {
  compileProjectedLookupConsiderations,
  projectedLookupExpr,
  projectedLookupRefId,
} from './projected-lookup-compile-test-helpers.js';

const KEY_NOT_PREVIEW_FREE_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROJECTED_LOOKUP_KEY_NOT_PREVIEW_FREE;

describe('projected lookup key preview-free validation', () => {
  it('compiles projected lookups whose key reads the microturn option value', () => {
    const result = compileProjectedLookupConsiderations({
      preferProjectedPopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: projectedLookupExpr({ ref: 'microturn.option.value' }),
        previewFallback: { onUnavailable: 'noContribution' },
      },
    });

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
  });

  it('rejects projected lookup keys that read preview.option refs', () => {
    const result = compileProjectedLookupConsiderations({
      preferProjectedPopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: projectedLookupExpr({ ref: 'preview.option.delta.victory.currentMargin.self' }),
        previewFallback: { onUnavailable: 'noContribution' },
      },
    });

    const diagnostic = result.diagnostics.find((entry) => entry.code === KEY_NOT_PREVIEW_FREE_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.considerations.preferProjectedPopulation.value.lookup.key');
    assert.match(diagnostic?.message ?? '', /preview\.option\.delta\.victory\.currentMargin\.self/u);
  });

  it('rejects projected lookup keys that read another projected lookup', () => {
    const result = compileProjectedLookupConsiderations({
      preferProjectedPopulation: {
        scopes: ['microturn'],
        weight: 1,
        value: projectedLookupExpr(projectedLookupExpr()),
        previewFallback: { onUnavailable: 'noContribution' },
      },
    });

    const diagnostic = result.diagnostics.find((entry) => entry.code === KEY_NOT_PREVIEW_FREE_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.considerations.preferProjectedPopulation.value.lookup.key');
    assert.match(diagnostic?.message ?? '', new RegExp(projectedLookupRefId.replaceAll('.', '\\.'), 'u'));
  });
});
