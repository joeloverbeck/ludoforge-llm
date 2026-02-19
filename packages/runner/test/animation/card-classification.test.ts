import type { EffectTraceEntry } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import { classifyCardSemantic } from '../../src/animation/card-classification';

const CARD_CONTEXT = {
  cardTokenTypeIds: new Set(['card']),
  tokenTypeByTokenId: new Map([
    ['tok:card', 'card'],
    ['tok:chip', 'chip'],
  ]),
  zoneRoles: {
    draw: new Set(['zone:deck']),
    hand: new Set(['zone:hand:p1']),
    shared: new Set(['zone:board']),
    burn: new Set(['zone:burn']),
    discard: new Set(['zone:discard']),
  },
} as const;

function provenance(eventContext: EffectTraceEntry['provenance']['eventContext']) {
  return {
    phase: 'main',
    eventContext,
    effectPath: 'effects.0',
  } as const;
}

describe('classifyCardSemantic', () => {
  it('classifies deal and burn moves via zone roles', () => {
    const dealEntry: EffectTraceEntry = {
      kind: 'moveToken',
      tokenId: 'tok:card',
      from: 'zone:deck',
      to: 'zone:hand:p1',
      provenance: provenance('actionEffect'),
    };
    const burnEntry: EffectTraceEntry = {
      kind: 'moveToken',
      tokenId: 'tok:card',
      from: 'zone:board',
      to: 'zone:burn',
      provenance: provenance('actionEffect'),
    };

    expect(classifyCardSemantic(dealEntry, CARD_CONTEXT)).toBe('cardDeal');
    expect(classifyCardSemantic(burnEntry, CARD_CONTEXT)).toBe('cardBurn');
  });

  it('classifies face-state prop transition as cardFlip', () => {
    const flipEntry: EffectTraceEntry = {
      kind: 'setTokenProp',
      tokenId: 'tok:card',
      prop: 'faceUp',
      oldValue: false,
      newValue: true,
      provenance: provenance('actionEffect'),
    };

    expect(classifyCardSemantic(flipEntry, CARD_CONTEXT)).toBe('cardFlip');
  });

  it('returns null when context is absent or does not qualify as a card semantic', () => {
    const genericMove: EffectTraceEntry = {
      kind: 'moveToken',
      tokenId: 'tok:chip',
      from: 'zone:deck',
      to: 'zone:hand:p1',
      provenance: provenance('actionEffect'),
    };
    const unchangedFlipProp: EffectTraceEntry = {
      kind: 'setTokenProp',
      tokenId: 'tok:card',
      prop: 'faceUp',
      oldValue: true,
      newValue: true,
      provenance: provenance('actionEffect'),
    };

    expect(classifyCardSemantic(genericMove, CARD_CONTEXT)).toBeNull();
    expect(classifyCardSemantic(genericMove, undefined)).toBeNull();
    expect(classifyCardSemantic(unchangedFlipProp, CARD_CONTEXT)).toBeNull();
  });
});
