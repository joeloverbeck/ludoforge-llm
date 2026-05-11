// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GameSpecConsiderationDef } from '../../../src/cnl/game-spec-doc.js';
import { compileProjectedLookupConsiderations, projectedLookupExpr } from './projected-lookup-compile-test-helpers.js';

describe('projected lookup costClass promotion', () => {
  it('quietly promotes authored state costClass to preview when value contains a projected lookup', () => {
    const authoredStateCostConsideration = {
      scopes: ['microturn'],
      costClass: 'state',
      weight: 1,
      value: projectedLookupExpr(),
      previewFallback: { onUnavailable: 'noContribution' },
    } as unknown as GameSpecConsiderationDef;

    const result = compileProjectedLookupConsiderations({
      preferProjectedPopulation: authoredStateCostConsideration,
    });

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.equal(
      result.gameDef?.agents?.compiled.considerations.preferProjectedPopulation?.costClass,
      'preview',
    );
  });
});
