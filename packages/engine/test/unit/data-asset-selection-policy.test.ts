import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import {
  selectScenarioLinkedAssetWithPolicy,
  selectScenarioRefWithPolicy,
} from '../../src/cnl/scenario-linked-asset-selection-policy.js';

describe('scenario-linked asset selection policy', () => {
  it('emits scenario missing-reference diagnostics through the configured dialect', () => {
    const diagnostics: Diagnostic[] = [];

    const result = selectScenarioRefWithPolicy(
      [{ entityId: 'scenario-a' }],
      'scenario-missing',
      diagnostics,
      {
        onMissingReference: ({ selectedScenarioAssetId, alternatives }) => ({
          code: 'MISSING',
          path: 'doc.metadata.defaultScenarioAssetId',
          severity: 'error',
          message: `${selectedScenarioAssetId}:${alternatives.join(',')}`,
        }),
      },
    );

    assert.equal(result.selected, undefined);
    assert.equal(result.failureReason, 'missing-reference');
    assert.equal(diagnostics.length, 1);
    assert.deepEqual(
      {
        code: diagnostics[0]?.code,
        message: diagnostics[0]?.message,
      },
      {
      code: 'MISSING',
      message: 'scenario-missing:scenario-a',
      },
    );
  });

  it('emits linked-asset ambiguity diagnostics through the configured dialect', () => {
    const diagnostics: Diagnostic[] = [];

    const result = selectScenarioLinkedAssetWithPolicy(
      [{ id: 'map-a' }, { id: 'map-b' }],
      undefined,
      diagnostics,
      {
        kind: 'map',
        selectedPath: 'doc.dataAssets.0.payload',
        dialect: {
          onAmbiguousSelection: ({ kind, alternatives }) => ({
            code: 'AMBIGUOUS',
            path: 'doc.dataAssets',
            severity: 'error',
            message: `${kind}:${alternatives.length}`,
          }),
        },
      },
    );

    assert.equal(result.selected, undefined);
    assert.equal(result.failureReason, 'ambiguous-selection');
    assert.equal(diagnostics.length, 1);
    assert.deepEqual(
      {
        code: diagnostics[0]?.code,
        message: diagnostics[0]?.message,
      },
      {
      code: 'AMBIGUOUS',
      message: 'map:2',
      },
    );
  });

  it('supports optional missing-reference emission for linked assets', () => {
    const diagnostics: Diagnostic[] = [];

    const result = selectScenarioLinkedAssetWithPolicy(
      [{ id: 'seat-a' }],
      'seat-missing',
      diagnostics,
      {
        kind: 'seatCatalog',
        selectedPath: 'doc.dataAssets.0.payload',
        dialect: {},
      },
    );

    assert.equal(result.selected, undefined);
    assert.equal(result.failureReason, 'missing-reference');
    assert.equal(diagnostics.length, 0);
  });
});
