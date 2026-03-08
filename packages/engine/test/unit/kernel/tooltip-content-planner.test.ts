import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  planContent,
  deduplicateMessages,
} from '../../../src/kernel/index.js';
import type {
  TooltipMessage,
  SelectMessage,
  ModifierMessage,
  SuppressedMessage,
  PlaceMessage,
  GainMessage,
  MoveMessage,
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

    it('keeps all sub-steps without truncation', () => {
      // 5 sub-step groups from 5 different forEach containers — all kept
      // Each place message is semantically distinct (different targetZone)
      const messages: readonly TooltipMessage[] = [
        makeSelect({ astPath: 'effects[0]' }),
        makePlace({ astPath: 'effects[1].forEach.effects[0]', targetZone: 'zone_a' }),
        makePlace({ astPath: 'effects[2].forEach.effects[0]', targetZone: 'zone_b' }),
        makePlace({ astPath: 'effects[3].forEach.effects[0]', targetZone: 'zone_c' }),
        makePlace({ astPath: 'effects[4].forEach.effects[0]', targetZone: 'zone_d' }),
        makePlace({ astPath: 'effects[5].forEach.effects[0]', targetZone: 'zone_e' }),
      ];
      const plan = planContent(messages, 'Train');

      const step = plan.steps[0]!;
      assert.equal(step.messages.length, 1); // select
      assert.ok(step.subSteps !== undefined);
      assert.equal(step.subSteps!.length, 5); // all 5 kept
    });

    // --- No budget enforcement (all messages preserved) ---

    it('preserves all messages without budget truncation', () => {
      const msgs: TooltipMessage[] = [];
      for (let i = 0; i < 35; i++) {
        // Each message is semantically distinct (unique targetZone)
        msgs.push(makePlace({
          astPath: `effects[${i}]`,
          stage: `stage${Math.floor(i / 10)}`,
          targetZone: `zone_${i}`,
        }));
      }
      const plan = planContent(msgs, 'ComplexAction');

      const totalMessages = countAllMessages(plan.steps);
      assert.equal(totalMessages, 35, 'All 35 messages should be preserved');
    });

    // --- Modifier deduplication ---

    it('deduplicates modifiers with identical conditions', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect(),
        makeModifier({ condition: 'monsoon === true', description: 'If monsoon: no air lift', astPath: 'effects[1]' }),
        makeModifier({ condition: 'monsoon === true', description: 'If monsoon: no air lift', astPath: 'effects[2]' }),
        makeModifier({ condition: 'shaded', description: 'If shaded: +1', astPath: 'effects[3]' }),
        makeModifier({ condition: 'monsoon === true', description: 'If monsoon: no air lift', astPath: 'effects[4]' }),
      ];
      const plan = planContent(messages, 'Train');

      assert.equal(plan.modifiers.length, 2);
      assert.equal(plan.modifiers[0]!.condition, 'monsoon === true');
      assert.equal(plan.modifiers[1]!.condition, 'shaded');
    });

    // --- Semantic sub-step headers ---

    it('derives semantic sub-step headers from first message kind', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect({ astPath: 'effects[0]' }),
        makePlace({ astPath: 'effects[1].forEach.effects[0]' }),
        makeGain({ astPath: 'effects[2].forEach.effects[0]' }),
      ];
      const plan = planContent(messages, 'Train');

      const step = plan.steps[0]!;
      assert.ok(step.subSteps !== undefined);
      assert.equal(step.subSteps![0]!.header, 'Place forces');
      assert.equal(step.subSteps![1]!.header, 'Gain resources');
    });

    it('detects sub-steps from removeByPriority groups paths', () => {
      const messages: readonly TooltipMessage[] = [
        makeSelect({ astPath: 'effects[0]' }),
        { kind: 'remove', tokenFilter: 'nva', fromZone: 'saigon', destination: 'casualties',
          astPath: 'effects[1].groups[0]' } as TooltipMessage,
        { kind: 'remove', tokenFilter: 'vc', fromZone: 'saigon', destination: 'casualties',
          astPath: 'effects[1].groups[1]' } as TooltipMessage,
      ];
      const plan = planContent(messages, 'Remove');

      const step = plan.steps[0]!;
      assert.equal(step.messages.length, 1); // select at depth 0
      assert.ok(step.subSteps !== undefined);
      assert.equal(step.subSteps!.length, 1); // one sub-step group
      assert.equal(step.subSteps![0]!.messages.length, 2); // both removes
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

    // --- Message deduplication in pipeline ---

    it('deduplicates structurally identical messages in the pipeline', () => {
      const messages: readonly TooltipMessage[] = [
        makePlace({ astPath: 'effects[0]', tokenFilter: 'usTroops', targetZone: 'saigon' }),
        makePlace({ astPath: 'effects[1]', tokenFilter: 'usTroops', targetZone: 'saigon' }),
        makeGain({ astPath: 'effects[2]' }),
        makeGain({ astPath: 'effects[3]' }),
      ];
      const plan = planContent(messages, 'Train');

      const allMessages = collectAllMessages(plan.steps);
      assert.equal(allMessages.length, 2); // one place, one gain
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

// ---------------------------------------------------------------------------
// SummaryMessage sub-step header
// ---------------------------------------------------------------------------

describe('planContent — SummaryMessage sub-step header', () => {
  it('uses macroClass as sub-step header when present', () => {
    const messages: TooltipMessage[] = [
      makeSelect({ astPath: 'root.effects[0]' }),
      {
        kind: 'summary',
        text: 'Place guerrillas',
        macroClass: 'Rally',
        astPath: 'root.effects[0].forEach.effects[0]',
      },
    ];
    const plan = planContent(messages, 'train');
    const step = plan.steps[0]!;
    assert.ok(step.subSteps !== undefined && step.subSteps.length > 0);
    assert.equal(step.subSteps![0]!.header, 'Rally');
  });

  it('uses generic Summary header when macroClass absent', () => {
    const messages: TooltipMessage[] = [
      makeSelect({ astPath: 'root.effects[0]' }),
      {
        kind: 'summary',
        text: 'Place guerrillas',
        astPath: 'root.effects[0].forEach.effects[0]',
      },
    ];
    const plan = planContent(messages, 'train');
    const step = plan.steps[0]!;
    assert.ok(step.subSteps !== undefined && step.subSteps.length > 0);
    assert.equal(step.subSteps![0]!.header, 'Summary');
  });
});

// ---------------------------------------------------------------------------
// deduplicateMessages
// ---------------------------------------------------------------------------

function makeMove(overrides?: Partial<MoveMessage>): MoveMessage {
  return {
    kind: 'move',
    tokenFilter: 'usTroops',
    fromZone: 'saigon',
    toZone: 'hue',
    astPath: 'effects[3]',
    ...overrides,
  };
}

describe('deduplicateMessages', () => {

  it('collapses messages identical except for astPath', () => {
    const messages: readonly TooltipMessage[] = [
      makePlace({ astPath: 'effects[0]' }),
      makePlace({ astPath: 'effects[1]' }),
    ];
    const result = deduplicateMessages(messages);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.kind, 'place');
  });

  it('collapses messages identical except for macroOrigin', () => {
    const messages: readonly TooltipMessage[] = [
      makePlace({ astPath: 'effects[0]', macroOrigin: 'macro_a' }),
      makePlace({ astPath: 'effects[0]', macroOrigin: 'macro_b' }),
    ];
    const result = deduplicateMessages(messages);
    assert.equal(result.length, 1);
  });

  it('collapses messages identical except for both astPath and macroOrigin', () => {
    const messages: readonly TooltipMessage[] = [
      makePlace({ astPath: 'effects[0]', macroOrigin: 'macro_a' }),
      makePlace({ astPath: 'effects[1]', macroOrigin: 'macro_b' }),
      makePlace({ astPath: 'effects[2]' }),
    ];
    const result = deduplicateMessages(messages);
    assert.equal(result.length, 1);
  });

  it('preserves messages with different semantic content', () => {
    const messages: readonly TooltipMessage[] = [
      makePlace({ astPath: 'effects[0]', tokenFilter: 'usTroops', targetZone: 'saigon' }),
      makePlace({ astPath: 'effects[1]', tokenFilter: 'nvaGuerrillas', targetZone: 'hue' }),
    ];
    const result = deduplicateMessages(messages);
    assert.equal(result.length, 2);
  });

  it('preserves near-duplicates with subtle differences (different target zones)', () => {
    const messages: readonly TooltipMessage[] = [
      makePlace({ astPath: 'effects[0]', targetZone: 'saigon' }),
      makePlace({ astPath: 'effects[1]', targetZone: 'hue' }),
    ];
    const result = deduplicateMessages(messages);
    assert.equal(result.length, 2);
  });

  it('returns same count when no duplicates exist', () => {
    const messages: readonly TooltipMessage[] = [
      makeSelect({ astPath: 'effects[0]' }),
      makePlace({ astPath: 'effects[1]' }),
      makeGain({ astPath: 'effects[2]' }),
      makeMove({ astPath: 'effects[3]' }),
    ];
    const result = deduplicateMessages(messages);
    assert.equal(result.length, 4);
  });

  it('returns empty array for empty input', () => {
    const result = deduplicateMessages([]);
    assert.equal(result.length, 0);
  });

  it('does not mutate the input array', () => {
    const messages: readonly TooltipMessage[] = [
      makePlace({ astPath: 'effects[0]' }),
      makePlace({ astPath: 'effects[1]' }),
      makeGain({ astPath: 'effects[2]' }),
    ];
    const copy = [...messages];
    deduplicateMessages(messages);
    assert.equal(messages.length, copy.length);
    for (let i = 0; i < messages.length; i++) {
      assert.deepEqual(messages[i], copy[i]);
    }
  });

  it('preserves first occurrence ordering', () => {
    const messages: readonly TooltipMessage[] = [
      makePlace({ astPath: 'effects[0]', tokenFilter: 'alpha' }),
      makeGain({ astPath: 'effects[1]' }),
      makePlace({ astPath: 'effects[2]', tokenFilter: 'alpha' }),
    ];
    const result = deduplicateMessages(messages);
    assert.equal(result.length, 2);
    assert.equal(result[0]!.kind, 'place');
    assert.equal(result[1]!.kind, 'gain');
  });

  it('handles mixed message kinds with duplicates among some', () => {
    const messages: readonly TooltipMessage[] = [
      makeSelect({ astPath: 'effects[0]' }),
      makeGain({ astPath: 'effects[1]' }),
      makeSelect({ astPath: 'effects[2]' }),
      makePlace({ astPath: 'effects[3]' }),
      makeGain({ astPath: 'effects[4]' }),
    ];
    const result = deduplicateMessages(messages);
    assert.equal(result.length, 3); // select, gain, place
  });
});
