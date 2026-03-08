import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { realizeContentPlan } from '../../../src/kernel/tooltip-template-realizer.js';
import type { ContentPlan, ContentPlanStep } from '../../../src/kernel/tooltip-content-planner.js';
import type { TooltipMessage } from '../../../src/kernel/tooltip-ir.js';
import type { VerbalizationDef } from '../../../src/kernel/verbalization-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_VERB: VerbalizationDef = {
  labels: {
    usTroops: { singular: 'US Troop', plural: 'US Troops' },
    saigon: 'Saigon',
    aid: 'Aid',
    arvnResources: 'ARVN Resources',
    supportOpposition: 'Support/Opposition',
    nvaGuerrillas: { singular: 'NVA Guerrilla', plural: 'NVA Guerrillas' },
    availableUs: 'US Available Forces',
    casualties: 'Casualties',
    eventDeck: 'Event Deck',
    sweep: 'Sweep',
    arvn: 'ARVN',
    operations: 'Operations',
  },
  stages: {},
  macros: {},
  sentencePlans: {
    shiftMarker: {
      supportOpposition: {
        '+1': 'Shift 1 level toward Active Support',
        '-1': 'Shift 1 level toward Active Opposition',
      },
    },
    setVar: {
      aid: { '+3': 'Add 3 Aid' },
    },
  },
  suppressPatterns: [],
  stageDescriptions: {},
  modifierEffects: {},
};

const step = (messages: readonly TooltipMessage[], stepNumber = 1): ContentPlanStep => ({
  stepNumber,
  header: `Step ${stepNumber}`,
  messages,
});

const plan = (messages: readonly TooltipMessage[], actionLabel = 'train', synopsisSource?: TooltipMessage): ContentPlan => ({
  actionLabel,
  ...(synopsisSource !== undefined ? { synopsisSource } : {}),
  steps: [step(messages)],
  modifiers: [],
});

// ---------------------------------------------------------------------------
// Message kind templates
// ---------------------------------------------------------------------------

