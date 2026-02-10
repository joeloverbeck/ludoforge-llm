import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEmptyGameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import { validateGameSpec } from '../../src/cnl/validate-spec.js';

function createStructurallyValidDoc() {
  const validAction = {
    id: 'draw',
    actor: { currentPlayer: true },
    phase: 'main',
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };

  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'demo', players: { min: 2, max: 4 } },
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [{ name: 'health', type: 'int', init: 5, min: 0, max: 10 }],
    zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
    actions: [validAction],
    endConditions: [{ when: { always: false }, result: { type: 'draw' } }],
  };
}

describe('validateGameSpec structural rules', () => {
  it('returns zero diagnostics for a structurally valid doc', () => {
    const diagnostics = validateGameSpec(createStructurallyValidDoc());
    assert.equal(diagnostics.length, 0);
  });

  it('accepts optional sourceMap argument', () => {
    const diagnostics = validateGameSpec(createStructurallyValidDoc(), { sourceMap: { byPath: {} } });
    assert.equal(diagnostics.length, 0);
  });

  it('emits missing required section diagnostics', () => {
    const diagnostics = validateGameSpec(createEmptyGameSpecDoc());
    assert.equal(diagnostics.length, 5);
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.path).sort(),
      ['doc.actions', 'doc.endConditions', 'doc.metadata', 'doc.turnStructure', 'doc.zones'],
    );
  });

  it('validates metadata and variable ranges', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      metadata: { id: 'demo', players: { min: 0, max: 0 } },
      globalVars: [{ name: 'score', type: 'int', init: 11, min: 5, max: 4 }],
    });
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.code),
      [
        'CNL_VALIDATOR_METADATA_PLAYERS_MIN_TOO_LOW',
        'CNL_VALIDATOR_VARIABLE_MIN_GT_MAX',
        'CNL_VALIDATOR_VARIABLE_INIT_OUT_OF_RANGE',
      ],
    );
  });

  it('validates zone enums', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      zones: [{ id: 'deck', owner: 'any', visibility: 'team', ordering: 'ring' }],
    });
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.path),
      ['doc.zones.0.owner', 'doc.zones.0.visibility', 'doc.zones.0.ordering'],
    );
  });

  it('validates action required fields and shape constraints', () => {
    const validDoc = createStructurallyValidDoc();
    const baseAction = validDoc.actions![0]!;
    const diagnostics = validateGameSpec({
      ...validDoc,
      actions: [{ ...baseAction, id: '', phase: '', actor: null, effects: {} as unknown as unknown[] }],
    });
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.path),
      ['doc.actions.0.id', 'doc.actions.0.actor', 'doc.actions.0.phase', 'doc.actions.0.effects'],
    );
  });

  it('validates turn structure shape', () => {
    const diagnostics = validateGameSpec({
      ...createStructurallyValidDoc(),
      turnStructure: { phases: [], activePlayerOrder: 'zigzag' },
    });
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.path),
      ['doc.turnStructure.phases', 'doc.turnStructure.activePlayerOrder'],
    );
  });

  it('does not throw and does not mutate input for malformed content', () => {
    const malformedDoc = {
      ...createStructurallyValidDoc(),
      metadata: { id: '', players: { min: Number.NaN, max: Number.NaN } },
      actions: [42],
    };
    const before = structuredClone(malformedDoc);

    assert.doesNotThrow(() => validateGameSpec(malformedDoc as unknown as Parameters<typeof validateGameSpec>[0]));
    validateGameSpec(malformedDoc as unknown as Parameters<typeof validateGameSpec>[0]);

    assert.deepEqual(malformedDoc, before);
  });
});
