import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderChoiceOptionsRuntimeShapeDiagnostic } from '../../../src/kernel/choice-options-runtime-shape-diagnostic-rendering.js';

describe('choice options runtime-shape diagnostic rendering', () => {
  it('renders deterministic user-facing diagnostic text from structured details', () => {
    const details = {
      reason: 'nonMoveParamEncodableRuntimeShapes' as const,
      runtimeShapes: ['number', 'object'] as const,
      invalidShapes: ['object'] as const,
      alternatives: ['object'] as const,
    };

    const first = renderChoiceOptionsRuntimeShapeDiagnostic('chooseN', details);
    const second = renderChoiceOptionsRuntimeShapeDiagnostic('chooseN', details);

    assert.deepEqual(first, second);
    assert.equal(
      first.message,
      'chooseN options query must produce move-param-encodable values; runtime shape(s) [number, object] are not fully encodable.',
    );
    assert.equal(
      first.suggestion,
      'Use queries yielding token/string/number values (or binding queries that resolve to encodable values) and avoid object-valued option domains like assetRows.',
    );
  });
});
