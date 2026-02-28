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

    const details = buildChoiceOptionsRuntimeShapeDiagnosticDetails('chooseN', violation);
    assert.equal(
      details.message,
      'chooseN options query must produce move-param-encodable values; runtime shape(s) [number, object] are not fully encodable.',
    );
    assert.equal(
      details.suggestion,
      'Use queries yielding token/string/number values (or binding queries that resolve to encodable values) and avoid object-valued option domains like assetRows.',
    );
    assert.deepEqual(details.alternatives, ['object']);
  });

  it('returns fresh diagnostic detail arrays across calls', () => {
    const violation = getChoiceOptionsRuntimeShapeViolation({
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
    });
    assert.ok(violation);

    const first = buildChoiceOptionsRuntimeShapeDiagnosticDetails('chooseOne', violation);
    (first.alternatives as string[]).push('mutated-shape');

    const second = buildChoiceOptionsRuntimeShapeDiagnosticDetails('chooseOne', violation);
    assert.deepEqual(second.alternatives, ['object']);
  });
});
