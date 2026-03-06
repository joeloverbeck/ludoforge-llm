import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  planContent,
} from '../../../src/kernel/index.js';
import type {
  TooltipMessage,
  SelectMessage,
  ModifierMessage,
  SuppressedMessage,
  PlaceMessage,
  GainMessage,
  ChooseMessage,
  ContentPlanStep,
} from '../../../src/kernel/index.js';

// ---------------------------------------------------------------------------
// Helpers: message factories
// ---------------------------------------------------------------------------

function makeSelect(overrides?: Partial<SelectMessage>): SelectMessage {
  return {
    kind: 'select',
    target: 'spaces',
    bounds: { min: 1, max: 6 },
    astPath: 'effects[0]',
    ...overrides,
  };
}

function makePlace(overrides?: Partial<PlaceMessage>): PlaceMessage {
  return {
    kind: 'place',
    tokenFilter: 'usTroops',
    targetZone: 'saigon',
    astPath: 'effects[1]',
    ...overrides,
  };
}

function makeGain(overrides?: Partial<GainMessage>): GainMessage {
  return {
    kind: 'gain',
    resource: 'aid',
    amount: 3,
    astPath: 'effects[2]',
    ...overrides,
  };
}

function makeModifier(overrides?: Partial<ModifierMessage>): ModifierMessage {
  return {
    kind: 'modifier',
    condition: 'monsoon === true',
    description: 'If monsoon: no air lift',
    astPath: 'effects[4]',
    ...overrides,
  };
}

function makeSuppressed(overrides?: Partial<SuppressedMessage>): SuppressedMessage {
  return {
    kind: 'suppressed',
    reason: 'telemetry variable',
    astPath: 'effects[5]',
    ...overrides,
  };
}

