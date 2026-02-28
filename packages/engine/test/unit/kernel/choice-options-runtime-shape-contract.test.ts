import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildChoiceOptionsRuntimeShapeDiagnosticDetails,
  getChoiceOptionsRuntimeShapeViolation,
} from '../../../src/kernel/choice-options-runtime-shape-contract.js';

describe('choice options runtime-shape contract', () => {
  it('returns no violation for move-param-encodable option shapes', () => {
    assert.equal(getChoiceOptionsRuntimeShapeViolation({ query: 'players' }), null);
    assert.equal(getChoiceOptionsRuntimeShapeViolation({ query: 'tokensInZone', zone: 'deck:none' }), null);
  });

  it('returns deterministic violation details for non-encodable shapes', () => {
    assert.deepEqual(
      getChoiceOptionsRuntimeShapeViolation({
        query: 'concat',
        sources: [
          { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
          { query: 'players' },
          { query: 'enums', values: ['a', 'b'] },
        ],
      }),
      {
        runtimeShapes: ['number', 'object', 'string'],
        invalidShapes: ['object'],
      },
    );
  });

  it('exposes semantic violation metadata without layer-specific diagnostic fields', () => {
    const violation = getChoiceOptionsRuntimeShapeViolation({
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
    });

    assert.deepEqual(violation, {
      runtimeShapes: ['object'],
      invalidShapes: ['object'],
    });
  });

  it('builds shared diagnostic details without owning caller diagnostic taxonomies', () => {
    const violation = getChoiceOptionsRuntimeShapeViolation({
      query: 'concat',
      sources: [
        { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
        { query: 'players' },
      ],
    });
    assert.ok(violation);

    const details = buildChoiceOptionsRuntimeShapeDiagnosticDetails(violation);
    assert.equal(details.reason, 'nonMoveParamEncodableRuntimeShapes');
    assert.deepEqual(details.runtimeShapes, ['number', 'object']);
    assert.deepEqual(details.invalidShapes, ['object']);
    assert.equal('alternatives' in details, false);
  });

  it('returns fresh diagnostic detail arrays across calls', () => {
    const violation = getChoiceOptionsRuntimeShapeViolation({
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
    });
    assert.ok(violation);

    const first = buildChoiceOptionsRuntimeShapeDiagnosticDetails(violation);
    (first.runtimeShapes as string[]).push('mutated-runtime-shape');
    (first.invalidShapes as string[]).push('mutated-invalid-shape');

    const second = buildChoiceOptionsRuntimeShapeDiagnosticDetails(violation);
    assert.deepEqual(second.runtimeShapes, ['object']);
    assert.deepEqual(second.invalidShapes, ['object']);
    assert.equal('alternatives' in second, false);
  });
});
