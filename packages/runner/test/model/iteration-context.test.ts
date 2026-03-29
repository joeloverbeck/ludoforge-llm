import { describe, it, expect } from 'vitest';
import type { DecisionKey } from '@ludoforge/engine/runtime';
import { parseIterationContext } from '../../src/model/iteration-context.js';
import type { PartialChoice } from '../../src/store/store-types.js';
import type { RenderZone } from '../../src/model/render-model.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

function makeChoice(decisionKey: string, name: string, value: PartialChoice['value']): PartialChoice {
  return { decisionKey: asDecisionKey(decisionKey), name, value };
}

function makeZonesMap(...entries: Array<[string, string]>): ReadonlyMap<string, RenderZone> {
  const map = new Map<string, RenderZone>();
  for (const [id, displayName] of entries) {
    map.set(id, { id, displayName } as RenderZone);
  }
  return map;
}

describe('parseIterationContext', () => {
  it('returns correct context for ::resolvedBind pattern', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:select-spaces', 'spaces', ['da-nang:none', 'hue:none', 'saigon:none']),
    ];
    const zones = makeZonesMap(['da-nang:none', 'Da Nang']);

    const result = parseIterationContext(
      asDecisionKey('decision:place-type::da-nang:none[0]'),
      choiceStack,
      zones,
    );

    expect(result).toEqual({
      iterationIndex: 0,
      iterationTotal: 3,
      currentEntityId: 'da-nang:none',
      currentEntityDisplayName: 'Da Nang',
    });
  });

  it('returns correct context for [N] suffix pattern', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:select-spaces', 'spaces', ['alpha', 'beta', 'gamma']),
    ];
    const zones = makeZonesMap(['beta', 'Beta Zone']);

    const result = parseIterationContext(
      asDecisionKey('place-type[1]'),
      choiceStack,
      zones,
    );

    expect(result).toEqual({
      iterationIndex: 1,
      iterationTotal: 3,
      currentEntityId: 'beta',
      currentEntityDisplayName: 'Beta Zone',
    });
  });

  it('returns null when decisionKey has no iteration encoding', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:simple', 'action', 'sweep'),
    ];

    const result = parseIterationContext(asDecisionKey('decision:simple'), choiceStack, new Map());

    expect(result).toBeNull();
  });

  it('returns null for templated keys without canonical iterationPath', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:select-spaces', 'spaces', ['alpha', 'beta']),
    ];

    const result = parseIterationContext(
      asDecisionKey('decision:place-type::beta'),
      choiceStack,
      new Map(),
    );

    expect(result).toBeNull();
  });

  it('returns null when choice stack has no array values', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:prev', 'action', 'train'),
      makeChoice('decision:prev2', 'target', 42),
    ];

    const result = parseIterationContext(
      asDecisionKey('decision:place-type::da-nang:none[0]'),
      choiceStack,
      new Map(),
    );

    expect(result).toBeNull();
  });

  it('returns null when resolved bind is not found in the array', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:select-spaces', 'spaces', ['hue:none', 'saigon:none']),
    ];

    const result = parseIterationContext(
      asDecisionKey('decision:place-type::da-nang:none'),
      choiceStack,
      new Map(),
    );

    expect(result).toBeNull();
  });

  it('returns null when templated iterationPath and iterated entity disagree', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:select-spaces', 'spaces', ['alpha', 'beta']),
    ];

    const result = parseIterationContext(
      asDecisionKey('decision:place-type::alpha[1]'),
      choiceStack,
      new Map(),
    );

    expect(result).toBeNull();
  });

  it('returns null when [N] index is out of bounds', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:select-spaces', 'spaces', ['alpha', 'beta']),
    ];

    const result = parseIterationContext(
      asDecisionKey('place-type[5]'),
      choiceStack,
      new Map(),
    );

    expect(result).toBeNull();
  });

  it('uses formatIdAsDisplayName fallback when zone not in map', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:select-spaces', 'spaces', ['da-nang:none']),
    ];

    const result = parseIterationContext(
      asDecisionKey('decision:place-type::da-nang:none[0]'),
      choiceStack,
      new Map(),
    );

    expect(result).not.toBeNull();
    expect(result!.currentEntityDisplayName).toBe('Da Nang');
  });

  it('searches choice stack in reverse for the most recent array', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:old', 'old-spaces', ['x', 'y']),
      makeChoice('decision:scalar', 'action', 'train'),
      makeChoice('decision:new', 'new-spaces', ['alpha', 'beta', 'gamma']),
    ];
    const zones = makeZonesMap(['beta', 'Beta']);

    const result = parseIterationContext(
      asDecisionKey('decision:place-type::beta[1]'),
      choiceStack,
      zones,
    );

    expect(result).toEqual({
      iterationIndex: 1,
      iterationTotal: 3,
      currentEntityId: 'beta',
      currentEntityDisplayName: 'Beta',
    });
  });

  it('handles [0] index correctly', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('decision:select', 'spaces', ['first', 'second']),
    ];
    const zones = makeZonesMap(['first', 'First Zone']);

    const result = parseIterationContext(
      asDecisionKey('place[0]'),
      choiceStack,
      zones,
    );

    expect(result).toEqual({
      iterationIndex: 0,
      iterationTotal: 2,
      currentEntityId: 'first',
      currentEntityDisplayName: 'First Zone',
    });
  });

  it('prefers iterationPath over first-match lookup for templated keys when values repeat', () => {
    const choiceStack: readonly PartialChoice[] = [
      makeChoice('pick-spaces', 'spaces', ['alpha', 'beta', 'alpha']),
    ];
    const zones = makeZonesMap(['alpha', 'Alpha']);

    const result = parseIterationContext(
      asDecisionKey('decision:place-type::alpha[2]'),
      choiceStack,
      zones,
    );

    expect(result).toEqual({
      iterationIndex: 2,
      iterationTotal: 3,
      currentEntityId: 'alpha',
      currentEntityDisplayName: 'Alpha',
    });
  });
});
