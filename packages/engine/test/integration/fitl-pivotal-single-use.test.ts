import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPlayerId, initialState, legalMoves, type GameDef, type GameState } from '../../src/kernel/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const OWNED_PIVOTAL_CARD_BY_SEAT: Readonly<Record<string, string>> = {
  us: 'card-121',
  arvn: 'card-123',
  nva: 'card-122',
  vc: 'card-124',
};

const PLAYER_BY_SEAT: Readonly<Record<string, number>> = {
  us: 0,
  arvn: 1,
  nva: 2,
  vc: 3,
};

const withLookaheadCoup = (def: GameDef, state: GameState, isCoup: boolean): GameState => {
  if (state.turnOrderState.type !== 'cardDriven' || def.turnOrder?.type !== 'cardDriven') {
    return state;
  }
  const lookaheadZone = def.turnOrder.config.turnFlow.cardLifecycle.lookahead;
  const lookahead = state.zones[lookaheadZone];
  if (lookahead === undefined || lookahead.length === 0) {
    return state;
  }
  const top = lookahead[0];
  if (top === undefined) {
    return state;
  }
  return {
    ...state,
    zones: {
      ...state.zones,
      [lookaheadZone]: [
        {
          ...top,
          props: {
            ...top.props,
            isCoup,
          },
        },
        ...lookahead.slice(1),
      ],
    },
  };
};

