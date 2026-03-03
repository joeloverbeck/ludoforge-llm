import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import {
  emitScenarioLinkedAssetSelectionDiagnostics,
  emitScenarioSelectionDiagnostics,
} from '../../src/cnl/scenario-linked-asset-selection-diagnostics.js';
import {
  createUnresolvedScenarioSelectionResult,
  selectScenarioLinkedAsset,
  selectScenarioRef,
} from '../../src/cnl/scenario-linked-asset-selection-core.js';

describe('scenario-linked asset selection core and diagnostics adapters', () => {
  it('selects scenario refs without requiring diagnostics arrays', () => {
    const result = selectScenarioRef([{ entityId: 'scenario-a' }], 'scenario-a');

    assert.equal(result.selected?.entityId, 'scenario-a');
    assert.equal(result.failureReason, undefined);
    assert.deepEqual(result.alternatives, ['scenario-a']);
  });

  it('creates unresolved scenario selection results with canonical fallback shape', () => {
    const result = createUnresolvedScenarioSelectionResult<{ readonly id: string }>('map-selected');

    assert.equal(result.requestedId, 'map-selected');
    assert.equal(result.selected, undefined);
    assert.equal(result.failureReason, undefined);
    assert.deepEqual(result.alternatives, []);
  });

  it('emits scenario missing-reference diagnostics through the configured dialect adapter', () => {
    const diagnostics: Diagnostic[] = [];
    const result = selectScenarioRef([{ entityId: 'scenario-a' }], 'scenario-missing');
    emitScenarioSelectionDiagnostics(result, diagnostics, {
      onMissingReference: ({ selectedScenarioAssetId, alternatives }) => ({
        code: 'MISSING',
        path: 'doc.metadata.defaultScenarioAssetId',
        severity: 'error',
        message: `${selectedScenarioAssetId}:${alternatives.join(',')}`,
      }),
    });

    assert.equal(result.selected, undefined);
    assert.equal(result.failureReason, 'missing-reference');
    assert.equal(result.requestedId, 'scenario-missing');
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

  it('emits linked-asset ambiguity diagnostics through the configured dialect adapter', () => {
    const diagnostics: Diagnostic[] = [];

    const result = selectScenarioLinkedAsset([{ id: 'map-a' }, { id: 'map-b' }], undefined);
    emitScenarioLinkedAssetSelectionDiagnostics(result, diagnostics, {
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
    });

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

  it('passes deduplicated normalized alternatives into linked-asset ambiguity diagnostics', () => {
    const diagnostics: Diagnostic[] = [];

    const result = selectScenarioLinkedAsset(
      [{ id: ' map-a ' }, { id: 'map-a' }, { id: 'ma\u0301p-b' }, { id: 'máp-b' }],
      undefined,
    );
    emitScenarioLinkedAssetSelectionDiagnostics(result, diagnostics, {
      kind: 'map',
      selectedPath: 'doc.dataAssets.0.payload',
      dialect: {
        onAmbiguousSelection: ({ kind, alternatives }) => ({
          code: 'AMBIGUOUS',
          path: 'doc.dataAssets',
          severity: 'error',
          message: `${kind}:${alternatives.join(',')}`,
        }),
      },
    });

    assert.equal(result.selected, undefined);
    assert.equal(result.failureReason, 'ambiguous-selection');
    assert.deepEqual(result.alternatives, ['map-a', 'máp-b']);
    assert.equal(diagnostics.length, 1);
    assert.deepEqual(
      {
        code: diagnostics[0]?.code,
        message: diagnostics[0]?.message,
      },
      {
        code: 'AMBIGUOUS',
        message: 'map:map-a,máp-b',
      },
    );
  });

  it('supports optional missing-reference emission for linked assets', () => {
    const diagnostics: Diagnostic[] = [];

    const result = selectScenarioLinkedAsset([{ id: 'seat-a' }], 'seat-missing');
    emitScenarioLinkedAssetSelectionDiagnostics(result, diagnostics, {
      kind: 'seatCatalog',
      selectedPath: 'doc.dataAssets.0.payload',
      dialect: {},
    });

    assert.equal(result.selected, undefined);
    assert.equal(result.failureReason, 'missing-reference');
    assert.equal(diagnostics.length, 0);
  });

  it('always derives linked-asset missing diagnostics from selection.requestedId', () => {
    const diagnostics: Diagnostic[] = [];
    const result = selectScenarioLinkedAsset([{ id: 'seat-a' }], 'seat-missing');
    emitScenarioLinkedAssetSelectionDiagnostics(result, diagnostics, {
      kind: 'seatCatalog',
      selectedPath: 'doc.dataAssets.0.payload',
      dialect: {
        onMissingReference: ({ selectedId, alternatives }) => ({
          code: 'MISSING',
          path: 'doc.dataAssets.0.payload.seatCatalogAssetId',
          severity: 'error',
          message: `${selectedId}:${alternatives.join(',')}`,
        }),
      },
    });

    assert.equal(result.requestedId, 'seat-missing');
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]?.message, 'seat-missing:seat-a');
  });
});
