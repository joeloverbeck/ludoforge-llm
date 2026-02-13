import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EventCardDef, EventDeckDef } from '../kernel/types.js';
import { normalizeIdentifier } from './compile-lowering.js';

export function lowerEventCards(
  cards: readonly EventCardDef[],
  diagnostics: Diagnostic[],
  pathPrefix: string,
): readonly EventCardDef[] {
  const idFirstIndexByNormalized = new Map<string, number>();
  const explicitOrderFirstIndex = new Map<number, number>();

  const lowered = cards.map((card, index) => {
    const cardPath = `${pathPrefix}.${index}`;
    const normalizedId = normalizeIdentifier(card.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_EVENT_CARD_ID_DUPLICATE',
        path: `${cardPath}.id`,
        severity: 'error',
        message: `Duplicate event card id "${card.id}".`,
        suggestion: 'Use unique event card ids inside one event deck.',
      });
    } else {
      idFirstIndexByNormalized.set(normalizedId, index);
    }

    if (card.order !== undefined) {
      const existingOrderIndex = explicitOrderFirstIndex.get(card.order);
      if (existingOrderIndex !== undefined) {
        diagnostics.push({
          code: 'CNL_COMPILER_EVENT_CARD_ORDER_AMBIGUOUS',
          path: `${cardPath}.order`,
          severity: 'error',
          message: `Event card order ${card.order} is declared more than once in the same event deck.`,
          suggestion: 'Use unique order values or omit order and rely on deterministic id ordering.',
        });
      } else {
        explicitOrderFirstIndex.set(card.order, index);
      }
    }

    const unshaded =
      card.unshaded === undefined
        ? undefined
        : lowerEventCardSide(card.unshaded, diagnostics, `${cardPath}.unshaded`);
    const shaded = card.shaded === undefined ? undefined : lowerEventCardSide(card.shaded, diagnostics, `${cardPath}.shaded`);

    return {
      index,
      card: {
        ...card,
        ...(unshaded === undefined ? {} : { unshaded }),
        ...(shaded === undefined ? {} : { shaded }),
      },
    };
  });

  lowered.sort((left, right) => {
    const leftOrder = left.card.order;
    const rightOrder = right.card.order;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
    } else if (leftOrder !== undefined) {
      return -1;
    } else if (rightOrder !== undefined) {
      return 1;
    }

    const byId = normalizeIdentifier(left.card.id).localeCompare(normalizeIdentifier(right.card.id));
    if (byId !== 0) {
      return byId;
    }

    return left.index - right.index;
  });

  return lowered.map((entry) => entry.card);
}

export function lowerEventDecks(
  decks: readonly EventDeckDef[],
  diagnostics: Diagnostic[],
  pathPrefix: string,
): readonly EventDeckDef[] {
  const idFirstIndexByNormalized = new Map<string, number>();
  const lowered = decks.map((deck, index) => {
    const deckPath = `${pathPrefix}.${index}`;
    const normalizedId = normalizeIdentifier(deck.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_EVENT_DECK_ID_DUPLICATE',
        path: `${deckPath}.id`,
        severity: 'error',
        message: `Duplicate event deck id "${deck.id}".`,
        suggestion: 'Use unique event deck ids within eventDecks.',
      });
    } else {
      idFirstIndexByNormalized.set(normalizedId, index);
    }

    return {
      index,
      deck: {
        ...deck,
        cards: lowerEventCards(deck.cards, diagnostics, `${deckPath}.cards`),
      },
    };
  });

  lowered.sort((left, right) => {
    const byId = normalizeIdentifier(left.deck.id).localeCompare(normalizeIdentifier(right.deck.id));
    if (byId !== 0) {
      return byId;
    }
    return left.index - right.index;
  });

  return lowered.map((entry) => entry.deck);
}

export function lowerEventCardSide(
  side: NonNullable<EventCardDef['unshaded']>,
  diagnostics: Diagnostic[],
  pathPrefix: string,
): NonNullable<EventCardDef['unshaded']> {
  if (side.branches === undefined) {
    return side;
  }

  const idFirstIndexByNormalized = new Map<string, number>();
  const explicitOrderFirstIndex = new Map<number, number>();
  const loweredBranches = side.branches.map((branch, index) => {
    const branchPath = `${pathPrefix}.branches.${index}`;
    const normalizedId = normalizeIdentifier(branch.id);
    const existingIdIndex = idFirstIndexByNormalized.get(normalizedId);
    if (existingIdIndex !== undefined) {
      diagnostics.push({
        code: 'CNL_COMPILER_EVENT_CARD_BRANCH_ID_DUPLICATE',
        path: `${branchPath}.id`,
        severity: 'error',
        message: `Duplicate event card branch id "${branch.id}" within one side.`,
        suggestion: 'Use unique branch ids inside each event card side.',
      });
    } else {
      idFirstIndexByNormalized.set(normalizedId, index);
    }

    if (branch.order !== undefined) {
      const existingOrderIndex = explicitOrderFirstIndex.get(branch.order);
      if (existingOrderIndex !== undefined) {
        diagnostics.push({
          code: 'CNL_COMPILER_EVENT_CARD_BRANCH_ORDER_AMBIGUOUS',
          path: `${branchPath}.order`,
          severity: 'error',
          message: `Event card branch order ${branch.order} is declared more than once within one side.`,
          suggestion: 'Use unique branch order values or omit order and rely on deterministic id ordering.',
        });
      } else {
        explicitOrderFirstIndex.set(branch.order, index);
      }
    }

    return {
      index,
      branch,
    };
  });

  loweredBranches.sort((left, right) => {
    const leftOrder = left.branch.order;
    const rightOrder = right.branch.order;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
    } else if (leftOrder !== undefined) {
      return -1;
    } else if (rightOrder !== undefined) {
      return 1;
    }

    const byId = normalizeIdentifier(left.branch.id).localeCompare(normalizeIdentifier(right.branch.id));
    if (byId !== 0) {
      return byId;
    }

    return left.index - right.index;
  });

  return {
    ...side,
    branches: loweredBranches.map((entry) => entry.branch),
  };
}
