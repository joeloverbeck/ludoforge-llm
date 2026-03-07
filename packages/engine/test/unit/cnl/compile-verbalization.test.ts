import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileVerbalization } from '../../../src/cnl/compile-verbalization.js';
import type { GameSpecVerbalization } from '../../../src/cnl/game-spec-doc.js';

describe('compileVerbalization', () => {
  it('normalizes a full input into VerbalizationDef', () => {
    const raw: GameSpecVerbalization = {
      labels: {
        usTroops: { singular: 'US Troop', plural: 'US Troops' },
        saigon: 'Saigon',
      },
      stages: { selectSpaces: 'Select target spaces' },
      macros: {
        trainUs: { class: 'operation', summary: 'Place US forces and build support' },
      },
      sentencePlans: {
        addVar: {
          aid: { '+3': 'Add 3 Aid', '-3': 'Remove 3 Aid' },
        },
      },
      suppressPatterns: ['*Count', '__*'],
    };

    const result = compileVerbalization(raw);

    assert.deepStrictEqual(result.labels, raw.labels);
    assert.deepStrictEqual(result.stages, { selectSpaces: 'Select target spaces' });
    assert.deepStrictEqual(result.macros, {
      trainUs: { class: 'operation', summary: 'Place US forces and build support' },
    });
    assert.deepStrictEqual(result.sentencePlans, {
      addVar: { aid: { '+3': 'Add 3 Aid', '-3': 'Remove 3 Aid' } },
    });
    assert.deepStrictEqual(result.suppressPatterns, ['*Count', '__*']);
  });

  it('compiles stageDescriptions and modifierEffects', () => {
    const raw: GameSpecVerbalization = {
      stageDescriptions: {
        'train-us-profile': {
          selectSpaces: { label: 'Select target spaces', description: 'Provinces/Cities with US pieces' },
        },
      },
      modifierEffects: {
        cap_m48Patton: [
          { condition: 'M48 Patton is Shaded', effect: 'Patrol costs 3 ARVN Resources' },
        ],
      },
    };

    const result = compileVerbalization(raw);

    assert.deepStrictEqual(result.stageDescriptions['train-us-profile']!['selectSpaces'], {
      label: 'Select target spaces',
      description: 'Provinces/Cities with US pieces',
    });
    assert.equal(result.modifierEffects['cap_m48Patton']![0]!.condition, 'M48 Patton is Shaded');
    assert.equal(result.modifierEffects['cap_m48Patton']![0]!.effect, 'Patrol costs 3 ARVN Resources');
  });

  it('defaults null labels to empty record', () => {
    const raw: GameSpecVerbalization = {
      labels: null,
      stages: null,
      macros: null,
      sentencePlans: null,
      suppressPatterns: null,
      stageDescriptions: null,
      modifierEffects: null,
    };

    const result = compileVerbalization(raw);

    assert.deepStrictEqual(result.labels, {});
    assert.deepStrictEqual(result.stages, {});
    assert.deepStrictEqual(result.macros, {});
    assert.deepStrictEqual(result.sentencePlans, {});
    assert.deepStrictEqual(result.suppressPatterns, []);
    assert.deepStrictEqual(result.stageDescriptions, {});
    assert.deepStrictEqual(result.modifierEffects, {});
  });

  it('defaults undefined fields to empty defaults', () => {
    const raw: GameSpecVerbalization = {};

    const result = compileVerbalization(raw);

    assert.deepStrictEqual(result.labels, {});
    assert.deepStrictEqual(result.stages, {});
    assert.deepStrictEqual(result.macros, {});
    assert.deepStrictEqual(result.sentencePlans, {});
    assert.deepStrictEqual(result.suppressPatterns, []);
    assert.deepStrictEqual(result.stageDescriptions, {});
    assert.deepStrictEqual(result.modifierEffects, {});
  });

  it('preserves macro slots when present', () => {
    const raw: GameSpecVerbalization = {
      macros: {
        trainUs: {
          class: 'operation',
          summary: 'Place forces',
          slots: { targetZone: 'Target zone' },
        },
      },
    };

    const result = compileVerbalization(raw);

    assert.deepStrictEqual(result.macros.trainUs, {
      class: 'operation',
      summary: 'Place forces',
      slots: { targetZone: 'Target zone' },
    });
  });

  it('handles mixed label types (string and singular/plural)', () => {
    const raw: GameSpecVerbalization = {
      labels: {
        saigon: 'Saigon',
        usTroops: { singular: 'US Troop', plural: 'US Troops' },
      },
    };

    const result = compileVerbalization(raw);

    assert.equal(result.labels.saigon, 'Saigon');
    assert.deepStrictEqual(result.labels.usTroops, {
      singular: 'US Troop',
      plural: 'US Troops',
    });
  });

  it('handles deeply nested sentencePlans', () => {
    const raw: GameSpecVerbalization = {
      sentencePlans: {
        shiftMarker: {
          supportOpposition: {
            '+1': 'Shift 1 level toward Active Support',
            '-1': 'Shift 1 level toward Active Opposition',
          },
        },
        addVar: {
          aid: { '+3': 'Add 3 Aid' },
        },
      },
    };

    const result = compileVerbalization(raw);

    assert.equal(
      result.sentencePlans['shiftMarker']!['supportOpposition']!['+1'],
      'Shift 1 level toward Active Support',
    );
    assert.equal(
      result.sentencePlans['addVar']!['aid']!['+3'],
      'Add 3 Aid',
    );
  });

  it('does not mutate the input', () => {
    const raw: GameSpecVerbalization = {
      labels: { saigon: 'Saigon' },
      stages: { selectSpaces: 'Select' },
      macros: { trainUs: { class: 'op', summary: 'Train' } },
      sentencePlans: { addVar: { aid: { '+1': 'Add 1' } } },
      suppressPatterns: ['*Count'],
    };

    const snapshot = JSON.stringify(raw);
    compileVerbalization(raw);

    assert.equal(JSON.stringify(raw), snapshot, 'input must not be mutated');
  });

  it('partial input: only labels provided', () => {
    const raw: GameSpecVerbalization = {
      labels: { pot: 'Pot' },
    };

    const result = compileVerbalization(raw);

    assert.deepStrictEqual(result.labels, { pot: 'Pot' });
    assert.deepStrictEqual(result.stages, {});
    assert.deepStrictEqual(result.macros, {});
    assert.deepStrictEqual(result.sentencePlans, {});
    assert.deepStrictEqual(result.suppressPatterns, []);
  });
});
