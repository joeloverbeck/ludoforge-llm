// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  candidateByActionId,
  runStandingPreviewTrace,
} from './standing-preview-fixture.js';

const MATRIX_REF_ID = 'victoryCurrentMargin.currentMargin.$seat';

describe('Spec 180 previewUsage seat matrix trace', () => {
  it('materializes per-candidate per-seat preview status cells for seatAgg refs', () => {
    const trace = runStandingPreviewTrace({ previewVisibility: 'public' });
    const hold = candidateByActionId(trace, 'hold-standing');
    const harmEast = candidateByActionId(trace, 'harm-east-standing');
    const matrix = trace.previewUsage.seatMatrix?.byCandidate;

    assert.ok(matrix);
    assert.deepEqual(matrix[hold.stableMoveKey]?.perSeatRefs[MATRIX_REF_ID], {
      east: { status: 'ready', value: 0 },
      south: { status: 'ready', value: 0 },
      west: { status: 'ready', value: 0 },
    });
    assert.deepEqual(matrix[harmEast.stableMoveKey]?.perSeatRefs[MATRIX_REF_ID], {
      east: { status: 'ready', value: 5 },
      south: { status: 'ready', value: 0 },
      west: { status: 'ready', value: 0 },
    });
  });

  it('records unavailable per-seat statuses without numeric values', () => {
    const trace = runStandingPreviewTrace({ previewVisibility: 'hidden' });
    const hold = candidateByActionId(trace, 'hold-standing');

    assert.deepEqual(trace.previewUsage.seatMatrix?.byCandidate[hold.stableMoveKey]?.perSeatRefs[MATRIX_REF_ID], {
      east: { status: 'hidden' },
      south: { status: 'hidden' },
      west: { status: 'hidden' },
    });
  });

  it('omits the matrix when preview refs are not requested through a seat aggregate', () => {
    const trace = runStandingPreviewTrace({ previewVisibility: 'public', useSelfPreviewRef: true });

    assert.equal(Object.hasOwn(trace.previewUsage, 'seatMatrix'), false);
  });

  it('emits byte-identical matrix JSON for the same seed and GameDef', () => {
    const first = runStandingPreviewTrace({ previewVisibility: 'public' });
    const second = runStandingPreviewTrace({ previewVisibility: 'public' });

    assert.equal(JSON.stringify(first.previewUsage.seatMatrix), JSON.stringify(second.previewUsage.seatMatrix));
  });
});