describe('realizeContentPlan', () => {
  describe('message kind templates', () => {
    it('realizes select(spaces) with bounds', () => {
      const msg: TooltipMessage = { kind: 'select', astPath: 'r', target: 'spaces', bounds: { min: 1, max: 6 }, filter: 'targetSpaces' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Select 1-6 Target Spaces');
    });

    it('realizes select without bounds', () => {
      const msg: TooltipMessage = { kind: 'select', astPath: 'r', target: 'zones' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Select zones');
    });

    it('realizes place', () => {
      const msg: TooltipMessage = { kind: 'place', astPath: 'r', tokenFilter: 'usTroops', targetZone: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Place US Troops in Saigon');
    });

    it('realizes move', () => {
      const msg: TooltipMessage = { kind: 'move', astPath: 'r', tokenFilter: 'usTroops', fromZone: 'saigon', toZone: 'availableUs' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Move US Troops from Saigon to US Available Forces');
    });

    it('realizes move(adjacent)', () => {
      const msg: TooltipMessage = { kind: 'move', astPath: 'r', tokenFilter: 'usTroops', fromZone: 'x', toZone: 'y', variant: 'adjacent' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Move US Troops from adjacent spaces');
    });

    it('realizes pay', () => {
      const msg: TooltipMessage = { kind: 'pay', astPath: 'r', resource: 'aid', amount: 3 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Pay 3 Aid');
    });

    it('realizes gain', () => {
      const msg: TooltipMessage = { kind: 'gain', astPath: 'r', resource: 'arvnResources', amount: 6 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Gain 6 ARVN Resources');
    });

    it('realizes transfer', () => {
      const msg: TooltipMessage = { kind: 'transfer', astPath: 'r', resource: 'aid', amount: 2, from: 'arvn', to: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Transfer 2 Aid from ARVN to Saigon');
    });

    it('realizes transfer with amountExpr', () => {
      const msg: TooltipMessage = { kind: 'transfer', astPath: 'r', resource: 'aid', amount: 0, amountExpr: 'population', from: 'arvn', to: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Transfer population Aid from ARVN to Saigon');
    });

    it('realizes shift with sentencePlan', () => {
      const msg: TooltipMessage = { kind: 'shift', astPath: 'r', marker: 'supportOpposition', direction: 'up', amount: 1 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Shift 1 level toward Active Support');
    });

    it('realizes shift without sentencePlan', () => {
      const msg: TooltipMessage = { kind: 'shift', astPath: 'r', marker: 'totalEcon', direction: 'up', amount: 2 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Shift Total Econ by +2');
    });

    it('realizes shift with deltaExpr', () => {
      const msg: TooltipMessage = { kind: 'shift', astPath: 'r', marker: 'totalEcon', direction: 'up', amount: 0, deltaExpr: 'population' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Shift Total Econ by population');
    });

    it('realizes activate', () => {
      const msg: TooltipMessage = { kind: 'activate', astPath: 'r', tokenFilter: 'nvaGuerrillas', zone: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Activate NVA Guerrillas in Saigon');
    });

    it('realizes deactivate', () => {
      const msg: TooltipMessage = { kind: 'deactivate', astPath: 'r', tokenFilter: 'nvaGuerrillas', zone: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Deactivate NVA Guerrillas in Saigon');
    });

    it('realizes remove with destination', () => {
      const msg: TooltipMessage = { kind: 'remove', astPath: 'r', tokenFilter: 'usTroops', fromZone: 'saigon', destination: 'casualties' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Remove US Troops from Saigon to Casualties');
    });

    it('realizes remove with destination and budget', () => {
      const msg: TooltipMessage = { kind: 'remove', astPath: 'r', tokenFilter: 'usTroops', fromZone: 'saigon', destination: 'casualties', budget: '3' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Remove US Troops from Saigon to Casualties (up to 3)');
    });

    it('realizes remove with destination using humanize fallback', () => {
      const msg: TooltipMessage = { kind: 'remove', astPath: 'r', tokenFilter: 'usTroops', fromZone: 'saigon', destination: 'outOfPlay' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Remove US Troops from Saigon to Out Of Play');
    });

    it('realizes create', () => {
      const msg: TooltipMessage = { kind: 'create', astPath: 'r', tokenFilter: 'usTroops', targetZone: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Create US Troops in Saigon');
    });

    it('realizes destroy', () => {
      const msg: TooltipMessage = { kind: 'destroy', astPath: 'r', tokenFilter: 'usTroops', fromZone: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Destroy US Troops from Saigon');
    });

    it('realizes reveal', () => {
      const msg: TooltipMessage = { kind: 'reveal', astPath: 'r', target: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Reveal Saigon');
    });

    it('realizes draw', () => {
      const msg: TooltipMessage = { kind: 'draw', astPath: 'r', source: 'eventDeck', count: 2 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Draw 2 from Event Deck');
    });

    it('realizes shuffle', () => {
      const msg: TooltipMessage = { kind: 'shuffle', astPath: 'r', target: 'eventDeck' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Shuffle Event Deck');
    });

    it('realizes set', () => {
      const msg: TooltipMessage = { kind: 'set', astPath: 'r', target: 'aid', value: '5' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Set Aid to 5');
    });

    it('realizes set with sentencePlan', () => {
      const msg: TooltipMessage = { kind: 'set', astPath: 'r', target: 'aid', value: '+3' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Add 3 Aid');
    });

    it('realizes set with toggle', () => {
      const msg: TooltipMessage = { kind: 'set', astPath: 'r', target: 'aid', value: 'true', toggle: true };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Toggle Aid');
    });

    it('realizes choose', () => {
      const msg: TooltipMessage = { kind: 'choose', astPath: 'r', options: ['sweep', 'operations'], paramName: 'action' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Choose: Sweep, Operations');
    });

    it('realizes roll', () => {
      const msg: TooltipMessage = { kind: 'roll', astPath: 'r', range: { min: 1, max: 6 }, bindTo: 'dieResult' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Roll 1-6');
    });

    it('realizes modifier with condition+effect', () => {
      const msg: TooltipMessage = { kind: 'modifier', astPath: 'r', condition: 'monsoon', description: 'No air lift during Monsoon' };
      const result = realizeContentPlan(plan([msg]), undefined);
      // Modifiers are extracted to the plan's modifiers array by the content planner,
      // but if one appears in messages, the realizer outputs "condition: description"
      assert.equal(result.steps[0]!.lines[0]!.text, 'monsoon: No air lift during Monsoon');
    });

    it('realizes blocker', () => {
      const msg: TooltipMessage = { kind: 'blocker', astPath: 'r', reason: 'Need Aid >= 3' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Need Aid >= 3');
    });

    it('realizes phase', () => {
      const msg: TooltipMessage = { kind: 'phase', astPath: 'r', fromPhase: 'operations', toPhase: 'events' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Advance to Events phase');
    });

    it('realizes grant', () => {
      const msg: TooltipMessage = { kind: 'grant', astPath: 'r', operation: 'sweep', targetPlayer: 'arvn' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Grant free Sweep to ARVN');
    });

    it('realizes conceal', () => {
      const msg: TooltipMessage = { kind: 'conceal', astPath: 'r', target: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Conceal Saigon');
    });

    it('filters out suppressed messages', () => {
      const msg: TooltipMessage = { kind: 'suppressed', astPath: 'r', reason: 'internal' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines.length, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Singular/plural label resolution
  // ---------------------------------------------------------------------------

  describe('singular/plural label resolution', () => {
    it('pay with amount=1 uses singular label', () => {
      const msg: TooltipMessage = { kind: 'pay', astPath: 'r', resource: 'usTroops', amount: 1 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Pay 1 US Troop');
    });

    it('pay with amount>1 uses plural label', () => {
      const msg: TooltipMessage = { kind: 'pay', astPath: 'r', resource: 'usTroops', amount: 3 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Pay 3 US Troops');
    });

    it('gain with amount=1 uses singular label', () => {
      const msg: TooltipMessage = { kind: 'gain', astPath: 'r', resource: 'usTroops', amount: 1 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Gain 1 US Troop');
    });

    it('gain with amount>1 uses plural label', () => {
      const msg: TooltipMessage = { kind: 'gain', astPath: 'r', resource: 'usTroops', amount: 5 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Gain 5 US Troops');
    });

    it('transfer with amount=1 uses singular resource label', () => {
      const msg: TooltipMessage = { kind: 'transfer', astPath: 'r', resource: 'usTroops', amount: 1, from: 'saigon', to: 'availableUs' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Transfer 1 US Troop from Saigon to US Available Forces');
    });

    it('transfer with amount>1 uses plural resource label', () => {
      const msg: TooltipMessage = { kind: 'transfer', astPath: 'r', resource: 'usTroops', amount: 3, from: 'saigon', to: 'availableUs' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Transfer 3 US Troops from Saigon to US Available Forces');
    });

    it('plain string label is unaffected by count', () => {
      const msg: TooltipMessage = { kind: 'pay', astPath: 'r', resource: 'aid', amount: 1 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Pay 1 Aid');
    });

    it('amount=0 uses plural label', () => {
      const msg: TooltipMessage = { kind: 'gain', astPath: 'r', resource: 'usTroops', amount: 0 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Gain 0 US Troops');
    });
  });

  // ---------------------------------------------------------------------------
  // Label resolution priority
  // ---------------------------------------------------------------------------

  describe('label resolution priority', () => {
    it('sentencePlan wins over label and humanize', () => {
      const msg: TooltipMessage = { kind: 'shift', astPath: 'r', marker: 'supportOpposition', direction: 'up', amount: 1 };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      // sentencePlan for shiftMarker.supportOpposition.+1 exists
      assert.equal(result.steps[0]!.lines[0]!.text, 'Shift 1 level toward Active Support');
    });

    it('label wins over humanize when no sentencePlan', () => {
      const msg: TooltipMessage = { kind: 'place', astPath: 'r', tokenFilter: 'usTroops', targetZone: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Place US Troops in Saigon');
    });

    it('humanize fallback when no verbalization', () => {
      const msg: TooltipMessage = { kind: 'place', astPath: 'r', tokenFilter: 'usTroops', targetZone: 'saigon' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Place Us Troops in Saigon');
    });
  });

  // ---------------------------------------------------------------------------
  // Synopsis
  // ---------------------------------------------------------------------------

  describe('synopsis generation', () => {
    it('generates synopsis with synopsisSource', () => {
      const synSrc: TooltipMessage = { kind: 'select', astPath: 'r', target: 'spaces', bounds: { min: 1, max: 6 } };
      const result = realizeContentPlan(plan([], 'train', synSrc), undefined);
      assert.equal(result.synopsis, 'Train — Select 1-6 spaces');
    });

    it('generates synopsis without synopsisSource', () => {
      const result = realizeContentPlan(plan([], 'train'), undefined);
      assert.equal(result.synopsis, 'Train');
    });

    it('resolves action label through verbalization', () => {
      const verb: VerbalizationDef = {
        labels: { train: 'Train' },
        stages: {},
        macros: {},
        sentencePlans: {},
        suppressPatterns: [],
        stageDescriptions: {},
        modifierEffects: {},
      };
      const result = realizeContentPlan(plan([], 'train'), verb);
      assert.equal(result.synopsis, 'Train');
    });
  });

  // ---------------------------------------------------------------------------
  // Sub-steps
  // ---------------------------------------------------------------------------

  describe('sub-steps', () => {
    it('realizes sub-steps recursively', () => {
      const innerMsg: TooltipMessage = { kind: 'pay', astPath: 'r.effects[0].in[0]', resource: 'aid', amount: 1 };
      const outerMsg: TooltipMessage = { kind: 'gain', astPath: 'r', resource: 'aid', amount: 5 };
      const planWithSubSteps: ContentPlan = {
        actionLabel: 'train',
        steps: [{
          stepNumber: 1,
          header: 'Step 1',
          messages: [outerMsg],
    
          subSteps: [{
            stepNumber: 1,
            header: 'Sub-step 1',
            messages: [innerMsg],
      
          }],
        }],
        modifiers: [],
      };
      const result = realizeContentPlan(planWithSubSteps, MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Gain 5 Aid');
      assert.equal(result.steps[0]!.subSteps![0]!.lines[0]!.text, 'Pay 1 Aid');
    });
  });

  // ---------------------------------------------------------------------------
  // Modifiers
  // ---------------------------------------------------------------------------

  describe('modifiers', () => {
    it('converts plan modifiers to RuleCard modifiers', () => {
      const planWithMod: ContentPlan = {
        actionLabel: 'train',
        steps: [],
        modifiers: [
          { kind: 'modifier', astPath: 'r', condition: 'monsoon', description: 'No air lift' },
        ],
      };
      const result = realizeContentPlan(planWithMod, undefined);
      assert.equal(result.modifiers.length, 1);
      assert.equal(result.modifiers[0]!.condition, 'monsoon');
      assert.equal(result.modifiers[0]!.description, 'No air lift');
    });
  });

  // ---------------------------------------------------------------------------
  // astPath traceability
  // ---------------------------------------------------------------------------

  describe('astPath traceability', () => {
    it('preserves astPath from source message in realized line', () => {
      const msg: TooltipMessage = { kind: 'place', astPath: 'root.effects[2]', tokenFilter: 'usTroops', targetZone: 'saigon' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.astPath, 'root.effects[2]');
    });

    it('preserves astPath through sub-steps', () => {
      const innerMsg: TooltipMessage = { kind: 'pay', astPath: 'root.effects[0].in[0]', resource: 'aid', amount: 1 };
      const outerMsg: TooltipMessage = { kind: 'gain', astPath: 'root.effects[0]', resource: 'aid', amount: 5 };
      const planWithSubSteps: ContentPlan = {
        actionLabel: 'train',
        steps: [{
          stepNumber: 1,
          header: 'Step 1',
          messages: [outerMsg],
    
          subSteps: [{
            stepNumber: 1,
            header: 'Sub-step 1',
            messages: [innerMsg],
      
          }],
        }],
        modifiers: [],
      };
      const result = realizeContentPlan(planWithSubSteps, MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.astPath, 'root.effects[0]');
      assert.equal(result.steps[0]!.subSteps![0]!.lines[0]!.astPath, 'root.effects[0].in[0]');
    });

    it('does not include suppressed messages in lines (no stale astPath)', () => {
      const msg1: TooltipMessage = { kind: 'place', astPath: 'root.effects[0]', tokenFilter: 'usTroops', targetZone: 'saigon' };
      const msg2: TooltipMessage = { kind: 'suppressed', astPath: 'root.effects[1]', reason: 'internal' };
      const result = realizeContentPlan(plan([msg1, msg2]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines.length, 1);
      assert.equal(result.steps[0]!.lines[0]!.astPath, 'root.effects[0]');
    });
  });

  // ---------------------------------------------------------------------------
  // Select bounds formatting (LEGTOOLT-005)
  // ---------------------------------------------------------------------------

  describe('select bounds formatting', () => {
    it('min === max produces "Select N target" (not "Select N-N")', () => {
      const msg: TooltipMessage = { kind: 'select', astPath: 'r', target: 'spaces', bounds: { min: 3, max: 3 } };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Select 3 spaces');
    });

    it('min === 1 and max === 1 produces singular "Select 1 target"', () => {
      const msg: TooltipMessage = { kind: 'select', astPath: 'r', target: 'spaces', bounds: { min: 1, max: 1 } };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Select 1 space');
    });

    it('min === 0 produces "Select up to max target"', () => {
      const msg: TooltipMessage = { kind: 'select', astPath: 'r', target: 'spaces', bounds: { min: 0, max: 2 } };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Select up to 2 spaces');
    });

    it('general range keeps "Select min-max target"', () => {
      const msg: TooltipMessage = { kind: 'select', astPath: 'r', target: 'spaces', bounds: { min: 2, max: 5 } };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Select 2-5 spaces');
    });

    it('min === 0 with filter resolves filter through resolveLabel', () => {
      const msg: TooltipMessage = { kind: 'select', astPath: 'r', target: 'spaces', bounds: { min: 0, max: 3 }, filter: 'usTroops' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Select up to 3 US Troops');
    });

    it('min === max === 1 with singular/plural filter uses singular', () => {
      const msg: TooltipMessage = { kind: 'select', astPath: 'r', target: 'spaces', bounds: { min: 1, max: 1 }, filter: 'usTroops' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Select 1 US Troop');
    });

    it('min === max > 1 with singular/plural filter uses plural', () => {
      const msg: TooltipMessage = { kind: 'select', astPath: 'r', target: 'spaces', bounds: { min: 3, max: 3 }, filter: 'usTroops' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Select 3 US Troops');
    });
  });

  // ---------------------------------------------------------------------------
  // Choose optional flag (LEGTOOLT-005)
  // ---------------------------------------------------------------------------

  describe('choose optional flag', () => {
    it('appends "(optional)" when msg.optional is true', () => {
      const msg: TooltipMessage = { kind: 'choose', astPath: 'r', options: ['sweep', 'operations'], paramName: 'action', optional: true };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Choose: Sweep, Operations (optional)');
    });

    it('does not append "(optional)" when optional is absent', () => {
      const msg: TooltipMessage = { kind: 'choose', astPath: 'r', options: ['sweep', 'operations'], paramName: 'action' };
      const result = realizeContentPlan(plan([msg]), MOCK_VERB);
      assert.equal(result.steps[0]!.lines[0]!.text, 'Choose: Sweep, Operations');
    });
  });

  // ---------------------------------------------------------------------------
  // Stage description resolution (LEGTOOLT-005)
  // ---------------------------------------------------------------------------

  describe('stage description resolution', () => {
    const VERB_WITH_STAGES: VerbalizationDef = {
      ...MOCK_VERB,
      stages: { train: 'Training Phase' },
      stageDescriptions: {
        us: {
          train: { label: 'US Training', description: 'Deploy troops and build bases' },
        },
      },
    };

    it('resolves header through stageDescriptions when profileId matches', () => {
      const p: ContentPlan = {
        actionLabel: 'train',
        steps: [{ stepNumber: 1, header: 'train', messages: [] }],
        modifiers: [],
      };
      const result = realizeContentPlan(p, VERB_WITH_STAGES, 'us');
      assert.equal(result.steps[0]!.header, 'US Training');
    });

    it('falls back to stages map when profileId has no matching entry', () => {
      const p: ContentPlan = {
        actionLabel: 'train',
        steps: [{ stepNumber: 1, header: 'train', messages: [] }],
        modifiers: [],
      };
      const result = realizeContentPlan(p, VERB_WITH_STAGES, 'nva');
      assert.equal(result.steps[0]!.header, 'Training Phase');
    });

    it('falls back to resolveLabel when no stages match', () => {
      const p: ContentPlan = {
        actionLabel: 'train',
        steps: [{ stepNumber: 1, header: 'unknownStage', messages: [] }],
        modifiers: [],
      };
      const result = realizeContentPlan(p, VERB_WITH_STAGES, 'us');
      assert.equal(result.steps[0]!.header, 'Unknown Stage');
    });

    it('falls back to resolveLabel when no profileId is provided', () => {
      const p: ContentPlan = {
        actionLabel: 'train',
        steps: [{ stepNumber: 1, header: 'train', messages: [] }],
        modifiers: [],
      };
      const result = realizeContentPlan(p, VERB_WITH_STAGES);
      assert.equal(result.steps[0]!.header, 'Training Phase');
    });

    it('includes description as subtitle when available', () => {
      const p: ContentPlan = {
        actionLabel: 'train',
        steps: [{ stepNumber: 1, header: 'train', messages: [] }],
        modifiers: [],
      };
      const result = realizeContentPlan(p, VERB_WITH_STAGES, 'us');
      assert.equal(result.steps[0]!.description, 'Deploy troops and build bases');
    });

    it('omits description when stageDescription has no description field', () => {
      const verbNoDesc: VerbalizationDef = {
        ...MOCK_VERB,
        stageDescriptions: {
          us: { train: { label: 'US Training' } },
        },
      };
      const p: ContentPlan = {
        actionLabel: 'train',
        steps: [{ stepNumber: 1, header: 'train', messages: [] }],
        modifiers: [],
      };
      const result = realizeContentPlan(p, verbNoDesc, 'us');
      assert.equal(result.steps[0]!.description, undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // Modifier condition+effect (LEGTOOLT-005)
  // ---------------------------------------------------------------------------

  describe('modifier condition+effect realization', () => {
    it('shows "condition: description" when description is non-empty and differs from condition', () => {
      const msg: TooltipMessage = { kind: 'modifier', astPath: 'r', condition: 'monsoon', description: 'No air lift during Monsoon' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'monsoon: No air lift during Monsoon');
    });

    it('shows just description when it equals condition', () => {
      const msg: TooltipMessage = { kind: 'modifier', astPath: 'r', condition: 'same text', description: 'same text' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'same text');
    });

    it('shows just condition when description is empty', () => {
      const msg: TooltipMessage = { kind: 'modifier', astPath: 'r', condition: 'monsoon', description: '' };
      const result = realizeContentPlan(plan([msg]), undefined);
      assert.equal(result.steps[0]!.lines[0]!.text, 'monsoon');
    });
  });

  // ---------------------------------------------------------------------------
  // Determinism
  // ---------------------------------------------------------------------------

  describe('determinism', () => {
    it('same inputs produce same output', () => {
      const msg: TooltipMessage = { kind: 'place', astPath: 'r', tokenFilter: 'usTroops', targetZone: 'saigon' };
      const p = plan([msg]);
      const r1 = realizeContentPlan(p, MOCK_VERB);
      const r2 = realizeContentPlan(p, MOCK_VERB);
      assert.deepEqual(r1, r2);
    });
  });
});
