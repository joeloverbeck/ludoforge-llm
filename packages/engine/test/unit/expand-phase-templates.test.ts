import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandPhaseTemplates } from '../../src/cnl/expand-phase-templates.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../src/cnl/compiler-diagnostic-codes.js';
import {
  createEmptyGameSpecDoc,
  type GameSpecDoc,
  type GameSpecPhaseTemplateDef,
  type GameSpecPhaseFromTemplate,
  type GameSpecPhaseDef,
} from '../../src/cnl/game-spec-doc.js';

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'phase-template-test', players: { min: 2, max: 4 } },
});

describe('expandPhaseTemplates', () => {
  // Test 1: Template with 3 params instantiated 3 times (flop/turn/river)
  it('expands a template with 3 params into 3 distinct phases (flop/turn/river)', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'communityCardPhase',
      params: [{ name: 'phaseId' }, { name: 'cardCount' }, { name: 'label' }],
      phase: {
        id: '{phaseId}',
        onEnter: [
          { dealCommunityCards: { count: '{cardCount}', label: '{label}' } },
          { log: 'Entering {label} phase' },
        ],
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [
          {
            fromTemplate: 'communityCardPhase',
            args: { phaseId: 'flop', cardCount: 3, label: 'Flop' },
          },
          {
            fromTemplate: 'communityCardPhase',
            args: { phaseId: 'turn', cardCount: 1, label: 'Turn' },
          },
          {
            fromTemplate: 'communityCardPhase',
            args: { phaseId: 'river', cardCount: 1, label: 'River' },
          },
        ],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.doc.turnStructure!.phases.length, 3);

    const phases = result.doc.turnStructure!.phases as readonly GameSpecPhaseDef[];
    assert.equal(phases[0]!.id, 'flop');
    assert.equal(phases[1]!.id, 'turn');
    assert.equal(phases[2]!.id, 'river');
  });

  // Test 2: String substitution in deeply nested structures
  it('substitutes params in deeply nested objects and arrays', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'deep',
      params: [{ name: 'x' }],
      phase: {
        id: '{x}_phase',
        onEnter: [
          {
            outer: {
              middle: {
                inner: '{x}',
                list: ['{x}', 'static', '{x}'],
              },
            },
          },
        ],
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [{ fromTemplate: 'deep', args: { x: 'val' } }],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);

    const phase = result.doc.turnStructure!.phases[0] as unknown as Record<string, unknown>;
    assert.equal(phase.id, 'val_phase');

    const onEnter = phase.onEnter as readonly Record<string, unknown>[];
    const outer = onEnter[0]!.outer as unknown as Record<string, unknown>;
    const middle = outer.middle as unknown as Record<string, unknown>;
    assert.equal(middle.inner, 'val');
    assert.deepEqual(middle.list, ['val', 'static', 'val']);
  });

  // Test 3: Numeric arg replaces placeholder with raw number
  it('replaces entire-string placeholder with raw numeric value', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'numTest',
      params: [{ name: 'count' }],
      phase: { id: 'p', onEnter: [{ deal: '{count}' }] },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [{ fromTemplate: 'numTest', args: { count: 5 } }],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);

    const phase = result.doc.turnStructure!.phases[0] as unknown as Record<string, unknown>;
    const onEnter = phase.onEnter as readonly Record<string, unknown>[];
    assert.equal(onEnter[0]!.deal, 5);
    assert.equal(typeof onEnter[0]!.deal, 'number');
  });

  // Test 4: Boolean arg replaces placeholder with raw boolean
  it('replaces entire-string placeholder with raw boolean value', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'boolTest',
      params: [{ name: 'flag' }],
      phase: { id: 'p', onEnter: [{ visible: '{flag}' }] },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [{ fromTemplate: 'boolTest', args: { flag: true } }],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);

    const phase = result.doc.turnStructure!.phases[0] as unknown as Record<string, unknown>;
    const onEnter = phase.onEnter as readonly Record<string, unknown>[];
    assert.equal(onEnter[0]!.visible, true);
    assert.equal(typeof onEnter[0]!.visible, 'boolean');
  });

  // Test 5: Missing template reference → diagnostic
  it('emits PHASE_TEMPLATE_MISSING for unknown template reference', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [],
      turnStructure: {
        phases: [{ fromTemplate: 'nonexistent', args: {} } as GameSpecPhaseFromTemplate],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(
      result.diagnostics[0]!.code,
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_MISSING,
    );
    assert.ok(result.diagnostics[0]!.message.includes('nonexistent'));
  });

  // Test 6: Missing required param → diagnostic
  it('emits PHASE_TEMPLATE_PARAM_MISSING for missing required param', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'tmpl',
      params: [{ name: 'a' }, { name: 'b' }],
      phase: { id: '{a}', onEnter: [{ val: '{b}' }] },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [{ fromTemplate: 'tmpl', args: { a: 'x' } }],
      },
    };

    const result = expandPhaseTemplates(doc);
    const missing = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_PARAM_MISSING,
    );
    assert.equal(missing.length, 1);
    assert.ok(missing[0]!.message.includes('"b"'));
  });

  // Test 7: Extra param in args → diagnostic
  it('emits PHASE_TEMPLATE_PARAM_EXTRA for undeclared arg', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'tmpl',
      params: [{ name: 'a' }],
      phase: { id: '{a}' },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [{ fromTemplate: 'tmpl', args: { a: 'x', extra: 'y' } }],
      },
    };

    const result = expandPhaseTemplates(doc);
    const extra = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_PARAM_EXTRA,
    );
    assert.equal(extra.length, 1);
    assert.ok(extra[0]!.message.includes('"extra"'));
  });

  // Test 8: Duplicate expanded phase IDs → diagnostic
  it('emits PHASE_TEMPLATE_DUPLICATE_ID for duplicate phase IDs after expansion', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'tmpl',
      params: [{ name: 'pid' }],
      phase: { id: '{pid}' },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [
          { fromTemplate: 'tmpl', args: { pid: 'same' } },
          { fromTemplate: 'tmpl', args: { pid: 'same' } },
        ],
      },
    };

    const result = expandPhaseTemplates(doc);
    const dups = result.diagnostics.filter(
      (d) => d.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_DUPLICATE_ID,
    );
    assert.equal(dups.length, 1);
    assert.ok(dups[0]!.message.includes('"same"'));
  });

  // Test 9: Mixed regular + fromTemplate phases preserve order
  it('preserves ordering of regular and fromTemplate phases', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'tmpl',
      params: [{ name: 'pid' }],
      phase: { id: '{pid}' },
    };

    const regular: GameSpecPhaseDef = { id: 'preflop' };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [
          regular,
          { fromTemplate: 'tmpl', args: { pid: 'flop' } },
          { id: 'betting', onEnter: [] } as GameSpecPhaseDef,
          { fromTemplate: 'tmpl', args: { pid: 'river' } },
        ],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);

    const ids = result.doc.turnStructure!.phases.map(
      (p) => (p as GameSpecPhaseDef).id,
    );
    assert.deepEqual(ids, ['preflop', 'flop', 'betting', 'river']);
  });

  // Test 10: Template with onExit expanded correctly
  it('expands template that includes onExit', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'tmpl',
      params: [{ name: 'pid' }, { name: 'cleanup' }],
      phase: {
        id: '{pid}',
        onEnter: [{ setup: true }],
        onExit: [{ action: '{cleanup}' }],
      },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [{ fromTemplate: 'tmpl', args: { pid: 'coup', cleanup: 'resetMarkers' } }],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);

    const phase = result.doc.turnStructure!.phases[0] as unknown as Record<string, unknown>;
    assert.equal(phase.id, 'coup');
    assert.deepEqual(phase.onEnter, [{ setup: true }]);
    assert.deepEqual(phase.onExit, [{ action: 'resetMarkers' }]);
  });

  // Test 11: No phaseTemplates + no fromTemplate = no-op (referential identity)
  it('returns input doc by reference when no templates and no fromTemplate entries', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      turnStructure: {
        phases: [{ id: 'main', onEnter: [] }],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // Test 12: Same template, different args → distinct phases
  it('produces distinct phases when same template is used with different args', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'tmpl',
      params: [{ name: 'pid' }, { name: 'n' }],
      phase: { id: '{pid}', onEnter: [{ count: '{n}' }] },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [
          { fromTemplate: 'tmpl', args: { pid: 'a', n: 1 } },
          { fromTemplate: 'tmpl', args: { pid: 'b', n: 2 } },
        ],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);

    const phases = result.doc.turnStructure!.phases as unknown as readonly Record<string, unknown>[];
    assert.equal(phases[0]!.id, 'a');
    assert.equal(phases[1]!.id, 'b');

    const onEnterA = phases[0]!.onEnter as readonly Record<string, unknown>[];
    const onEnterB = phases[1]!.onEnter as readonly Record<string, unknown>[];
    assert.equal(onEnterA[0]!.count, 1);
    assert.equal(onEnterB[0]!.count, 2);
  });

  // Test 13: phaseTemplates is null in output doc
  it('sets phaseTemplates to null in the output doc', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'tmpl',
      params: [{ name: 'pid' }],
      phase: { id: '{pid}' },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [{ fromTemplate: 'tmpl', args: { pid: 'x' } }],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.equal(result.doc.phaseTemplates, null);
  });

  // Test 14: Null turnStructure is a no-op
  it('returns doc unchanged when turnStructure is null', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [{ id: 'tmpl', params: [], phase: { id: 'x' } }],
      turnStructure: null,
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.strictEqual(result.doc, doc);
  });

  // Test 15: Interrupts with fromTemplate entries are expanded
  it('expands fromTemplate entries in turnStructure.interrupts', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'intTmpl',
      params: [{ name: 'iid' }],
      phase: { id: '{iid}', onEnter: [{ interrupt: true }] },
    };

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: {
        phases: [{ id: 'main' }],
        interrupts: [
          { fromTemplate: 'intTmpl', args: { iid: 'coup_interrupt' } },
          { id: 'manual_interrupt', onEnter: [] } as GameSpecPhaseDef,
        ],
      },
    };

    const result = expandPhaseTemplates(doc);
    assert.deepEqual(result.diagnostics, []);

    const interrupts = result.doc.turnStructure!.interrupts!;
    assert.equal(interrupts.length, 2);

    const first = interrupts[0] as GameSpecPhaseDef;
    const second = interrupts[1] as GameSpecPhaseDef;
    assert.equal(first.id, 'coup_interrupt');
    assert.deepEqual(first.onEnter, [{ interrupt: true }]);
    assert.equal(second.id, 'manual_interrupt');
  });

  // Test 16: Input doc not mutated
  it('does not mutate the input doc', () => {
    const template: GameSpecPhaseTemplateDef = {
      id: 'tmpl',
      params: [{ name: 'pid' }],
      phase: { id: '{pid}', onEnter: [{ x: '{pid}' }] },
    };

    const originalPhases = [
      { fromTemplate: 'tmpl', args: { pid: 'expanded' } } as GameSpecPhaseFromTemplate,
    ];

    const doc: GameSpecDoc = {
      ...baseDoc(),
      phaseTemplates: [template],
      turnStructure: { phases: originalPhases },
    };

    // Snapshot the original
    const originalJson = JSON.stringify(doc);

    expandPhaseTemplates(doc);

    // Input doc must be unchanged
    assert.equal(JSON.stringify(doc), originalJson);
  });
});
