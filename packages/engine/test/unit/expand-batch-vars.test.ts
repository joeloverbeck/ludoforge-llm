import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandBatchVars } from '../../src/cnl/expand-batch-vars.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecBatchVarDef, GameSpecVarDef } from '../../src/cnl/game-spec-doc.js';
import { createEmptyGameSpecDoc, type GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'batch-var-test', players: { min: 2, max: 4 } },
});

describe('expandBatchVars', () => {
  // Test 1: Int batch with N names → N individual entries
  it('expands an int batch of 13 counters to 13 individual GameSpecVarDef entries', () => {
    const names = Array.from({ length: 13 }, (_, i) => `ops_count_${i}`);
    const batch: GameSpecBatchVarDef = {
      batch: {
        names,
        type: 'int',
        init: 0,
        min: 0,
        max: 20,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [batch],
    };

    const result = expandBatchVars(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.globalVars!.length, 13);

    for (const [i, varDef] of result.doc.globalVars!.entries()) {
      const v = varDef as GameSpecVarDef;
      assert.equal(v.name, `ops_count_${i}`);
      assert.equal(v.type, 'int');
      assert.equal(v.init, 0);
      assert.equal(v.min, 0);
      assert.equal(v.max, 20);
    }
  });

  // Test 2: Boolean batch with N names → N entries, no min/max
  it('expands a boolean batch of 18 flags to 18 individual entries without min/max', () => {
    const names = Array.from({ length: 18 }, (_, i) => `momentum_${i}`);
    const batch: GameSpecBatchVarDef = {
      batch: {
        names,
        type: 'boolean',
        init: false,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [batch],
    };

    const result = expandBatchVars(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.globalVars!.length, 18);

    for (const [i, varDef] of result.doc.globalVars!.entries()) {
      const v = varDef as GameSpecVarDef;
      assert.equal(v.name, `momentum_${i}`);
      assert.equal(v.type, 'boolean');
      assert.equal(v.init, false);
      assert.equal(v.min, undefined);
      assert.equal(v.max, undefined);
    }
  });

  // Test 3: Mixed batch + individual entries
  it('preserves individual entries alongside batch-expanded ones', () => {
    const individual: GameSpecVarDef = {
      name: 'round_number',
      type: 'int',
      init: 1,
      min: 1,
      max: 10,
    };
    const batch: GameSpecBatchVarDef = {
      batch: {
        names: ['ops_a', 'ops_b'],
        type: 'int',
        init: 0,
        min: 0,
        max: 20,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [individual, batch],
    };

    const result = expandBatchVars(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.globalVars!.length, 3);

    const vars = result.doc.globalVars! as readonly GameSpecVarDef[];
    assert.equal(vars[0]!.name, 'round_number');
    assert.equal(vars[1]!.name, 'ops_a');
    assert.equal(vars[2]!.name, 'ops_b');
  });

  // Test 4: Both globalVars and perPlayerVars expanded
  it('expands both globalVars and perPlayerVars independently', () => {
    const globalBatch: GameSpecBatchVarDef = {
      batch: {
        names: ['g_counter_a', 'g_counter_b'],
        type: 'int',
        init: 0,
        min: 0,
        max: 10,
      },
    };
    const perPlayerBatch: GameSpecBatchVarDef = {
      batch: {
        names: ['p_flag_a', 'p_flag_b', 'p_flag_c'],
        type: 'boolean',
        init: false,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [globalBatch],
      perPlayerVars: [perPlayerBatch],
    };

    const result = expandBatchVars(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.globalVars!.length, 2);
    assert.equal(result.doc.perPlayerVars!.length, 3);

    const gVars = result.doc.globalVars! as readonly GameSpecVarDef[];
    assert.equal(gVars[0]!.name, 'g_counter_a');
    assert.equal(gVars[1]!.name, 'g_counter_b');

    const pVars = result.doc.perPlayerVars! as readonly GameSpecVarDef[];
    assert.equal(pVars[0]!.name, 'p_flag_a');
    assert.equal(pVars[1]!.name, 'p_flag_b');
    assert.equal(pVars[2]!.name, 'p_flag_c');
  });

  // Test 5: Duplicate name within batch → diagnostic
  it('emits CNL_COMPILER_BATCH_VAR_DUPLICATE_NAME for duplicate names within a batch', () => {
    const batch: GameSpecBatchVarDef = {
      batch: {
        names: ['ops_x', 'ops_y', 'ops_x'],
        type: 'int',
        init: 0,
        min: 0,
        max: 10,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [batch],
    };

    const result = expandBatchVars(doc);
    const dupDiags = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_VAR_DUPLICATE_NAME,
    );
    assert.equal(dupDiags.length, 1);
    assert.ok(dupDiags[0]!.message.includes('ops_x'));
  });

  // Test 6: Duplicate across batch and individual → diagnostic
  it('emits CNL_COMPILER_BATCH_VAR_DUPLICATE_NAME for duplicates across batch and individual', () => {
    const individual: GameSpecVarDef = {
      name: 'shared_name',
      type: 'boolean',
      init: false,
    };
    const batch: GameSpecBatchVarDef = {
      batch: {
        names: ['shared_name', 'unique_name'],
        type: 'boolean',
        init: false,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [individual, batch],
    };

    const result = expandBatchVars(doc);
    const dupDiags = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_VAR_DUPLICATE_NAME,
    );
    assert.equal(dupDiags.length, 1);
    assert.ok(dupDiags[0]!.message.includes('shared_name'));
  });

  // Test 7: Empty batch.names → diagnostic
  it('emits CNL_COMPILER_BATCH_VAR_NAMES_EMPTY when batch.names is empty', () => {
    const batch: GameSpecBatchVarDef = {
      batch: {
        names: [],
        type: 'int',
        init: 0,
        min: 0,
        max: 10,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [batch],
    };

    const result = expandBatchVars(doc);
    assert.ok(
      result.diagnostics.some(
        (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_VAR_NAMES_EMPTY,
      ),
    );
  });

  // Test 8: Int batch init outside [min, max] → diagnostic
  it('emits CNL_COMPILER_BATCH_VAR_INT_INIT_OUT_OF_RANGE when init is outside bounds', () => {
    const batch: GameSpecBatchVarDef = {
      batch: {
        names: ['bad_counter'],
        type: 'int',
        init: 25,
        min: 0,
        max: 20,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [batch],
    };

    const result = expandBatchVars(doc);
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BATCH_VAR_INT_INIT_OUT_OF_RANGE,
      ),
    );
  });

  // Test 9: Null arrays → no-op (same doc returned)
  it('returns doc unchanged when both var arrays are null', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: null,
      perPlayerVars: null,
    };

    const result = expandBatchVars(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // Test 10: Empty arrays → no-op
  it('returns doc unchanged when both var arrays are empty', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [],
      perPlayerVars: [],
    };

    const result = expandBatchVars(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // Test 11: Order preserved from batch.names
  it('preserves order of names from batch.names in expanded output', () => {
    const batch: GameSpecBatchVarDef = {
      batch: {
        names: ['zulu', 'alpha', 'mike', 'bravo'],
        type: 'boolean',
        init: true,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [batch],
    };

    const result = expandBatchVars(doc);
    assert.deepEqual(result.diagnostics, []);

    const vars = result.doc.globalVars! as readonly GameSpecVarDef[];
    assert.equal(vars.length, 4);
    assert.equal(vars[0]!.name, 'zulu');
    assert.equal(vars[1]!.name, 'alpha');
    assert.equal(vars[2]!.name, 'mike');
    assert.equal(vars[3]!.name, 'bravo');
  });

  // Test 12: Boolean batch ignores min/max if present
  it('does not carry min/max through for boolean batches even if specified', () => {
    const batch: GameSpecBatchVarDef = {
      batch: {
        names: ['flag_a', 'flag_b'],
        type: 'boolean',
        init: false,
        min: 0,
        max: 1,
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      globalVars: [batch],
    };

    const result = expandBatchVars(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.globalVars!.length, 2);

    for (const varDef of result.doc.globalVars!) {
      const v = varDef as GameSpecVarDef;
      assert.equal(v.type, 'boolean');
      assert.equal(v.min, undefined);
      assert.equal(v.max, undefined);
    }
  });
});
