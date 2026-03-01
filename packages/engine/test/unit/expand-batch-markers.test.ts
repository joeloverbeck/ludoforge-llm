import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandBatchMarkers } from '../../src/cnl/expand-batch-markers.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../src/cnl/compiler-diagnostic-codes.js';
import type {
  GameSpecBatchGlobalMarkerLattice,
  GameSpecGlobalMarkerLatticeDef,
} from '../../src/cnl/game-spec-doc.js';
import { createEmptyGameSpecDoc, type GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'batch-marker-test', players: { min: 2, max: 4 } },
});

describe('expandBatchMarkers', () => {
  // Test 1: Batch of 20 markers expands to 20 individual entries
  it('expands a batch of 20 markers to 20 individual GameSpecGlobalMarkerLatticeDef entries', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `cap_${i}`);
    const batch: GameSpecBatchGlobalMarkerLattice = {
      batch: {
        ids,
        states: ['inactive', 'unshaded', 'shaded'],
        defaultState: 'inactive',
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalMarkerLattices: [batch],
    };

    const result = expandBatchMarkers(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.globalMarkerLattices!.length, 20);

    for (const [i, marker] of result.doc.globalMarkerLattices!.entries()) {
      const m = marker as GameSpecGlobalMarkerLatticeDef;
      assert.equal(m.id, `cap_${i}`);
      assert.deepEqual(m.states, ['inactive', 'unshaded', 'shaded']);
      assert.equal(m.defaultState, 'inactive');
    }
  });

  // Test 2: Mixed batch + individual entries in same array
  it('preserves individual entries alongside batch-expanded ones', () => {
    const individual: GameSpecGlobalMarkerLatticeDef = {
      id: 'special_marker',
      states: ['off', 'on'],
      defaultState: 'off',
    };
    const batch: GameSpecBatchGlobalMarkerLattice = {
      batch: {
        ids: ['cap_a', 'cap_b'],
        states: ['inactive', 'active'],
        defaultState: 'inactive',
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalMarkerLattices: [individual, batch],
    };

    const result = expandBatchMarkers(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.globalMarkerLattices!.length, 3);

    const markers = result.doc.globalMarkerLattices! as readonly GameSpecGlobalMarkerLatticeDef[];
    assert.equal(markers[0]!.id, 'special_marker');
    assert.deepEqual(markers[0]!.states, ['off', 'on']);
    assert.equal(markers[1]!.id, 'cap_a');
    assert.deepEqual(markers[1]!.states, ['inactive', 'active']);
    assert.equal(markers[2]!.id, 'cap_b');
    assert.deepEqual(markers[2]!.states, ['inactive', 'active']);
  });

  // Test 3: Duplicate ID within a single batch
  it('emits CNL_COMPILER_BATCH_MARKER_DUPLICATE_ID for duplicate IDs within a batch', () => {
    const batch: GameSpecBatchGlobalMarkerLattice = {
      batch: {
        ids: ['cap_x', 'cap_y', 'cap_x'],
        states: ['inactive', 'active'],
        defaultState: 'inactive',
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalMarkerLattices: [batch],
    };

    const result = expandBatchMarkers(doc);
    const dupDiags = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_MARKER_DUPLICATE_ID,
    );
    assert.equal(dupDiags.length, 1);
    assert.ok(dupDiags[0]!.message.includes('cap_x'));
  });

  // Test 4: Duplicate ID across batch and individual entries
  it('emits CNL_COMPILER_BATCH_MARKER_DUPLICATE_ID for duplicates across batch and individual', () => {
    const individual: GameSpecGlobalMarkerLatticeDef = {
      id: 'shared_id',
      states: ['off', 'on'],
      defaultState: 'off',
    };
    const batch: GameSpecBatchGlobalMarkerLattice = {
      batch: {
        ids: ['shared_id', 'unique_id'],
        states: ['inactive', 'active'],
        defaultState: 'inactive',
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalMarkerLattices: [individual, batch],
    };

    const result = expandBatchMarkers(doc);
    const dupDiags = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_MARKER_DUPLICATE_ID,
    );
    assert.equal(dupDiags.length, 1);
    assert.ok(dupDiags[0]!.message.includes('shared_id'));
  });

  // Test 5: Empty batch.ids produces diagnostic
  it('emits CNL_COMPILER_BATCH_MARKER_IDS_EMPTY when batch.ids is empty', () => {
    const batch: GameSpecBatchGlobalMarkerLattice = {
      batch: {
        ids: [],
        states: ['inactive', 'active'],
        defaultState: 'inactive',
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalMarkerLattices: [batch],
    };

    const result = expandBatchMarkers(doc);
    assert.ok(
      result.diagnostics.some(
        (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_MARKER_IDS_EMPTY,
      ),
    );
  });

  // Test 6: batch.defaultState not in batch.states produces diagnostic
  it('emits CNL_COMPILER_BATCH_MARKER_DEFAULT_STATE_INVALID when defaultState not in states', () => {
    const batch: GameSpecBatchGlobalMarkerLattice = {
      batch: {
        ids: ['cap_a'],
        states: ['inactive', 'active'],
        defaultState: 'shaded',
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalMarkerLattices: [batch],
    };

    const result = expandBatchMarkers(doc);
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.code ===
          CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_MARKER_DEFAULT_STATE_INVALID,
      ),
    );
  });

  // Test 7: Null globalMarkerLattices is a no-op
  it('returns doc unchanged when globalMarkerLattices is null', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalMarkerLattices: null,
    };

    const result = expandBatchMarkers(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // Test 8: Empty globalMarkerLattices array is a no-op
  it('returns doc unchanged when globalMarkerLattices is empty', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalMarkerLattices: [],
    };

    const result = expandBatchMarkers(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // Test 9: Order preserved — expanded markers follow order of IDs in batch.ids
  it('preserves order of IDs from batch.ids in expanded output', () => {
    const batch: GameSpecBatchGlobalMarkerLattice = {
      batch: {
        ids: ['zulu', 'alpha', 'mike', 'bravo'],
        states: ['inactive', 'active'],
        defaultState: 'inactive',
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalMarkerLattices: [batch],
    };

    const result = expandBatchMarkers(doc);
    assert.deepEqual(result.diagnostics, []);

    const markers = result.doc.globalMarkerLattices! as readonly GameSpecGlobalMarkerLatticeDef[];
    assert.equal(markers.length, 4);
    assert.equal(markers[0]!.id, 'zulu');
    assert.equal(markers[1]!.id, 'alpha');
    assert.equal(markers[2]!.id, 'mike');
    assert.equal(markers[3]!.id, 'bravo');
  });
});
