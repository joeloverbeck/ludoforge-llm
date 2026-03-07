import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  RealizedLine,
  ContentStep,
  ContentModifier,
  RuleCard,
  BlockerDetail,
  BlockerInfo,
  RuleState,
  ActionTooltipPayload,
} from '../../../src/kernel/index.js';

import type { VerbalizationDef } from '../../../src/kernel/index.js';

import type { GameDef } from '../../../src/kernel/index.js';

describe('tooltip-rule-card types', () => {
  it('constructs RealizedLine', () => {
    const line: RealizedLine = { text: 'Place US Troops in Saigon', astPath: 'root.effects[0]' };
    assert.equal(line.text, 'Place US Troops in Saigon');
    assert.equal(line.astPath, 'root.effects[0]');
  });

  it('constructs ContentStep with sub-steps', () => {
    const step: ContentStep = {
      stepNumber: 1,
      header: 'Select target spaces',
      lines: [{ text: 'Choose 1-6 spaces with COIN control', astPath: 'root.effects[0]' }],
      subSteps: [
        {
          stepNumber: 1,
          header: 'Place forces',
          lines: [{ text: 'Place US Troops from Available', astPath: 'root.effects[0].in[0]' }],
        },
      ],
    };
    assert.equal(step.stepNumber, 1);
    assert.equal(step.subSteps?.length, 1);
  });

  it('constructs ContentModifier', () => {
    const modifier: ContentModifier = {
      condition: 'Shaded event active',
      description: '+1 Troop per space',
    };
    assert.equal(modifier.condition, 'Shaded event active');
  });

  it('constructs RuleCard', () => {
    const card: RuleCard = {
      synopsis: 'Train — Select 1-6 target spaces',
      steps: [
        { stepNumber: 1, header: 'Select target spaces (1-6)', lines: [] },
        { stepNumber: 2, header: 'Place forces from Available', lines: [{ text: 'Place US Troops (max 6 total)', astPath: 'root.effects[1]' }] },
      ],
      modifiers: [
        { condition: 'Shaded', description: '+1 Troop per space' },
      ],
    };
    assert.equal(card.synopsis, 'Train — Select 1-6 target spaces');
    assert.equal(card.steps.length, 2);
    assert.equal(card.modifiers.length, 1);
  });

  it('constructs BlockerDetail with optional fields', () => {
    const blocker: BlockerDetail = {
      astPath: 'root.precondition.and[0]',
      description: 'Need Aid >= 3',
      currentValue: '1',
      requiredValue: '3',
    };
    assert.equal(blocker.description, 'Need Aid >= 3');
    assert.equal(blocker.currentValue, '1');

    const minimalBlocker: BlockerDetail = {
      astPath: 'root.precondition',
      description: 'Action not available',
    };
    assert.equal(minimalBlocker.currentValue, undefined);
  });

  it('constructs BlockerInfo', () => {
    const info: BlockerInfo = {
      satisfied: false,
      blockers: [
        { astPath: 'root.pre.and[0]', description: 'Need Aid >= 3', currentValue: '1', requiredValue: '3' },
      ],
    };
    assert.equal(info.satisfied, false);
    assert.equal(info.blockers.length, 1);
  });

  it('constructs RuleState with limit usage', () => {
    const state: RuleState = {
      available: true,
      blockers: [],
      activeModifierIndices: [0],
      limitUsage: [{ id: 'action::turn::0', scope: 'turn', used: 1, max: 3 }],
    };
    assert.equal(state.available, true);
    assert.equal(state.limitUsage?.[0]?.used, 1);
  });

  it('constructs RuleState without limit usage', () => {
    const state: RuleState = {
      available: false,
      blockers: [{ astPath: 'root.pre', description: 'Blocked' }],
      activeModifierIndices: [],
    };
    assert.equal(state.available, false);
    assert.equal(state.limitUsage, undefined);
  });

  it('constructs ActionTooltipPayload', () => {
    const payload: ActionTooltipPayload = {
      ruleCard: {
        synopsis: 'Sweep — Select target spaces with cubes',
        steps: [{ stepNumber: 1, header: 'Select spaces', lines: [] }],
        modifiers: [],
      },
      ruleState: {
        available: true,
        blockers: [],
        activeModifierIndices: [],
      },
    };
    assert.equal(payload.ruleCard.synopsis, 'Sweep — Select target spaces with cubes');
    assert.equal(payload.ruleState.available, true);
  });
});

describe('VerbalizationDef types', () => {
  it('constructs VerbalizationDef with all fields', () => {
    const def: VerbalizationDef = {
      labels: {
        usTroops: { singular: 'US Troop', plural: 'US Troops' },
        saigon: 'Saigon',
      },
      stages: {
        selectSpaces: 'Select target spaces',
        placeForces: 'Place forces',
      },
      macros: {
        trainUs: { class: 'operation', summary: 'Place US forces and build support' },
      },
      sentencePlans: {
        shiftMarker: {
          supportOpposition: {
            '+1': 'Shift 1 level toward Active Support',
          },
        },
      },
      suppressPatterns: ['*Count', '*Tracker', '__*'],
    };
    const usTroopsLabel = def.labels['usTroops'];
    assert.ok(usTroopsLabel !== undefined && typeof usTroopsLabel === 'object');
    assert.equal(usTroopsLabel.singular, 'US Troop');
    assert.equal(def.stages['selectSpaces'], 'Select target spaces');
    const trainMacro = def.macros['trainUs'];
    assert.ok(trainMacro !== undefined);
    assert.equal(trainMacro.summary, 'Place US forces and build support');
    assert.equal(def.suppressPatterns.length, 3);
  });

  it('VerbalizationDef is assignable to GameDef.verbalization', () => {
    const verbalization: VerbalizationDef = {
      labels: {},
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
    };

    // Verify it can be used where GameDef['verbalization'] is expected
    const partialDef: Pick<GameDef, 'verbalization'> = { verbalization };
    if (partialDef.verbalization === undefined) {
      throw new Error('Expected verbalization to be defined');
    }
    assert.deepEqual(partialDef.verbalization.suppressPatterns, []);
  });
});