function makeChoose(overrides?: Partial<ChooseMessage>): ChooseMessage {
  return {
    kind: 'choose',
    options: ['option1', 'option2'],
    paramName: 'choice',
    astPath: 'effects[6]',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tooltip-content-planner', () => {

  describe('planContent', () => {

    // --- Filtering ---

    it('filters suppressed messages from output', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect(),
        makeSuppressed(),
        makePlace(),
      ];
      const plan = planContent(messages, 'Train');

      const allMessages = collectAllMessages(plan.steps);
      assert.equal(allMessages.length, 2);
      assert.ok(allMessages.every((m) => m.kind !== 'suppressed'));
    });

    it('handles all-suppressed input', () => {
      const messages: readonly TooltipMessage[] = [
        makeSuppressed(),
        makeSuppressed({ astPath: 'effects[6]' }),
      ];
      const plan = planContent(messages, 'Pass');

      assert.equal(plan.steps.length, 0);
      assert.equal(plan.modifiers.length, 0);
      assert.equal(plan.synopsisSource, undefined);
    });

    // --- Modifier extraction ---

    it('extracts modifiers into separate array', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect(),
        makeModifier(),
        makePlace(),
        makeModifier({ condition: 'shaded', description: 'If shaded: +1', astPath: 'effects[7]' }),
        makeGain(),
      ];
      const plan = planContent(messages, 'Train');

      assert.equal(plan.modifiers.length, 2);
      assert.equal(plan.modifiers[0]!.condition, 'monsoon === true');
      assert.equal(plan.modifiers[1]!.condition, 'shaded');

      const allMessages = collectAllMessages(plan.steps);
      assert.ok(allMessages.every((m) => m.kind !== 'modifier'));
      assert.equal(allMessages.length, 3); // select, place, gain
    });

    // --- Stage grouping ---

    it('groups messages by stage into separate steps', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect({ stage: 'selectSpaces' }),
        makePlace({ stage: 'placeForces' }),
        makeGain({ stage: 'placeForces' }),
      ];
      const plan = planContent(messages, 'Train');

      assert.equal(plan.steps.length, 2);
      assert.equal(plan.steps[0]!.header, 'selectSpaces');
      assert.equal(plan.steps[0]!.stepNumber, 1);
      assert.equal(plan.steps[0]!.messages.length, 1);

      assert.equal(plan.steps[1]!.header, 'placeForces');
      assert.equal(plan.steps[1]!.stepNumber, 2);
      assert.equal(plan.steps[1]!.messages.length, 2);
    });

    it('preserves stage order of first occurrence', () => {
      const messages: readonly TooltipMessage[] = [
        makePlace({ stage: 'placeForces', astPath: 'effects[0]' }),
        makeSelect({ stage: 'selectSpaces', astPath: 'effects[1]' }),
        makeGain({ stage: 'placeForces', astPath: 'effects[2]' }),
      ];
      const plan = planContent(messages, 'Train');

      assert.equal(plan.steps[0]!.header, 'placeForces');
      assert.equal(plan.steps[1]!.header, 'selectSpaces');
    });

    it('creates single step when no stages present', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect(),
        makePlace(),
      ];
      const plan = planContent(messages, 'Train');

      assert.equal(plan.steps.length, 1);
      assert.equal(plan.steps[0]!.header, 'Step 1');
      assert.equal(plan.steps[0]!.messages.length, 2);
    });

    // --- Synopsis source ---

    it('identifies first SelectMessage as synopsis source', () => {
      const messages: readonly TooltipMessage[] = [
        makePlace(),
        makeSelect(),
        makeGain(),
      ];
      const plan = planContent(messages, 'Train');

      assert.ok(plan.synopsisSource !== undefined);
      assert.equal(plan.synopsisSource!.kind, 'select');
    });

    it('identifies ChooseMessage as synopsis source when no select', () => {
      const messages: readonly TooltipMessage[] = [
        makePlace(),
        makeChoose(),
        makeGain(),
      ];
      const plan = planContent(messages, 'Raise');

      assert.ok(plan.synopsisSource !== undefined);
      assert.equal(plan.synopsisSource!.kind, 'choose');
    });

    it('returns undefined synopsis source when no select/choose', () => {
      const messages: readonly TooltipMessage[] = [
        makePlace(),
        makeGain(),
      ];
      const plan = planContent(messages, 'Pass');

      assert.equal(plan.synopsisSource, undefined);
    });

    // --- Sub-step detection ---

    it('creates sub-steps from deeper astPath messages', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect({ astPath: 'effects[0]' }),
        makePlace({ astPath: 'effects[1].forEach.effects[0]' }),
        makeGain({ astPath: 'effects[1].forEach.effects[1]' }),
      ];
      const plan = planContent(messages, 'Train');

      assert.equal(plan.steps.length, 1);
      assert.equal(plan.steps[0]!.messages.length, 1); // select at depth 0
      assert.ok(plan.steps[0]!.subSteps !== undefined);
      assert.equal(plan.steps[0]!.subSteps!.length, 1); // one sub-step group
      assert.equal(plan.steps[0]!.subSteps![0]!.messages.length, 2); // place, gain
    });

    it('collapses sub-steps beyond limit of 3', () => {
      // 5 sub-step groups from 5 different forEach containers
      const messages: readonly TooltipMessage[] = [
        makeSelect({ astPath: 'effects[0]' }),
        makePlace({ astPath: 'effects[1].forEach.effects[0]' }),
        makePlace({ astPath: 'effects[2].forEach.effects[0]' }),
        makePlace({ astPath: 'effects[3].forEach.effects[0]' }),
        makePlace({ astPath: 'effects[4].forEach.effects[0]' }),
        makePlace({ astPath: 'effects[5].forEach.effects[0]' }),
      ];
      const plan = planContent(messages, 'Train');

      const step = plan.steps[0]!;
      assert.equal(step.messages.length, 1); // select
      assert.ok(step.subSteps !== undefined);
      assert.equal(step.subSteps!.length, 3); // kept 3
      assert.equal(step.collapsedCount, 2); // collapsed 2
    });

    // --- Rhetorical budget ---

    it('enforces budget by collapsing deepest sub-steps first', () => {
      // Create an action with many messages that exceeds budget of 30
      const msgs: TooltipMessage[] = [];
      for (let i = 0; i < 35; i++) {
        msgs.push(makePlace({
          astPath: `effects[${i}]`,
          stage: `stage${Math.floor(i / 10)}`,
        }));
      }
      const plan = planContent(msgs, 'ComplexAction');

      const totalAfterBudget = countAllMessages(plan.steps);
      assert.ok(totalAfterBudget <= 30, `Expected <= 30 messages, got ${totalAfterBudget}`);
    });

    // --- Empty input ---

    it('handles empty input gracefully', () => {
      const plan = planContent([], 'Pass');

      assert.equal(plan.actionLabel, 'Pass');
      assert.equal(plan.synopsisSource, undefined);
      assert.equal(plan.steps.length, 0);
      assert.equal(plan.modifiers.length, 0);
    });

    // --- Action label ---

    it('preserves action label', () => {
      const plan = planContent([makeSelect()], 'Train');
      assert.equal(plan.actionLabel, 'Train');
    });

    // --- Purity ---

    it('does not mutate input array', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect(),
        makeSuppressed(),
        makeModifier(),
        makePlace(),
      ];
      const copy = [...messages];
      planContent(messages, 'Train');

      assert.equal(messages.length, copy.length);
      for (let i = 0; i < messages.length; i++) {
        assert.deepEqual(messages[i], copy[i]);
      }
    });

    // --- Step numbering ---

    it('numbers steps sequentially starting at 1', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect({ stage: 'alpha' }),
        makePlace({ stage: 'beta' }),
        makeGain({ stage: 'gamma' }),
      ];
      const plan = planContent(messages, 'Train');

      assert.equal(plan.steps[0]!.stepNumber, 1);
      assert.equal(plan.steps[1]!.stepNumber, 2);
      assert.equal(plan.steps[2]!.stepNumber, 3);
    });

    // --- No suppressed in output ---

    it('never includes suppressed messages in steps or modifiers', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect(),
        makeSuppressed(),
        makeModifier(),
        makeSuppressed({ astPath: 'effects[8]' }),
        makePlace(),
      ];
      const plan = planContent(messages, 'Train');

      const allMessages = collectAllMessages(plan.steps);
      assert.ok(allMessages.every((m) => m.kind !== 'suppressed'));
      assert.ok(plan.modifiers.every((m) => (m as TooltipMessage).kind !== 'suppressed'));
    });

    // --- Mixed stages and no-stage messages ---

    it('groups no-stage messages separately from staged ones', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect({ stage: 'selectSpaces' }),
        makePlace(), // no stage
        makeGain({ stage: 'selectSpaces' }),
      ];
      const plan = planContent(messages, 'Train');

      assert.equal(plan.steps.length, 2);
      // First step is selectSpaces (first occurrence)
      assert.equal(plan.steps[0]!.header, 'selectSpaces');
      // Second step is the default group
      assert.equal(plan.steps[1]!.messages.length, 1);
    });
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function collectAllMessages(steps: readonly ContentPlanStep[]): readonly TooltipMessage[] {
  const result: TooltipMessage[] = [];
  for (const step of steps) {
    result.push(...step.messages);
    if (step.subSteps !== undefined) {
      result.push(...collectAllMessages(step.subSteps));
    }
  }
  return result;
}

function countAllMessages(steps: readonly ContentPlanStep[]): number {
  return collectAllMessages(steps).length;
}
