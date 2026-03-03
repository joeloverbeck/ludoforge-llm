import { asTokenId, asZoneId } from '../../src/kernel/index.js';

export interface CardSeatOrderFixtureCard {
  readonly id: string;
  readonly seatOrder: readonly string[];
}

export const cardSeatOrderLifecycleZones = [
  { id: asZoneId('played:none'), owner: 'none' as const, visibility: 'public' as const, ordering: 'queue' as const },
  { id: asZoneId('lookahead:none'), owner: 'none' as const, visibility: 'public' as const, ordering: 'queue' as const },
  { id: asZoneId('leader:none'), owner: 'none' as const, visibility: 'public' as const, ordering: 'queue' as const },
];

export const makeCardSeatOrderEventDeck = (cards: readonly CardSeatOrderFixtureCard[]) => ({
  id: 'deck',
  drawZone: 'draw:none',
  discardZone: 'discard:none',
  cards: cards.map((card) => ({
    id: card.id,
    title: card.id,
    metadata: {
      seatOrder: [...card.seatOrder],
    },
  })),
});

export const makeCardSeatOrderTurnOrder = (options: {
  readonly mapping?: Readonly<Record<string, string>>;
  readonly eligibilitySeats: readonly string[];
  readonly actionClassByActionId?: Readonly<Record<string, string>>;
}) => ({
  type: 'cardDriven' as const,
  config: {
    turnFlow: {
      cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
      cardSeatOrderMetadataKey: 'seatOrder',
      ...(options.mapping === undefined ? {} : { cardSeatOrderMapping: options.mapping }),
      eligibility: { seats: [...options.eligibilitySeats], overrideWindows: [] },
      ...(options.actionClassByActionId === undefined ? {} : { actionClassByActionId: options.actionClassByActionId }),
      optionMatrix: [],
      passRewards: [],
      durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
    },
  },
});

export const makeCardSeatOrderRuntimeZones = (options: {
  readonly playedCardId: string;
  readonly lookaheadCardId?: string;
}) => ({
  'played:none': [{ id: asTokenId(`played-${options.playedCardId}`), type: 'card', props: { cardId: options.playedCardId } }],
  'lookahead:none': options.lookaheadCardId === undefined
    ? []
    : [{ id: asTokenId(`lookahead-${options.lookaheadCardId}`), type: 'card', props: { cardId: options.lookaheadCardId } }],
  'leader:none': [],
});
