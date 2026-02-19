import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

import type { CardAnimationMappingContext } from './animation-types.js';

const DEFAULT_FLIP_PROPS: readonly string[] = Object.freeze(['faceUp']);

export type CardSemanticKind = 'cardDeal' | 'cardBurn' | 'cardFlip';

export function classifyCardSemantic(
  entry: EffectTraceEntry,
  context: CardAnimationMappingContext | undefined,
): CardSemanticKind | null {
  if (context === undefined) {
    return null;
  }

  switch (entry.kind) {
    case 'moveToken': {
      if (!isCardToken(entry.tokenId, context)) {
        return null;
      }
      if (context.zoneRoles.burn.has(entry.to)) {
        return 'cardBurn';
      }
      const fromDraw = context.zoneRoles.draw.has(entry.from);
      const toHandOrShared = context.zoneRoles.hand.has(entry.to) || context.zoneRoles.shared.has(entry.to);
      if (fromDraw && toHandOrShared) {
        return 'cardDeal';
      }
      return null;
    }
    case 'setTokenProp': {
      if (!isCardToken(entry.tokenId, context)) {
        return null;
      }
      const flipProps = context.flipProps ?? DEFAULT_FLIP_PROPS;
      if (!flipProps.includes(entry.prop)) {
        return null;
      }
      if (Object.is(entry.oldValue, entry.newValue)) {
        return null;
      }
      return 'cardFlip';
    }
    default:
      return null;
  }
}

function isCardToken(tokenId: string, context: CardAnimationMappingContext): boolean {
  const tokenTypeId = context.tokenTypeByTokenId.get(tokenId);
  if (tokenTypeId === undefined) {
    return false;
  }
  return context.cardTokenTypeIds.has(tokenTypeId);
}