const withEligibilityPair = (
  state: GameState,
  options: {
    readonly activeSeat: string;
    readonly firstEligible: string;
    readonly secondEligible: string;
  },
): GameState => {
  const runtime = requireCardDrivenRuntime(state);
  return {
    ...state,
    activePlayer: asPlayerId(PLAYER_BY_SEAT[options.activeSeat] ?? 0),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        eligibility: {
          us: options.activeSeat === 'us' || options.firstEligible === 'us' || options.secondEligible === 'us',
          arvn: options.activeSeat === 'arvn' || options.firstEligible === 'arvn' || options.secondEligible === 'arvn',
          nva: options.activeSeat === 'nva' || options.firstEligible === 'nva' || options.secondEligible === 'nva',
          vc: options.activeSeat === 'vc' || options.firstEligible === 'vc' || options.secondEligible === 'vc',
        },
        currentCard: {
          ...runtime.currentCard,
          firstEligible: options.firstEligible,
          secondEligible: options.secondEligible,
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
  };
};

describe('FITL pivotal single-use integration', () => {
  it('compiles pivotal card-state gating and pivotalEvent wiring', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    assert.equal(
      def.globalVars.some((variable) => String(variable.name).startsWith('pivotalUsed_')),
      false,
      'Expected no pivotalUsed_* global vars under token-driven pivotal lifecycle model',
    );

    const pivotalAction = def.actions.find((action) => String(action.id) === 'pivotalEvent');
    assert.notEqual(pivotalAction, undefined, 'Expected pivotalEvent action');
    assert.deepEqual(pivotalAction?.pre, {
      op: 'or',
      args: [
        {
          op: 'and',
          args: [
            { op: '==', left: { ref: 'activePlayer' }, right: 0 },
            { op: '==', left: { ref: 'binding', name: 'eventCardId' }, right: 'card-121' },
            {
              op: '>',
              left: {
                aggregate: {
                  op: 'count',
                  query: {
                    query: 'tokensInZone',
                    zone: 'leader:none',
                    filter: [{ prop: 'cardId', op: 'eq', value: 'card-121' }],
                  },
                },
              },
              right: 0,
            },
          ],
        },
        {
          op: 'and',
          args: [
            { op: '==', left: { ref: 'activePlayer' }, right: 2 },
            { op: '==', left: { ref: 'binding', name: 'eventCardId' }, right: 'card-122' },
            {
              op: '>',
              left: {
                aggregate: {
                  op: 'count',
                  query: {
                    query: 'tokensInZone',
                    zone: 'leader:none',
                    filter: [{ prop: 'cardId', op: 'eq', value: 'card-122' }],
                  },
                },
              },
              right: 0,
            },
          ],
        },
        {
          op: 'and',
          args: [
            { op: '==', left: { ref: 'activePlayer' }, right: 1 },
            { op: '==', left: { ref: 'binding', name: 'eventCardId' }, right: 'card-123' },
            {
              op: '>',
              left: {
                aggregate: {
                  op: 'count',
                  query: {
                    query: 'tokensInZone',
                    zone: 'leader:none',
                    filter: [{ prop: 'cardId', op: 'eq', value: 'card-123' }],
                  },
                },
              },
              right: 0,
            },
          ],
        },
        {
          op: 'and',
          args: [
            { op: '==', left: { ref: 'activePlayer' }, right: 3 },
            { op: '==', left: { ref: 'binding', name: 'eventCardId' }, right: 'card-124' },
            {
              op: '>',
              left: {
                aggregate: {
                  op: 'count',
                  query: {
                    query: 'tokensInZone',
                    zone: 'leader:none',
                    filter: [{ prop: 'cardId', op: 'eq', value: 'card-124' }],
                  },
                },
              },
              right: 0,
            },
          ],
        },
      ],
    });
    assert.deepEqual(pivotalAction?.effects, [
      {
        if: {
          when: { op: '==', left: { ref: 'binding', name: 'eventCardId' }, right: 'card-121' },
          then: [
            {
              forEach: {
                bind: '$pivotalCard',
                over: {
                  query: 'tokensInZone',
                  zone: 'leader:none',
                  filter: [{ prop: 'cardId', op: 'eq', value: 'card-121' }],
                },
                limit: 1,
                effects: [{ moveToken: { token: '$pivotalCard', from: 'leader:none', to: 'played:none' } }],
              },
            },
          ],
        },
      },
      {
        if: {
          when: { op: '==', left: { ref: 'binding', name: 'eventCardId' }, right: 'card-122' },
          then: [
            {
              forEach: {
                bind: '$pivotalCard',
                over: {
                  query: 'tokensInZone',
                  zone: 'leader:none',
                  filter: [{ prop: 'cardId', op: 'eq', value: 'card-122' }],
                },
                limit: 1,
                effects: [{ moveToken: { token: '$pivotalCard', from: 'leader:none', to: 'played:none' } }],
              },
            },
          ],
        },
      },
      {
        if: {
          when: { op: '==', left: { ref: 'binding', name: 'eventCardId' }, right: 'card-123' },
          then: [
            {
              forEach: {
                bind: '$pivotalCard',
                over: {
                  query: 'tokensInZone',
                  zone: 'leader:none',
                  filter: [{ prop: 'cardId', op: 'eq', value: 'card-123' }],
                },
                limit: 1,
                effects: [{ moveToken: { token: '$pivotalCard', from: 'leader:none', to: 'played:none' } }],
              },
            },
          ],
        },
      },
      {
        if: {
          when: { op: '==', left: { ref: 'binding', name: 'eventCardId' }, right: 'card-124' },
          then: [
            {
              forEach: {
                bind: '$pivotalCard',
                over: {
                  query: 'tokensInZone',
                  zone: 'leader:none',
                  filter: [{ prop: 'cardId', op: 'eq', value: 'card-124' }],
                },
                limit: 1,
                effects: [{ moveToken: { token: '$pivotalCard', from: 'leader:none', to: 'played:none' } }],
              },
            },
          ],
        },
      },
    ]);
  });

  it('initializes pivotal cards in leader zone for full scenario setup', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const state = initialState(compiled.gameDef!, 11, 4).state;
    const leaderCardIds = new Set((state.zones['leader:none'] ?? []).map((token) => String(token.props.cardId ?? token.id)));
    assert.equal(leaderCardIds.has('card-121'), true);
    assert.equal(leaderCardIds.has('card-122'), true);
    assert.equal(leaderCardIds.has('card-123'), true);
    assert.equal(leaderCardIds.has('card-124'), true);
  });

  it('marks used pivotal and blocks replay when pivotal window reopens', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const start = withLookaheadCoup(def, initialState(def, 11, 4).state, false);
    const preActionState = withEligibilityPair(start, {
      activeSeat: 'vc',
      firstEligible: 'us',
      secondEligible: 'vc',
    });
    const expectedCardId = OWNED_PIVOTAL_CARD_BY_SEAT.vc;
    assert.notEqual(expectedCardId, undefined);

    const openingMoves = legalMoves(def, preActionState);
    const pivotalMove = openingMoves.find(
      (move) => move.actionId === asActionId('pivotalEvent') && String(move.params.eventCardId) === expectedCardId,
    );
    assert.notEqual(pivotalMove, undefined, 'Expected pivotal move to be legal before first use');

    const afterPivotal = applyMove(def, preActionState, pivotalMove!);
    assert.equal(
      (afterPivotal.state.zones['leader:none'] ?? []).some((token) => String(token.props.cardId ?? token.id) === 'card-124'),
      false,
    );
    assert.equal(
      (afterPivotal.state.zones['played:none'] ?? []).some((token) => String(token.props.cardId ?? token.id) === 'card-124'),
      true,
    );

    const reopenedPivotalState = withEligibilityPair(afterPivotal.state, {
      activeSeat: 'vc',
      firstEligible: 'us',
      secondEligible: 'vc',
    });
    const reopenedMoves = legalMoves(def, reopenedPivotalState);
    assert.equal(
      reopenedMoves.some((move) => move.actionId === asActionId('pivotalEvent') && String(move.params.eventCardId) === 'card-124'),
      false,
    );
  });
});
