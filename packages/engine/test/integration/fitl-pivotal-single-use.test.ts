import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, asActionId, asPlayerId, initialState, legalMoves, type GameDef, type GameState } from '../../src/kernel/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const OWNED_PIVOTAL_CARD_BY_SEAT: Readonly<Record<string, string>> = {
  '0': 'card-121',
  '1': 'card-123',
  '2': 'card-122',
  '3': 'card-124',
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
    activePlayer: asPlayerId(Number(options.activeSeat)),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        eligibility: {
          '0': options.activeSeat === '0' || options.firstEligible === '0' || options.secondEligible === '0',
          '1': options.activeSeat === '1' || options.firstEligible === '1' || options.secondEligible === '1',
          '2': options.activeSeat === '2' || options.firstEligible === '2' || options.secondEligible === '2',
          '3': options.activeSeat === '3' || options.firstEligible === '3' || options.secondEligible === '3',
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
      activeSeat: '3',
      firstEligible: '0',
      secondEligible: '3',
    });
    const expectedCardId = OWNED_PIVOTAL_CARD_BY_SEAT[String(preActionState.activePlayer)];
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
      activeSeat: '3',
      firstEligible: '0',
      secondEligible: '3',
    });
    const reopenedMoves = legalMoves(def, reopenedPivotalState);
    assert.equal(
      reopenedMoves.some((move) => move.actionId === asActionId('pivotalEvent') && String(move.params.eventCardId) === 'card-124'),
      false,
    );
  });
});
