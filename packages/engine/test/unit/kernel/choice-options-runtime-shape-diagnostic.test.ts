import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildChoiceOptionsRuntimeShapeDiagnostic } from '../../../src/kernel/choice-options-runtime-shape-diagnostic.js';

describe('choice options runtime-shape shared diagnostic builder', () => {
  it('returns null when options query runtime shapes are move-param-encodable', () => {
    const diagnostic = buildChoiceOptionsRuntimeShapeDiagnostic({
      code: 'CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID',
      path: 'doc.actions.0.effects.0.chooseOne.options',
      effectName: 'chooseOne',
      query: { query: 'players' },
    });

    assert.equal(diagnostic, null);
  });

  it('builds deterministic diagnostics with alternatives derived from invalid shapes', () => {
    const args = {
      code: 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID',
      path: 'actions[0].effects[0].chooseN.options',
      effectName: 'chooseN' as const,
      query: {
        query: 'concat' as const,
        sources: [
          { query: 'assetRows' as const, tableId: 'tournament-standard::blindSchedule.levels' },
          { query: 'players' as const },
        ] as const,
      },
    };
    const first = buildChoiceOptionsRuntimeShapeDiagnostic(args);
    const second = buildChoiceOptionsRuntimeShapeDiagnostic(args);

    assert.ok(first);
    assert.deepEqual(first, second);
    assert.deepEqual(first.alternatives, ['object']);
  });
});
