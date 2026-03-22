import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';
import {
  collectNamedImportsByLocalName,
  collectCallExpressionsByIdentifier,
  isPropertyAccessOnIdentifier,
  parseTypeScriptSource,
  unwrapTypeScriptExpression,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

import {
  CARD_SEAT_ORDER_MIN_DISTINCT_SEATS,
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  enumerateLegalMoves,
  isKernelErrorCode,
  legalMoves,
  resolveMoveDecisionSequence,
  TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS,
  type ActionDef,
  type GameDef,
  type GameState,
  type ActionPipelineDef,
  type EventCardDef,
} from '../../../src/kernel/index.js';
import { initializeTurnFlowEligibilityState } from '../../../src/kernel/turn-flow-eligibility.js';
import { isMoveAllowedByTurnFlowOptionMatrix } from '../../../src/kernel/legal-moves-turn-order.js';
import {
  makeCardSeatOrderEventDeck,
  makeCardSeatOrderRuntimeZones,
  makeCardSeatOrderTurnOrder,
} from '../../helpers/card-seat-order-fixtures.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
  globalVars?: GameDef['globalVars'];
  zones?: GameDef['zones'];
}): GameDef =>
  ({
    metadata: { id: 'legal-moves-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: overrides?.globalVars ?? [],
    perPlayerVars: [],
    zones: overrides?.zones ?? [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    actions: overrides?.actions ?? [],
    actionPipelines: overrides?.actionPipelines,
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
    'city:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

type CardDrivenTurnOrderState = Extract<GameState['turnOrderState'], { type: 'cardDriven' }>;
type CardDrivenRuntime = CardDrivenTurnOrderState['runtime'];

const makeCardDrivenRuntime = (overrides?: Partial<CardDrivenRuntime>): CardDrivenRuntime => ({
  seatOrder: ['0', '1'],
  eligibility: { '0': true, '1': true },
  currentCard: {
    firstEligible: '0',
    secondEligible: '1',
    actedSeats: [],
    passedSeats: [],
    nonPassCount: 0,
    firstActionClass: null,
  },
  pendingEligibilityOverrides: [],
  ...overrides,
});

const makeCardDrivenState = (runtimeOverrides?: Partial<CardDrivenRuntime>): GameState =>
  makeBaseState({
    turnOrderState: {
      type: 'cardDriven',
      runtime: makeCardDrivenRuntime(runtimeOverrides),
    },
  });

const makeEventLegalMovesFixture = (card: EventCardDef): { def: GameDef; state: GameState; actionId: ReturnType<typeof asActionId> } => {
  const actionId = asActionId(`eventAction:${card.id}`);
  const eventAction: ActionDef = {
    id: actionId,
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
    capabilities: ['cardEvent'],
  };
  const def = {
    ...makeBaseDef({
      actions: [eventAction],
      zones: [
        { id: asZoneId('draw:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
    }),
    eventDecks: [
      {
        id: 'deck',
        drawZone: 'draw:none',
        discardZone: 'discard:none',
        cards: [card],
      },
    ],
  } as unknown as GameDef;
  const state = makeBaseState({
    zones: {
      'draw:none': [],
      'discard:none': [{ id: asTokenId(card.id), type: 'card', props: {} }],
    },
  });
  return { def, state, actionId };
};

describe('legalMoves() template moves (KERDECSEQMOD-002)', () => {
  it('enumerateLegalMoves returns classified complete moves for simple parameterless actions', () => {
    const action: ActionDef = {
      id: asActionId('simple'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const state = makeBaseState();
    const result = enumerateLegalMoves(makeBaseDef({ actions: [action] }), state);

    assert.equal(result.moves.length, 1);
    assert.deepEqual(result.moves[0]?.move, { actionId: asActionId('simple'), params: {} });
    assert.deepEqual(result.moves[0]?.viability, {
      viable: true,
      complete: true,
      move: { actionId: asActionId('simple'), params: {} },
      warnings: [],
    });
    assert.deepEqual(result.moves[0]?.trustedMove, {
      actionId: asActionId('simple'),
      params: {},
      move: { actionId: asActionId('simple'), params: {} },
      provenance: 'enumerateLegalMoves',
      sourceStateHash: state.stateHash,
    });
  });

  it('supports actions declared across multiple phases', () => {
    const action: ActionDef = {
      id: asActionId('multiPhaseAction'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('setup'), asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
    });
    const state = makeBaseState({
      currentPhase: asPhaseId('main'),
    });

    const moves = legalMoves(def, state);
    assert.equal(moves.length, 1);
    assert.equal(moves[0]?.actionId, asActionId('multiPhaseAction'));
  });

  it('1. operation with profile emits a template move with params: {}', () => {
    const action: ActionDef = {
      id: asActionId('trainOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'trainProfile',
      actionId: asActionId('trainOp'),
      legality: null,
      costValidation: null, costEffects: [],
      targeting: {},
      stages: [
        {
          stage: 'selectSpaces',
          effects: [
            {
              chooseN: {
                internalDecisionId: 'decision:$spaces',
                bind: '$spaces',
                options: { query: 'enums', values: ['saigon', 'hue', 'danang'] },
                min: 1,
                max: 10,
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();

    const moves = legalMoves(def, state);
    assert.equal(moves.length, 1);
    assert.equal(moves[0]?.actionId, asActionId('trainOp'));
    assert.deepStrictEqual(moves[0]?.params, {});
  });

  it('applies option-matrix gating to pipeline template emission for second eligible seat', () => {
    const passAction: ActionDef = {
      id: asActionId('pass'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const operationAction: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const limitedOperationAction: ActionDef = {
      id: asActionId('limitedOperation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const operationProfile: ActionPipelineDef = {
      id: 'operationProfile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({
        actions: [passAction, operationAction, limitedOperationAction],
        actionPipelines: [operationProfile],
      }),
      metadata: { id: 'legal-moves-option-matrix-pipeline', players: { min: 3, max: 3 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1', '2'] },

            windows: [],
            actionClassByActionId: {
              pass: 'pass',
              operation: 'operation',
              limitedOperation: 'limitedOperation',
            },
            optionMatrix: [{ first: 'operation', second: ['limitedOperation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      playerCount: 3,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1', '2'],
          eligibility: { '0': true, '1': true, '2': true },
          currentCard: {
            firstEligible: '1',
            secondEligible: '2',
            actedSeats: ['0'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
        },
      },
    });

    // operation-class action also gets a limitedOperation variant
    assert.deepEqual(
      legalMoves(def, state).map((move) => move.actionId),
      [asActionId('pass'), asActionId('operation'), asActionId('limitedOperation')],
    );
  });

  it('throws when card-driven active seat cannot be resolved from canonical seat ids', () => {
    const action: ActionDef = {
      id: asActionId('noop'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [action] }),
      seats: [{ id: 'us' }, { id: 'nva' }],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
        },
      },
    });

    assert.throws(() => legalMoves(def, state), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; message?: string; context?: Record<string, unknown> };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.equal(details.context?.invariant, 'turnFlow.activeSeat.unresolvable');
      assert.equal(
        details.context?.surface,
        TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.ELIGIBILITY_CHECK,
      );
      assert.equal(details.context?.activePlayer, 0);
      assert.deepEqual(details.context?.seatOrder, ['0', '1']);
      assert.match(String(details.message), /could not resolve active seat/i);
      return true;
    });
  });

  it('throws when initialization firstEligible cannot resolve from configured seat order', () => {
    const def = {
      ...makeBaseDef(),
      seats: [{ id: 'us' }, { id: 'nva' }],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['bogus-seat', 'us'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState();

    assert.throws(() => initializeTurnFlowEligibilityState(def, state), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; message?: string };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.match(String(details.message), /initializeTurnFlowEligibilityState could not resolve firstEligible/i);
      return true;
    });
  });

  it('initializes card-driven active player from mapped card seat-order metadata', () => {
    const def = {
      ...makeBaseDef(),
      seats: [{ id: 'us' }, { id: 'nva' }],
      eventDecks: [makeCardSeatOrderEventDeck([{ id: 'card-1', seatOrder: ['US', 'NVA'] }])],
      turnOrder: makeCardSeatOrderTurnOrder({
        mapping: { US: 'us', NVA: 'nva' },
        eligibilitySeats: ['nva', 'us'],
      }),
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: makeCardSeatOrderRuntimeZones({ playedCardId: 'card-1' }),
    });

    const nextState = initializeTurnFlowEligibilityState(def, state);
    assert.equal(nextState.activePlayer, asPlayerId(0));
    assert.equal(nextState.turnOrderState.type, 'cardDriven');
    assert.deepEqual(nextState.turnOrderState.runtime.seatOrder, ['us', 'nva']);
    assert.equal(nextState.turnOrderState.runtime.currentCard.firstEligible, 'us');
    assert.equal(nextState.turnOrderState.runtime.currentCard.secondEligible, 'nva');
  });

  it('throws when played card token cardId cannot resolve to event card for metadata seat-order', () => {
    const def = {
      ...makeBaseDef(),
      seats: [{ id: 'us' }, { id: 'nva' }],
      eventDecks: [makeCardSeatOrderEventDeck([{ id: 'card-1', seatOrder: ['US', 'NVA'] }])],
      turnOrder: makeCardSeatOrderTurnOrder({
        mapping: { US: 'us', NVA: 'nva' },
        eligibilitySeats: ['nva', 'us'],
      }),
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: makeCardSeatOrderRuntimeZones({ playedCardId: 'missing-card' }),
    });

    assert.throws(() => initializeTurnFlowEligibilityState(def, state), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; message?: string };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.match(String(details.message), /resolveCardSeatOrder could not resolve played cardId=missing-card/i);
      assert.match(String(details.message), /metadataKey=seatOrder/i);
      return true;
    });
  });

  it('throws when card metadata seat-order resolves duplicate seats at runtime', () => {
    const def = {
      ...makeBaseDef(),
      seats: [{ id: 'us' }, { id: 'nva' }],
      eventDecks: [makeCardSeatOrderEventDeck([{ id: 'card-1', seatOrder: ['US', 'US'] }])],
      turnOrder: makeCardSeatOrderTurnOrder({
        mapping: { US: 'us' },
        eligibilitySeats: ['nva', 'us'],
      }),
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: makeCardSeatOrderRuntimeZones({ playedCardId: 'card-1' }),
    });

    assert.throws(() => initializeTurnFlowEligibilityState(def, state), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; message?: string; context?: Record<string, unknown> };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.equal(details.context?.invariant, 'turnFlow.cardMetadataSeatOrder.shapeInvalid');
      assert.equal(details.context?.cardId, 'card-1');
      assert.equal(details.context?.metadataKey, 'seatOrder');
      assert.equal(details.context?.minDistinctSeatCount, CARD_SEAT_ORDER_MIN_DISTINCT_SEATS);
      assert.equal(details.context?.distinctSeatCount, 1);
      assert.deepEqual(details.context?.duplicates, ['us']);
      assert.match(String(details.message), /card metadata seat order shape invalid/i);
      assert.match(
        String(details.message),
        new RegExp(`minDistinctSeatCount=${CARD_SEAT_ORDER_MIN_DISTINCT_SEATS}`),
      );
      assert.match(String(details.message), /distinctSeatCount=1/i);
      assert.match(String(details.message), /duplicates=\[us\]/i);
      return true;
    });
  });

  it('throws when card metadata seat-order distinct raw values collapse to duplicate mapped seats at runtime', () => {
    const def = {
      ...makeBaseDef(),
      seats: [{ id: 'us' }, { id: 'nva' }],
      eventDecks: [makeCardSeatOrderEventDeck([{ id: 'card-1', seatOrder: ['US', 'UNITED_STATES'] }])],
      turnOrder: makeCardSeatOrderTurnOrder({
        mapping: { US: 'us', UNITED_STATES: 'us' },
        eligibilitySeats: ['nva', 'us'],
      }),
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: makeCardSeatOrderRuntimeZones({ playedCardId: 'card-1' }),
    });

    assert.throws(() => initializeTurnFlowEligibilityState(def, state), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; message?: string; context?: Record<string, unknown> };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.equal(details.context?.invariant, 'turnFlow.cardMetadataSeatOrder.shapeInvalid');
      assert.equal(details.context?.cardId, 'card-1');
      assert.equal(details.context?.metadataKey, 'seatOrder');
      assert.equal(details.context?.minDistinctSeatCount, CARD_SEAT_ORDER_MIN_DISTINCT_SEATS);
      assert.equal(details.context?.distinctSeatCount, 1);
      assert.deepEqual(details.context?.duplicates, ['us']);
      assert.match(String(details.message), /card metadata seat order shape invalid/i);
      assert.match(
        String(details.message),
        new RegExp(`minDistinctSeatCount=${CARD_SEAT_ORDER_MIN_DISTINCT_SEATS}`),
      );
      assert.match(String(details.message), /distinctSeatCount=1/i);
      assert.match(String(details.message), /duplicates=\[us\]/i);
      return true;
    });
  });

  it('throws when card metadata seat-order resolves fewer than policy distinct seats at runtime', () => {
    const def = {
      ...makeBaseDef(),
      seats: [{ id: 'us' }, { id: 'nva' }],
      eventDecks: [makeCardSeatOrderEventDeck([{ id: 'card-1', seatOrder: ['US'] }])],
      turnOrder: makeCardSeatOrderTurnOrder({
        mapping: { US: 'us' },
        eligibilitySeats: ['nva', 'us'],
      }),
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: makeCardSeatOrderRuntimeZones({ playedCardId: 'card-1' }),
    });

    assert.throws(() => initializeTurnFlowEligibilityState(def, state), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; message?: string; context?: Record<string, unknown> };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.equal(details.context?.invariant, 'turnFlow.cardMetadataSeatOrder.shapeInvalid');
      assert.equal(details.context?.cardId, 'card-1');
      assert.equal(details.context?.metadataKey, 'seatOrder');
      assert.equal(details.context?.minDistinctSeatCount, CARD_SEAT_ORDER_MIN_DISTINCT_SEATS);
      assert.equal(details.context?.distinctSeatCount, 1);
      assert.deepEqual(details.context?.duplicates, []);
      assert.match(String(details.message), /card metadata seat order shape invalid/i);
      assert.match(
        String(details.message),
        new RegExp(`minDistinctSeatCount=${CARD_SEAT_ORDER_MIN_DISTINCT_SEATS}`),
      );
      assert.match(String(details.message), /distinctSeatCount=1/i);
      assert.match(String(details.message), /duplicates=\[\]/i);
      return true;
    });
  });

  it('rejects move.actionClass overrides that conflict with mapped class during option-matrix checks', () => {
    const passAction: ActionDef = {
      id: asActionId('pass'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const operationAction: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const limitedOperationAction: ActionDef = {
      id: asActionId('limitedOperation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({
        actions: [passAction, operationAction, limitedOperationAction],
      }),
      metadata: { id: 'legal-moves-option-matrix-class-mismatch', players: { min: 3, max: 3 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1', '2'] },

            windows: [],
            actionClassByActionId: {
              pass: 'pass',
              operation: 'operation',
              limitedOperation: 'limitedOperation',
            },
            optionMatrix: [{ first: 'operation', second: ['limitedOperation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      playerCount: 3,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1', '2'],
          eligibility: { '0': true, '1': true, '2': true },
          currentCard: {
            firstEligible: '1',
            secondEligible: '2',
            actedSeats: ['0'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
        },
      },
    });

    // Compatible override: operation → limitedOperation is allowed since operation
    // base class is compatible with limitedOperation constraint
    const compatibleMove = {
      actionId: asActionId('operation'),
      params: {},
      actionClass: 'limitedOperation',
    };
    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, compatibleMove), true);

    // Incompatible case: an unmapped action with event class is rejected since
    // event is not in the constrained set [limitedOperation]
    const incompatibleMove = {
      actionId: asActionId('unmappedAction'),
      params: {},
      actionClass: 'event',
    };
    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, incompatibleMove), false);
  });

  it('lets a ready required free-operation grant override option-matrix gating for the active seat', () => {
    const def = {
      ...makeBaseDef({
        actions: [
          {
            id: asActionId('operation'),
            actor: 'active',
            executor: 'actor',
            phase: [asPhaseId('main')],
            params: [],
            pre: null,
            cost: [],
            effects: [],
            limits: [],
          },
        ],
      }),
      metadata: { id: 'legal-moves-required-free-op-option-matrix', players: { min: 2, max: 2 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },
            windows: [],
            actionClassByActionId: {
              pass: 'pass',
              operation: 'operation',
            },
            optionMatrix: [{ first: 'event', second: ['limitedOperation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      playerCount: 2,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: null,
            actedSeats: ['0'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'event',
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'required-op',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              completionPolicy: 'required',
              postResolutionTurnFlow: 'resumeCardFlow',
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const move = {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    };

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, move), true);
  });

  it('surfaces required special-activity grants as direct free moves even without executionContext', () => {
    const def = {
      ...makeBaseDef({
        actions: [
          {
            id: asActionId('infiltrate'),
            actor: 'active',
            executor: 'actor',
            phase: [asPhaseId('main')],
            params: [],
            pre: null,
            cost: [],
            effects: [],
            limits: [],
          },
        ],
      }),
      metadata: { id: 'legal-moves-required-special-activity-grant', players: { min: 2, max: 2 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },
            windows: [],
            actionClassByActionId: {
              infiltrate: 'specialActivity',
            },
            optionMatrix: [{ first: 'event', second: ['operation'] }],
            passRewards: [],
            freeOperationActionIds: ['infiltrate'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeCardDrivenState({
      currentCard: {
        firstEligible: '0',
        secondEligible: null,
        actedSeats: ['0'],
        passedSeats: [],
        nonPassCount: 1,
        firstActionClass: 'event',
      },
      pendingFreeOperationGrants: [
        {
          grantId: 'required-infiltrate',
          seat: '0',
          operationClass: 'specialActivity',
          actionIds: ['infiltrate'],
          completionPolicy: 'required',
          postResolutionTurnFlow: 'resumeCardFlow',
          remainingUses: 1,
        },
      ],
    });

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'infiltrate');
    assert.equal(moves.some((move) => move.freeOperation === true), true);
    assert.equal(moves.some((move) => move.freeOperation !== true), false);
  });

  it('2. simple action (no profile) still emits fully-enumerated moves', () => {
    const action: ActionDef = {
      id: asActionId('simpleAction'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [
        { name: 'target', domain: { query: 'enums', values: ['a', 'b', 'c'] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const moves = legalMoves(def, state);
    assert.equal(moves.length, 3);
    const targets = moves.map((m) => m.params['target']);
    assert.deepStrictEqual(targets, ['a', 'b', 'c']);
  });

  it('normalizes declared action param options to canonical move-param values', () => {
    const action: ActionDef = {
      id: asActionId('pickTokenDeclared'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        {
          name: 'targetToken',
          domain: { query: 'tokensInZone', zone: asZoneId('board:none') },
        },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
      zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'stack' }],
    });
    const state = makeBaseState({
      zones: {
        'board:none': [{ id: asTokenId('tok-1'), type: 'piece', props: {} }],
      } as GameState['zones'],
      nextTokenOrdinal: 1,
    });

    const moves = legalMoves(def, state);
    assert.deepStrictEqual(
      moves.filter((move) => move.actionId === asActionId('pickTokenDeclared')).map((move) => move.params.targetToken),
      [asTokenId('tok-1')],
    );
  });

  it('fails fast when declared action param domain options are not move-param encodable', () => {
    const action: ActionDef = {
      id: asActionId('pickScheduleRowDeclared'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        {
          name: 'row',
          domain: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
        },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] }) as GameDef & {
      runtimeDataAssets?: unknown;
      tableContracts?: unknown;
    };
    def.runtimeDataAssets = [
      {
        id: 'tournament-standard',
        kind: 'scenario',
        payload: { blindSchedule: { levels: [{ level: 1, smallBlind: 10 }] } },
      },
    ];
    def.tableContracts = [
      {
        id: 'tournament-standard::blindSchedule.levels',
        assetId: 'tournament-standard',
        tablePath: 'blindSchedule.levels',
        fields: [
          { field: 'level', type: 'int' },
          { field: 'smallBlind', type: 'int' },
        ],
      },
    ];
    const state = makeBaseState();

    assert.throws(
      () => legalMoves(def, state),
      (error: unknown) => {
        assert.ok(isKernelErrorCode(error, 'LEGAL_MOVES_VALIDATION_FAILED'));
        const details = error as Error & { context?: Record<string, unknown> };
        assert.equal(details.context?.param, 'row');
        return true;
      },
    );
  });

  it('3. template move respects legality predicate (failing legality produces no template)', () => {
    const action: ActionDef = {
      id: asActionId('blockedOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'blockedProfile',
      actionId: asActionId('blockedOp'),
      legality: {
          op: '>=',
          left: { ref: 'gvar', var: 'resources' },
          right: 5,
        },
      costValidation: null, costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    };

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 100 }],
    });

    // Resources = 2 < 5 → legality fails → no template
    const state = makeBaseState({ globalVars: { resources: 2 } });
    const moves = legalMoves(def, state);
    assert.equal(moves.length, 0);
  });

  it('4. template move respects cost validation (failing costValidation + forbid produces no template)', () => {
    const action: ActionDef = {
      id: asActionId('costlyOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'costlyProfile',
      actionId: asActionId('costlyOp'),
      legality: null,
      costValidation: {
          op: '>=',
          left: { ref: 'gvar', var: 'resources' }, right: 3,
        },
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'atomic',
    };

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 100 }],
    });

    // Resources = 1 < 3 → cost fails, mode = forbid → no template
    const statePoor = makeBaseState({ globalVars: { resources: 1 } });
    assert.equal(legalMoves(def, statePoor).length, 0);

    // Resources = 5 >= 3 → cost passes → template emitted
    const stateRich = makeBaseState({ globalVars: { resources: 5 } });
    const moves = legalMoves(def, stateRich);
    assert.equal(moves.length, 1);
    assert.deepStrictEqual(moves[0]?.params, {});
  });

  it('5. free operations produce template moves (cost validation failure + allow mode still emits)', () => {
    const action: ActionDef = {
      id: asActionId('freeOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'freeProfile',
      actionId: asActionId('freeOp'),
      legality: null,
      costValidation: {
          op: '>=',
          left: { ref: 'gvar', var: 'resources' }, right: 3,
        },
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    };

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 100 }],
    });

    // Resources = 0 < 3 → cost fails, but mode = allow → template still emitted
    const state = makeBaseState({ globalVars: { resources: 0 } });
    const moves = legalMoves(def, state);
    assert.equal(moves.length, 1);
    assert.deepStrictEqual(moves[0]?.params, {});
  });

  it('does not enumerate required free-operation templates that have no outcome-policy-satisfying completion', () => {
    const action: ActionDef = {
      id: asActionId('freeOp'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [action], globalVars: [] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },
            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['freeOp'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            actionClassByActionId: { freeOp: 'operation' },
          },
        },
      },
    } as unknown as GameDef;

    const state = makeCardDrivenState({
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-required-outcome',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['freeOp'],
          completionPolicy: 'required',
          outcomePolicy: 'mustChangeGameplayState',
          postResolutionTurnFlow: 'resumeCardFlow',
          remainingUses: 1,
        },
      ],
    });

    assert.deepStrictEqual(legalMoves(def, state), []);
  });

  it('6. limited operations produce template moves when within limits', () => {
    const action: ActionDef = {
      id: asActionId('limitedOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [{ id: 'limitedOp::turn::0', scope: 'turn', max: 1 }],
    };

    const profile: ActionPipelineDef = {
      id: 'limitedProfile',
      actionId: asActionId('limitedOp'),
      legality: null,
      costValidation: null, costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });

    // Within limits (0 uses) → template emitted
    const stateUnused = makeBaseState();
    assert.equal(legalMoves(def, stateUnused).length, 1);

    // At limit (1 use) → no template
    const stateUsed = makeBaseState({
      actionUsage: { limitedOp: { turnCount: 1, phaseCount: 0, gameCount: 0 } },
    });
    assert.equal(legalMoves(def, stateUsed).length, 0);
  });

  it('7. mixed profiled and simple actions produce correct output', () => {
    const simpleAction: ActionDef = {
      id: asActionId('simpleAction'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [
        { name: 'target', domain: { query: 'enums', values: ['x', 'y'] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profiledAction: ActionDef = {
      id: asActionId('profiledOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'testProfile',
      actionId: asActionId('profiledOp'),
      legality: null,
      costValidation: null, costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    };

    const def = makeBaseDef({
      actions: [simpleAction, profiledAction],
      actionPipelines: [profile],
    });
    const state = makeBaseState();

    const moves = legalMoves(def, state);
    // 2 from simple (x, y) + 1 template from profiled
    assert.equal(moves.length, 3);

    const simpleMoves = moves.filter((m) => m.actionId === asActionId('simpleAction'));
    assert.equal(simpleMoves.length, 2);
    assert.ok(simpleMoves.some((m) => m.params['target'] === 'x'));
    assert.ok(simpleMoves.some((m) => m.params['target'] === 'y'));

    const templateMoves = moves.filter((m) => m.actionId === asActionId('profiledOp'));
    assert.equal(templateMoves.length, 1);
    assert.deepStrictEqual(templateMoves[0]?.params, {});
  });

  it('8. template move is a valid Move object', () => {
    const action: ActionDef = {
      id: asActionId('validOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'validProfile',
      actionId: asActionId('validOp'),
      legality: null,
      costValidation: null, costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();

    const moves = legalMoves(def, state);
    const move = moves[0];
    assert.ok(move !== undefined);
    assert.ok('actionId' in move);
    assert.ok('params' in move);
    assert.equal(typeof move.params, 'object');
    assert.equal(Object.keys(move.params).length, 0);
  });

  it('9. unsatisfiable chooseN template move is excluded', () => {
    const action: ActionDef = {
      id: asActionId('unsatChooseNOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'unsatChooseNProfile',
      actionId: asActionId('unsatChooseNOp'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseN: {
                internalDecisionId: 'decision:$spaces',
                bind: '$spaces',
                options: { query: 'enums', values: [] },
                min: 1,
                max: 1,
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const moves = legalMoves(def, makeBaseState());
    assert.equal(moves.length, 0);
  });

  it('10. unsatisfiable chooseOne template move is excluded', () => {
    const action: ActionDef = {
      id: asActionId('unsatChooseOneOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'unsatChooseOneProfile',
      actionId: asActionId('unsatChooseOneOp'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$space',
                bind: '$space',
                options: { query: 'enums', values: [] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const moves = legalMoves(def, makeBaseState());
    assert.equal(moves.length, 0);
  });

  it('11. map-aware profile legality evaluates against zone category/attributes', () => {
    const action: ActionDef = {
      id: asActionId('mapAwareOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'mapAwareProfile',
      actionId: asActionId('mapAwareOp'),
      legality: {
        op: '==',
        left: { ref: 'zoneProp', zone: 'city:none', prop: 'category' },
        right: 'city',
      },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'atomic',
    };

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      zones: [
        { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'city', attributes: { population: 2, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false } },
      ],
    });

    const moves = legalMoves(def, makeBaseState());
    assert.equal(moves.length, 1);
    assert.equal(moves[0]?.actionId, asActionId('mapAwareOp'));
  });

  it('12. profiled action with no applicable profile emits no move', () => {
    const action: ActionDef = {
      id: asActionId('strictProfileOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'strictProfile',
      actionId: asActionId('strictProfileOp'),
      applicability: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'atomic',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState({ activePlayer: asPlayerId(0) });

    const moves = legalMoves(def, state);
    assert.equal(moves.length, 0);
  });

  it('13. malformed profile legality is fatal with profile/action context', () => {
    const action: ActionDef = {
      id: asActionId('badLegalityOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'badLegalityProfile',
      actionId: asActionId('badLegalityOp'),
      legality: {
        op: '==',
        left: { ref: 'gvar', var: 'missingVar' },
        right: 1,
      },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'atomic',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();

    assert.throws(
      () => legalMoves(def, state),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /action pipeline legality evaluation failed/);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED');
        assert.equal(details.context?.actionId, asActionId('badLegalityOp'));
        assert.equal(details.context?.profileId, 'badLegalityProfile');
        assert.equal(details.context?.predicate, 'legality');
        assert.equal(details.context?.reason, 'pipelinePredicateEvaluationFailed');
        return true;
      },
    );
  });

  it('14. malformed atomic costValidation is fatal with profile/action context', () => {
    const action: ActionDef = {
      id: asActionId('badCostValidationOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'badCostValidationProfile',
      actionId: asActionId('badCostValidationOp'),
      legality: null,
      costValidation: {
        op: '==',
        left: { ref: 'gvar', var: 'missingVar' },
        right: 1,
      },
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'atomic',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();

    assert.throws(
      () => legalMoves(def, state),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /action pipeline costValidation evaluation failed/);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED');
        assert.equal(details.context?.actionId, asActionId('badCostValidationOp'));
        assert.equal(details.context?.profileId, 'badCostValidationProfile');
        assert.equal(details.context?.predicate, 'costValidation');
        assert.equal(details.context?.reason, 'pipelinePredicateEvaluationFailed');
        return true;
      },
    );
  });

  it('15. malformed decision-path expressions are fatal during template satisfiability checks', () => {
    const action: ActionDef = {
      id: asActionId('brokenDecisionPathOp'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'brokenDecisionPathProfile',
      actionId: asActionId('brokenDecisionPathOp'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              if: {
                when: { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
                then: [],
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'atomic',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();

    assert.throws(() => legalMoves(def, state));
  });

  it('16. malformed free-operation zone filters fail with typed diagnostics during template variant generation', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operationProfile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$zone',
                bind: '$zone',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: '==',
                left: { ref: 'gvar', var: 'missingVar' },
                right: 1,
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    assert.throws(
      () => legalMoves(def, state),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED');
        assert.equal(details.context?.surface, 'legalChoices');
        assert.equal(details.context?.actionId, 'operation');
        return true;
      },
    );
  });

  it('16b. defers unresolved non-$zone bindings on per-zone filter probing during template generation', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operationProfile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$targetProvince',
                bind: '$targetProvince',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({
        actions: [action],
        actionPipelines: [profile],
        zones: [
          { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
          { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
        ],
      }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: '==',
                left: { ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
                right: { ref: 'binding', name: '$targetCountry' },
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const moves = legalMoves(def, state);
    assert.equal(
      moves.some((move) => String(move.actionId) === 'operation' && move.freeOperation === true),
      true,
    );
  });

  it('16c. keeps free-operation template probing deterministic with multi-unresolved zone aliases', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operationProfile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$targetProvince',
                bind: '$targetProvince',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({
        actions: [action],
        actionPipelines: [profile],
        zones: [
          { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
          { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
        ],
      }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: 'and',
                args: [
                  {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
                    right: 'cambodia',
                  },
                  {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$supportProvince', prop: 'country' },
                    right: 'cambodia',
                  },
                ],
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const template = legalMoves(def, state).find((move) => String(move.actionId) === 'operation' && move.freeOperation === true);
    assert.ok(template);
    const sequence = resolveMoveDecisionSequence(def, state, template, { choose: () => undefined });
    assert.equal(sequence.complete, false);
    assert.deepEqual(sequence.nextDecision?.options.map((option) => option.value), ['board:cambodia']);
  });

  it('17. skips actions when actor selector resolves outside playerCount', () => {
    const action: ActionDef = {
      id: asActionId('actorOutOfRange'),
actor: { id: asPlayerId(2) },
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const moves = legalMoves(def, makeBaseState({ playerCount: 2 }));
    assert.equal(moves.length, 0);
  });

  it('18. skips actions when executor selector resolves outside playerCount', () => {
    const action: ActionDef = {
      id: asActionId('executorOutOfRange'),
actor: 'active',
executor: { id: asPlayerId(2) },
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const moves = legalMoves(def, makeBaseState({ playerCount: 2 }));
    assert.equal(moves.length, 0);
  });

  it('19. throws for invalid actor selector spec', () => {
    const action: ActionDef = {
      id: asActionId('invalidActorSelector'),
actor: '$owner' as unknown as ActionDef['actor'],
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    assert.throws(() => legalMoves(def, makeBaseState()), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; context?: Record<string, unknown>; cause?: unknown };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.equal(details.context?.surface, 'legalMoves');
      assert.equal(details.context?.selector, 'actor');
      assert.equal(String(details.context?.actionId), 'invalidActorSelector');
      assert.ok(details.cause instanceof Error);
      return true;
    });
  });

  it('20. throws for invalid executor selector spec', () => {
    const action: ActionDef = {
      id: asActionId('invalidExecutorSelector'),
actor: 'active',
executor: 'all' as unknown as ActionDef['executor'],
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    assert.throws(() => legalMoves(def, makeBaseState()), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; context?: Record<string, unknown>; cause?: unknown };
      assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
      assert.equal(details.context?.surface, 'legalMoves');
      assert.equal(details.context?.selector, 'executor');
      assert.equal(String(details.context?.actionId), 'invalidExecutorSelector');
      assert.ok(details.cause instanceof Error);
      return true;
    });
  });

  it('21. enumerates declared executor binding params and resolves executor after binding', () => {
    const action: ActionDef = {
      id: asActionId('missingExecutorBinding'),
actor: 'active',
executor: { chosen: '$owner' },
phase: [asPhaseId('main')],
      params: [{ name: '$owner', domain: { query: 'players' } }],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const moves = legalMoves(def, makeBaseState());
    assert.equal(moves.length, 2);
    assert.deepEqual(
      moves.map((move) => move.params.$owner).sort(),
      [asPlayerId(0), asPlayerId(1)],
    );
  });

  it('22. truncates templates deterministically when maxTemplates budget is reached', () => {
    const firstAction: ActionDef = {
      id: asActionId('first'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const secondAction: ActionDef = {
      id: asActionId('second'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const result = enumerateLegalMoves(makeBaseDef({ actions: [firstAction, secondAction] }), makeBaseState(), {
      budgets: { maxTemplates: 1 },
    });

    assert.deepEqual(result.moves.map(({ move }) => move.actionId), [asActionId('first')]);
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED'), true);
  });

  it('23. truncates parameter expansion deterministically when maxParamExpansions budget is reached', () => {
    const action: ActionDef = {
      id: asActionId('expand'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [
        { name: 'a', domain: { query: 'enums', values: ['x', 'y'] } },
        { name: 'b', domain: { query: 'enums', values: ['1', '2'] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const result = enumerateLegalMoves(makeBaseDef({ actions: [action] }), makeBaseState(), {
      budgets: { maxParamExpansions: 2 },
    });

    assert.deepEqual(result.moves.map(({ move }) => move), [{ actionId: asActionId('expand'), params: { a: 'x', b: '1' } }]);
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED'), true);
  });

  it('24. surfaces decision probe budget warnings through legal move diagnostics', () => {
    const action: ActionDef = {
      id: asActionId('needsDecision'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const profile: ActionPipelineDef = {
      id: 'needsDecisionProfile',
      actionId: asActionId('needsDecision'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a'] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const result = enumerateLegalMoves(makeBaseDef({ actions: [action], actionPipelines: [profile] }), makeBaseState(), {
      budgets: { maxDecisionProbeSteps: 0 },
    });

    assert.deepEqual(result.moves.map(({ move }) => move), [{ actionId: asActionId('needsDecision'), params: {} }]);
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'), true);
  });

  it('24b. preserves free-operation variants when decision satisfiability is unknown', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operationProfile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a'] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeCardDrivenState({
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-0',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['operation'],
          remainingUses: 1,
        },
      ],
    });

    const result = enumerateLegalMoves(def, state, { budgets: { maxDecisionProbeSteps: 0 } });
    assert.equal(
      result.moves.some(
        ({ move }) => String(move.actionId) === 'operation' && move.freeOperation === true,
      ),
      true,
    );
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'), true);
  });

  it('24c. excludes free-operation variants when decision sequence is unsatisfiable', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operationUnsatProfile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: [] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeCardDrivenState({
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-0',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['operation'],
          remainingUses: 1,
        },
      ],
    });

    assert.equal(
      legalMoves(def, state).some((move) => String(move.actionId) === 'operation' && move.freeOperation === true),
      false,
    );
  });

  it('24d. admits pipeline templates when decision probing hits deferrable missing bindings', () => {
    const action: ActionDef = {
      id: asActionId('pipelineDeferrableMissingBinding'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'pipelineDeferrableMissingBindingProfile',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a'] },
              },
            } as GameDef['actions'][number]['effects'][number],
            {
              if: {
                when: { op: '==', left: { ref: 'binding', name: '$missingBinding' }, right: 1 },
                then: [],
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const moves = legalMoves(makeBaseDef({ actions: [action], actionPipelines: [profile] }), makeBaseState());
    assert.equal(moves.some((move) => String(move.actionId) === String(action.id)), true);
  });

  it('24e. rethrows non-deferrable pipeline decision-probing errors', () => {
    const action: ActionDef = {
      id: asActionId('pipelineNonDeferrableError'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'pipelineNonDeferrableErrorProfile',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a'] },
              },
            } as GameDef['actions'][number]['effects'][number],
            {
              if: {
                when: { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
                then: [],
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    assert.throws(() => legalMoves(makeBaseDef({ actions: [action], actionPipelines: [profile] }), makeBaseState()));
  });

  it('24f. admits free-operation variants when decision probing hits deferrable missing bindings', () => {
    const action: ActionDef = {
      id: asActionId('freeOpDeferrableMissingBinding'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: ['a'] },
          },
        } as GameDef['actions'][number]['effects'][number],
        {
          if: {
            when: { op: '==', left: { ref: 'binding', name: '$missingBinding' }, right: 1 },
            then: [],
          },
        } as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['freeOpDeferrableMissingBinding'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeCardDrivenState({
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-deferrable',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['freeOpDeferrableMissingBinding'],
          remainingUses: 1,
        },
      ],
    });

    const moves = legalMoves(def, state);
    assert.equal(
      moves.some((move) => String(move.actionId) === 'freeOpDeferrableMissingBinding' && move.freeOperation === true),
      true,
    );
  });

  it('24g. rethrows non-deferrable free-operation decision-probing errors', () => {
    const action: ActionDef = {
      id: asActionId('freeOpNonDeferrableError'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: ['a'] },
          },
        } as GameDef['actions'][number]['effects'][number],
        {
          if: {
            when: { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
            then: [],
          },
        } as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['freeOpNonDeferrableError'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeCardDrivenState({
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-nondeferrable',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['freeOpNonDeferrableError'],
          remainingUses: 1,
        },
      ],
    });

    assert.throws(() => legalMoves(def, state));
  });

  it('25. preserves class-distinct free-operation variants for same actionId and params', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'operation', second: ['operation', 'limitedOperation'] }],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '1',
            secondEligible: '0',
            actedSeats: ['1'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-op',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              remainingUses: 1,
            },
            {
              grantId: 'grant-lim-op',
              seat: '0',
              operationClass: 'limitedOperation',
              actionIds: ['operation'],
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const firstRun = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation' && move.freeOperation === true);
    const secondRun = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation' && move.freeOperation === true);

    assert.equal(firstRun.some((move) => move.actionClass === 'operation'), true);
    assert.equal(firstRun.some((move) => move.actionClass === 'limitedOperation'), true);
    assert.deepEqual(secondRun, firstRun);
  });

  it('surfaces a later executeAsSeat direct-seeded free-operation grant when an earlier same-action grant is pipeline-inapplicable', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-as-seat-1',
      actionId: asActionId('operation'),
      applicability: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'atomic',
    };

    const def = {
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },
            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeCardDrivenState({
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-invalid-first',
          seat: '0',
          executeAsSeat: '0',
          operationClass: 'operation',
          actionIds: ['operation'],
          remainingUses: 1,
        },
        {
          grantId: 'grant-valid-second',
          seat: '0',
          executeAsSeat: '1',
          operationClass: 'operation',
          actionIds: ['operation'],
          remainingUses: 1,
        },
      ],
    });

    const freeMoves = legalMoves(def, state).filter(
      (move) => String(move.actionId) === 'operation' && move.freeOperation === true,
    );

    assert.equal(freeMoves.length, 1);
  });

  it('does not expose free-operation variants when grant and turn-flow action domains are both absent', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'operation', second: ['operation', 'limitedOperation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '1',
            secondEligible: '0',
            actedSeats: ['1'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-empty-domain',
              seat: '0',
              operationClass: 'operation',
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.equal(moves.some((move) => move.freeOperation === true), false);
  });

  it('exposes free-operation variants when grant actionIds are absent but turn-flow defaults include the action', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'operation', second: ['operation', 'limitedOperation'] }],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '1',
            secondEligible: '0',
            actedSeats: ['1'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-default-domain',
              seat: '0',
              operationClass: 'operation',
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.equal(moves.some((move) => move.freeOperation === true), true);
  });

  it('suppresses ambiguous top-ranked free-operation overlaps from legal move generation', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'operation', second: ['operation'] }],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            actionClassByActionId: { operation: 'operation' },
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-a',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              remainingUses: 1,
            },
            {
              grantId: 'grant-b',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              remainingUses: 2,
            },
          ],
        },
      },
    });

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.equal(moves.some((move) => move.freeOperation === true), false);
    assert.equal(moves.some((move) => move.freeOperation !== true), true);
  });

  it('keeps provisional free-operation variants when a later zone decision can resolve exact-zone overlap', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({
        actions: [action],
        zones: [
          { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        ],
      }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'operation', second: ['operation'] }],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            actionClassByActionId: { operation: 'operation' },
          },
        },
      },
      actionPipelines: [
        {
          id: 'operation-profile',
          actionId: action.id,
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [
            {
              effects: [
                {
                  chooseN: {
                    internalDecisionId: 'decision:$targetSpaces',
                    bind: '$targetSpaces',
                    options: { query: 'enums', values: ['board:none', 'city:none'] },
                    min: 1,
                    max: 1,
                  },
                },
              ],
            },
          ],
          atomicity: 'partial',
        },
      ],
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: { 'board:none': [], 'city:none': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-board',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: { op: '==', left: { ref: 'binding', name: '$zone' }, right: 'board:none' },
              remainingUses: 1,
            },
            {
              grantId: 'grant-city',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: { op: '==', left: { ref: 'binding', name: '$zone' }, right: 'city:none' },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.equal(moves.some((move) => move.freeOperation === true), true);
  });

  it('suppresses provisional free-operation variants when remaining decisions cannot bind the competing grant zones', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({
        actions: [action],
        zones: [
          { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        ],
      }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'operation', second: ['operation'] }],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            actionClassByActionId: { operation: 'operation' },
          },
        },
      },
      actionPipelines: [
        {
          id: 'operation-profile',
          actionId: action.id,
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [
            {
              effects: [
                {
                  chooseOne: {
                    internalDecisionId: 'decision:$mode',
                    bind: '$mode',
                    options: { query: 'enums', values: ['quiet', 'loud'] },
                  },
                },
              ],
            },
          ],
          atomicity: 'partial',
        },
      ],
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: { 'board:none': [], 'city:none': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-board',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: { op: '==', left: { ref: 'binding', name: '$zone' }, right: 'board:none' },
              remainingUses: 1,
            },
            {
              grantId: 'grant-city',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: { op: '==', left: { ref: 'binding', name: '$zone' }, right: 'city:none' },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.equal(moves.some((move) => move.freeOperation === true), false);
  });

  it('suppresses pass and non-free actions while the active seat has a required pending grant', () => {
    const passAction: ActionDef = {
      id: asActionId('pass'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [passAction, action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'operation', second: ['operation', 'limitedOperation'] }],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            actionClassByActionId: { pass: 'pass', operation: 'operation' },
          },
        },
      },
    } as unknown as GameDef;

    const state = makeCardDrivenState({
      currentCard: {
        firstEligible: '0',
        secondEligible: '1',
        actedSeats: [],
        passedSeats: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-required',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['operation'],
          completionPolicy: 'required',
          postResolutionTurnFlow: 'resumeCardFlow',
          remainingUses: 1,
        },
      ],
    });

    const moves = legalMoves(def, state);
    assert.equal(moves.some((move) => String(move.actionId) === 'pass'), false);
    assert.equal(moves.some((move) => String(move.actionId) === 'operation' && move.freeOperation === true), true);
    assert.equal(moves.some((move) => String(move.actionId) === 'operation' && move.freeOperation !== true), false);
  });

  it('restores regular non-free moves to the next normal seat after a required free operation resolves', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            actionClassByActionId: { operation: 'operation' },
          },
        },
      },
    } as unknown as GameDef;

    const start = makeCardDrivenState({
      currentCard: {
        firstEligible: '0',
        secondEligible: null,
        actedSeats: [],
        passedSeats: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-required',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['operation'],
          completionPolicy: 'required',
          postResolutionTurnFlow: 'resumeCardFlow',
          remainingUses: 1,
        },
      ],
    });

    const afterFreeOperation = applyMove(def, start, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    }).state;

    const moves = legalMoves(def, afterFreeOperation).filter((move) => String(move.actionId) === 'operation');
    assert.equal(afterFreeOperation.activePlayer, asPlayerId(1));
    assert.equal(moves.some((move) => move.freeOperation === true), false);
    assert.equal(moves.some((move) => move.freeOperation !== true), true);
  });

  it('surfaces only executionContext-scoped free moves during a required grant window', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [{ name: 'target', domain: { query: 'intsInRange', min: 1, max: 2 } }],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-with-grant-context',
      actionId: asActionId('operation'),
      legality: {
        op: 'in',
        item: { ref: 'binding', name: 'target' },
        set: { ref: 'grantContext', key: 'allowedTargets' },
      },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'atomic',
    };

    const def = {
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'event', second: ['operation'] }],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            actionClassByActionId: { operation: 'operation' },
          },
        },
      },
    } as unknown as GameDef;

    const state = makeCardDrivenState({
      currentCard: {
        firstEligible: '0',
        secondEligible: null,
        actedSeats: ['0'],
        passedSeats: [],
        nonPassCount: 1,
        firstActionClass: 'event',
      },
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-context',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['operation'],
          completionPolicy: 'required',
          postResolutionTurnFlow: 'resumeCardFlow',
          executionContext: { allowedTargets: [2] },
          remainingUses: 1,
        },
      ],
    });

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.deepEqual(moves, [
      {
        actionId: asActionId('operation'),
        params: { target: 2 },
        freeOperation: true,
        actionClass: 'operation',
      },
    ]);
  });

  it('keeps staged pending grants locked to the current ready pipeline step', () => {
    const airLift: ActionDef = {
      id: asActionId('airLift'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const sweep: ActionDef = {
      id: asActionId('sweep'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const emptyPipeline = (id: string, actionId: ReturnType<typeof asActionId>): ActionPipelineDef => ({
      id,
      actionId,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    });

    const def = {
      ...makeBaseDef({
        actions: [airLift, sweep],
        actionPipelines: [
          emptyPipeline('airlift-profile', asActionId('airLift')),
          emptyPipeline('sweep-profile', asActionId('sweep')),
        ],
      }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'event', second: ['operation'] }],
            passRewards: [],
            freeOperationActionIds: ['airLift', 'sweep'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            actionClassByActionId: { airLift: 'operation', sweep: 'operation' },
          },
        },
      },
    } as unknown as GameDef;

    const start = makeCardDrivenState({
      currentCard: {
        firstEligible: '0',
        secondEligible: null,
        actedSeats: ['0'],
        passedSeats: [],
        nonPassCount: 1,
        firstActionClass: 'event',
      },
      pendingFreeOperationGrants: [
        {
          grantId: 'grant-airlift',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['airLift'],
          completionPolicy: 'required',
          sequenceBatchId: 'chain',
          sequenceIndex: 0,
          remainingUses: 1,
        },
        {
          grantId: 'grant-sweep',
          seat: '0',
          operationClass: 'operation',
          actionIds: ['sweep'],
          completionPolicy: 'required',
          postResolutionTurnFlow: 'resumeCardFlow',
          sequenceBatchId: 'chain',
          sequenceIndex: 1,
          remainingUses: 1,
        },
      ],
    });

    const firstMoves = legalMoves(def, start);
    assert.equal(
      firstMoves.some((move) => String(move.actionId) === 'airLift' && move.freeOperation === true),
      true,
    );
    assert.equal(
      firstMoves.some((move) => String(move.actionId) === 'sweep' && move.freeOperation === true),
      false,
    );

    const afterAirLift = applyMove(def, start, {
      actionId: asActionId('airLift'),
      params: {},
      freeOperation: true,
    }).state;

    const secondMoves = legalMoves(def, afterAirLift);
    assert.equal(
      secondMoves.some((move) => String(move.actionId) === 'airLift' && move.freeOperation === true),
      false,
    );
    assert.equal(
      secondMoves.some((move) => String(move.actionId) === 'sweep' && move.freeOperation === true),
      true,
    );
  });

  it('26. preserves event moves when event decision probing hits deferrable missing bindings', () => {
    const { def, state, actionId } = makeEventLegalMovesFixture({
      id: 'event-deferrable-binding',
      title: 'Deferrable event',
      sideMode: 'single',
      unshaded: {
        effects: [
          {
            if: {
              when: { op: '==', left: { ref: 'binding', name: '$missing' }, right: 1 },
              then: [],
            },
          } as GameDef['actions'][number]['effects'][number],
        ],
      },
    });

    const moves = legalMoves(def, state);
    assert.equal(moves.length, 1);
    assert.deepEqual(moves[0], {
      actionId,
      params: {
        eventCardId: 'event-deferrable-binding',
        eventDeckId: 'deck',
        side: 'unshaded',
      },
    });
  });

  it('27. preserves event moves when event decision satisfiability is unknown', () => {
    const { def, state, actionId } = makeEventLegalMovesFixture({
      id: 'event-unknown',
      title: 'Unknown event',
      sideMode: 'single',
      unshaded: {
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: ['a'] },
            },
          } as GameDef['actions'][number]['effects'][number],
        ],
      },
    });

    const result = enumerateLegalMoves(def, state, { budgets: { maxDecisionProbeSteps: 0 } });
    assert.deepEqual(result.moves.map(({ move }) => move), [
      {
        actionId,
        params: {
          eventCardId: 'event-unknown',
          eventDeckId: 'deck',
          side: 'unshaded',
        },
      },
    ]);
    assert.equal(
      result.warnings.some((warning) => warning.code === 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'),
      true,
    );
  });

  it('27a. surfaces satisfiable choiceful event moves with multiple legal completions', () => {
    const { def, state, actionId } = makeEventLegalMovesFixture({
      id: 'event-choiceful-sat',
      title: 'Choiceful satisfiable event',
      sideMode: 'single',
      unshaded: {
        effects: [
          {
            chooseN: {
              internalDecisionId: 'decision:$targets',
              bind: '$targets',
              options: { query: 'enums', values: ['a', 'b', 'c'] },
              min: 2,
              max: 2,
            },
          } as GameDef['actions'][number]['effects'][number],
        ],
      },
    });

    const moves = legalMoves(def, state);
    assert.deepEqual(moves, [
      {
        actionId,
        params: {
          eventCardId: 'event-choiceful-sat',
          eventDeckId: 'deck',
          side: 'unshaded',
        },
      },
    ]);

    const pending = resolveMoveDecisionSequence(def, state, moves[0]!, { choose: () => undefined });
    assert.equal(pending.complete, false);
    assert.equal(pending.nextDecision?.type, 'chooseN');
    assert.equal(pending.nextDecision?.min, 2);
    assert.equal(pending.nextDecision?.max, 2);
    assert.equal(pending.nextDecision?.options.length, 3);
  });

  it('28. excludes event moves when event decision sequence is unsatisfiable', () => {
    const { def, state } = makeEventLegalMovesFixture({
      id: 'event-unsat',
      title: 'Unsatisfiable event',
      sideMode: 'single',
      unshaded: {
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: [] },
            },
          } as GameDef['actions'][number]['effects'][number],
        ],
      },
    });

    assert.deepEqual(legalMoves(def, state), []);
  });

  it('29. rethrows non-deferrable event decision-sequence errors', () => {
    const { def, state } = makeEventLegalMovesFixture({
      id: 'event-nondeferrable-error',
      title: 'Non-deferrable event',
      sideMode: 'single',
      unshaded: {
        effects: [
          {
            if: {
              when: { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
              then: [],
            },
          } as GameDef['actions'][number]['effects'][number],
        ],
      },
    });

    assert.throws(() => legalMoves(def, state));
  });

  it('30. does not fall back to generic template enumeration for card-event actions', () => {
    const { def, actionId } = makeEventLegalMovesFixture({
      id: 'event-no-current-card',
      title: 'No current card',
      sideMode: 'single',
      unshaded: { effects: [] },
    });
    const state = makeBaseState({
      zones: {
        'draw:none': [],
        'discard:none': [],
      },
    });

    const moves = legalMoves(def, state);
    assert.equal(moves.some((move) => move.actionId === actionId && Object.keys(move.params).length === 0), false);
    assert.deepEqual(moves, []);
  });

  it('31. routes event/pipeline decision admission through canonical move-decision helper', () => {
    const source = readKernelSource('src/kernel/legal-moves.ts');
    const sourceFile = parseTypeScriptSource(source, 'legal-moves.ts');
    const imports = collectNamedImportsByLocalName(sourceFile, './move-decision-sequence.js');
    assert.equal(
      imports.get('isMoveDecisionSequenceAdmittedForLegalMove'),
      'isMoveDecisionSequenceAdmittedForLegalMove',
      'legal-moves.ts must import canonical legal-move decision admission helper',
    );
    assert.equal(
      imports.has('isMoveDecisionSequenceNotUnsatisfiable'),
      false,
      'legal-moves.ts must not import legacy unsatisfiable-only helper for legal-move admission',
    );
    assert.equal(
      imports.has('classifyMoveDecisionSequenceSatisfiability'),
      false,
      'event-path decision-policy must not depend on inline classify API imports',
    );
    const missingBindingImports = collectNamedImportsByLocalName(sourceFile, './missing-binding-policy.js');
    assert.equal(
      missingBindingImports.get('MISSING_BINDING_POLICY_CONTEXTS'),
      'MISSING_BINDING_POLICY_CONTEXTS',
      'legal-moves.ts must import canonical missing-binding policy context identifiers',
    );

    const helperCalls = collectCallExpressionsByIdentifier(sourceFile, 'isMoveDecisionSequenceAdmittedForLegalMove');
    assert.equal(
      helperCalls.some((call) => {
        if (call.arguments.length < 4) {
          return false;
        }
        const contextArg = unwrapTypeScriptExpression(call.arguments[3]!);
        return (
          ts.isPropertyAccessExpression(contextArg) &&
          ts.isIdentifier(contextArg.expression) &&
          contextArg.expression.text === 'MISSING_BINDING_POLICY_CONTEXTS' &&
          contextArg.name.text === 'LEGAL_MOVES_EVENT_DECISION_SEQUENCE'
        );
      }),
      true,
      'event-path admission must use canonical helper with legalMoves.eventDecisionSequence context',
    );
    assert.equal(
      helperCalls.some((call) => {
        if (call.arguments.length < 4) {
          return false;
        }
        const contextArg = unwrapTypeScriptExpression(call.arguments[3]!);
        return (
          ts.isPropertyAccessExpression(contextArg) &&
          ts.isIdentifier(contextArg.expression) &&
          contextArg.expression.text === 'MISSING_BINDING_POLICY_CONTEXTS' &&
          contextArg.name.text === 'LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE'
        );
      }),
      true,
      'pipeline-path admission must use canonical helper with legalMoves.pipelineDecisionSequence context',
    );

    const classifyCalls = collectCallExpressionsByIdentifier(sourceFile, 'classifyMoveDecisionSequenceSatisfiability');
    assert.equal(
      classifyCalls.length,
      0,
      'legal-moves.ts should not reintroduce inline classifyMoveDecisionSequenceSatisfiability admission logic',
    );

    const deferCalls = collectCallExpressionsByIdentifier(sourceFile, 'shouldDeferMissingBinding');
    assert.equal(
      deferCalls.some((call) => {
        if (call.arguments.length < 2) {
          return false;
        }
        const contextArg = unwrapTypeScriptExpression(call.arguments[1]!);
        return (
          ts.isPropertyAccessExpression(contextArg) &&
          ts.isIdentifier(contextArg.expression) &&
          contextArg.expression.text === 'MISSING_BINDING_POLICY_CONTEXTS' &&
          contextArg.name.text === 'LEGAL_MOVES_EVENT_DECISION_SEQUENCE'
        );
      }),
      false,
      'event-path should not inline shouldDeferMissingBinding policy checks',
    );

    const legacyAdmissionCalls = collectCallExpressionsByIdentifier(sourceFile, 'isMoveDecisionSequenceNotUnsatisfiable');
    assert.equal(
      legacyAdmissionCalls.length,
      0,
      'legal-moves.ts should not use legacy unsatisfiable-only helper for legal-move admission',
    );
  });
});

describe('legalMoves plain-action feasibility probe', () => {
  it('32. plain action with unsatisfiable first choice is excluded', () => {
    const action: ActionDef = {
      id: asActionId('patrol'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: [] },
          },
        } as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const moves = legalMoves(def, state, { probePlainActionFeasibility: true });
    assert.equal(moves.length, 0, 'action with empty choice domain should be filtered out');
  });

  it('33. plain action with satisfiable choices is included', () => {
    const action: ActionDef = {
      id: asActionId('patrol'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: ['loc1', 'loc2'] },
          },
        } as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const moves = legalMoves(def, state, { probePlainActionFeasibility: true });
    assert.equal(moves.length, 1, 'action with satisfiable choice domain should be included');
    assert.equal(moves[0]?.actionId, asActionId('patrol'));
  });

  it('34. probe budget exceeded classifies as unknown and keeps move', () => {
    const action: ActionDef = {
      id: asActionId('patrol'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: ['loc1'] },
          },
        } as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    const result = enumerateLegalMoves(def, state, { probePlainActionFeasibility: true, budgets: { maxDecisionProbeSteps: 0 } });
    assert.equal(result.moves.length, 1, 'when probe budget is zero, move should be kept (conservative)');
    assert.equal(result.moves[0]?.move.actionId, asActionId('patrol'));
  });

  it('35. pipeline actions are not double-probed', () => {
    const action: ActionDef = {
      id: asActionId('trainOp'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'trainProfile',
      actionId: asActionId('trainOp'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          stage: 'selectSpaces',
          effects: [
            {
              chooseN: {
                internalDecisionId: 'decision:$spaces',
                bind: '$spaces',
                options: { query: 'enums', values: ['saigon', 'hue'] },
                min: 1,
                max: 10,
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();

    const moves = legalMoves(def, state);
    assert.equal(moves.length, 1, 'pipeline action should still be emitted (probed by pipeline path only)');
    assert.equal(moves[0]?.actionId, asActionId('trainOp'));
  });

  it('36. routes plain-action decision admission through canonical helper with plainActionDecisionSequence context', () => {
    const source = readKernelSource('src/kernel/legal-moves.ts');
    const sourceFile = parseTypeScriptSource(source, 'legal-moves.ts');

    const helperCalls = collectCallExpressionsByIdentifier(sourceFile, 'isMoveDecisionSequenceAdmittedForLegalMove');
    assert.equal(
      helperCalls.some((call) => {
        if (call.arguments.length < 4) {
          return false;
        }
        const contextArg = unwrapTypeScriptExpression(call.arguments[3]!);
        return (
          ts.isPropertyAccessExpression(contextArg) &&
          ts.isIdentifier(contextArg.expression) &&
          contextArg.expression.text === 'MISSING_BINDING_POLICY_CONTEXTS' &&
          contextArg.name.text === 'LEGAL_MOVES_PLAIN_ACTION_DECISION_SEQUENCE'
        );
      }),
      true,
      'plain-action path admission must use canonical helper with legalMoves.plainActionDecisionSequence context',
    );
  });
});

describe('legalMoves seat-resolution lifecycle architecture guard', () => {
  const isIdentifierArgument = (argument: ts.Expression, identifier: string): boolean => {
    const unwrapped = unwrapTypeScriptExpression(argument);
    return ts.isIdentifier(unwrapped) && unwrapped.text === identifier;
  };

  const isPropertyAccessArgument = (argument: ts.Expression, objectName: string, propertyName: string): boolean => {
    const unwrapped = unwrapTypeScriptExpression(argument);
    return (
      ts.isPropertyAccessExpression(unwrapped) &&
      ts.isIdentifier(unwrapped.expression) &&
      unwrapped.expression.text === objectName &&
      unwrapped.name.text === propertyName
    );
  };

  const isActiveSeatSurfaceConstantArgument = (argument: ts.Expression): boolean => {
    return isPropertyAccessOnIdentifier(argument, 'TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS');
  };

  it('builds one operation-scoped seat-resolution context and threads it through turn-order stages', () => {
    const source = readKernelSource('src/kernel/legal-moves.ts');
    const sourceFile = parseTypeScriptSource(source, 'legal-moves.ts');

    const createCalls = collectCallExpressionsByIdentifier(sourceFile, 'createSeatResolutionContext');
    assert.equal(
      createCalls.some((call) =>
        call.arguments.length === 2 &&
        isIdentifierArgument(call.arguments[0]!, 'def') &&
        isPropertyAccessArgument(call.arguments[1]!, 'state', 'playerCount'),
      ),
      true,
      'legal-moves.ts must create seat-resolution context from (def, state.playerCount)',
    );

    const isActiveSeatCalls = collectCallExpressionsByIdentifier(sourceFile, 'isActiveSeatEligibleForTurnFlow');
    assert.equal(
      isActiveSeatCalls.some((call) =>
        call.arguments.length === 3 &&
        isIdentifierArgument(call.arguments[0]!, 'def') &&
        isIdentifierArgument(call.arguments[1]!, 'state') &&
        isIdentifierArgument(call.arguments[2]!, 'seatResolution'),
      ),
      true,
      'legalMoves must pass operation-scoped seatResolution to isActiveSeatEligibleForTurnFlow',
    );
  });

  it('applies monsoon restrictions after free-operation variants are expanded', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({
        actions: [action],
        zones: [
          { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
        ],
      }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            optionMatrix: [{ first: 'operation', second: ['operation'] }],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            monsoon: {
              restrictedActions: [{ actionId: 'operation' }],
            },
          },
        },
      },
    } as unknown as GameDef;

    const baseRuntime = {
      seatOrder: ['0', '1'],
      eligibility: { '0': true, '1': true },
      currentCard: {
        firstEligible: '1',
        secondEligible: '0',
        actedSeats: ['1'],
        passedSeats: [],
        nonPassCount: 1,
        firstActionClass: 'operation' as const,
      },
      pendingEligibilityOverrides: [],
    };

    const makeMonsoonState = (allowDuringMonsoon?: boolean): GameState =>
      makeBaseState({
        zones: {
          'board:none': [],
          'lookahead:none': [{ id: asTokenId('lookahead-coup'), type: 'card', props: { isCoup: true } }],
        },
        turnOrderState: {
          type: 'cardDriven',
          runtime: {
            ...baseRuntime,
            pendingFreeOperationGrants: [
              {
                grantId: allowDuringMonsoon === true ? 'grant-allow' : 'grant-blocked',
                seat: '0',
                operationClass: 'operation',
                actionIds: ['operation'],
                remainingUses: 1,
                ...(allowDuringMonsoon === undefined ? {} : { allowDuringMonsoon }),
              },
            ],
          },
        },
      });

    const blockedMoves = legalMoves(def, makeMonsoonState());
    assert.equal(
      blockedMoves.some((move) => String(move.actionId) === 'operation' && move.freeOperation === true),
      false,
      'monsoon restriction should still block generated free-operation variants without explicit grant allowance',
    );

    const allowedMoves = legalMoves(def, makeMonsoonState(true));
    assert.equal(
      allowedMoves.some((move) => String(move.actionId) === 'operation' && move.freeOperation === true),
      true,
      'grant-marked free-operation variants should remain legal during monsoon restrictions',
    );
  });

  it('keeps free-operation move creation out of legal-moves turn-order helpers', () => {
    const source = readKernelSource('src/kernel/legal-moves-turn-order.ts');
    const sourceFile = parseTypeScriptSource(source, 'legal-moves-turn-order.ts');
    const imports = collectNamedImportsByLocalName(sourceFile, './move-decision-sequence.js');
    assert.equal(
      imports.has('isMoveDecisionSequenceAdmittedForLegalMove'),
      false,
      'legal-moves-turn-order.ts must not import free-operation decision admission helpers once canonical builder owns move creation',
    );
    assert.equal(
      imports.has('isMoveDecisionSequenceNotUnsatisfiable'),
      false,
      'legal-moves-turn-order.ts must not import legacy unsatisfiable-only helper for admission',
    );
    const missingBindingImports = collectNamedImportsByLocalName(sourceFile, './missing-binding-policy.js');
    assert.equal(
      missingBindingImports.has('MISSING_BINDING_POLICY_CONTEXTS'),
      false,
      'legal-moves-turn-order.ts must not import free-operation move-creation missing-binding contexts',
    );
    const discoveryImports = collectNamedImportsByLocalName(sourceFile, './free-operation-discovery-analysis.js');
    assert.equal(
      discoveryImports.has('isFreeOperationApplicableForMove'),
      false,
      'legal-moves-turn-order.ts must not import free-operation applicability helpers for move creation',
    );
    assert.equal(
      discoveryImports.has('isFreeOperationGrantedForMove'),
      false,
      'legal-moves-turn-order.ts must not import free-operation grant helpers for move creation',
    );

    const activeSeatCalls = collectCallExpressionsByIdentifier(sourceFile, 'requireCardDrivenActiveSeat');
    assert.equal(activeSeatCalls.length >= 1, true, 'turn-order helpers should still resolve active seat at guarded boundaries');
    for (const call of activeSeatCalls) {
      assert.equal(
        call.arguments.length === 4 &&
          isIdentifierArgument(call.arguments[0]!, 'def') &&
          isIdentifierArgument(call.arguments[1]!, 'state') &&
          isActiveSeatSurfaceConstantArgument(call.arguments[2]!) &&
          isIdentifierArgument(call.arguments[3]!, 'seatResolution'),
        true,
        'requireCardDrivenActiveSeat calls in legal-moves-turn-order.ts must pass canonical surface constant and explicit seatResolution context',
      );
    }

    assert.equal(
      collectCallExpressionsByIdentifier(sourceFile, 'isFreeOperationApplicableForMove').length,
      0,
      'legal-moves-turn-order.ts must not perform free-operation applicability checks for move creation',
    );
    assert.equal(
      collectCallExpressionsByIdentifier(sourceFile, 'isFreeOperationGrantedForMove').length,
      0,
      'legal-moves-turn-order.ts must not perform free-operation grant checks for move creation',
    );
    assert.equal(
      collectCallExpressionsByIdentifier(sourceFile, 'isMoveDecisionSequenceAdmittedForLegalMove').length,
      0,
      'legal-moves-turn-order.ts must not perform free-operation decision admission for move creation',
    );

    const legacyAdmissionCalls = collectCallExpressionsByIdentifier(sourceFile, 'isMoveDecisionSequenceNotUnsatisfiable');
    assert.equal(
      legacyAdmissionCalls.length,
      0,
      'legal-moves-turn-order.ts should not use legacy unsatisfiable-only helper for admission',
    );
  });
});
