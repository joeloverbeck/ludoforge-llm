import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
} from '../../../src/kernel/branded.js';
import type { GameDef, GameState, Move } from '../../../src/kernel/types.js';
import { isMoveAllowedByTurnFlowOptionMatrix } from '../../../src/kernel/legal-moves-turn-order.js';

const makeCardDrivenDef = (overrides?: {
  actionClassByActionId?: Record<string, string>;
  optionMatrix?: Array<{ first: string; second: string[] }>;
}): GameDef =>
  ({
    metadata: { id: 'sa-test', players: { min: 4, max: 4 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', draw: 'draw:none', discard: 'discard:none' },
          eligibility: { seats: ['seat0', 'seat1', 'seat2', 'seat3'] },
          actionClassByActionId: {
            pass: 'pass',
            event: 'event',
            train: 'operation',
            advise: 'specialActivity',
            ...(overrides?.actionClassByActionId ?? {}),
          },
          optionMatrix: overrides?.optionMatrix ?? [
            { first: 'event', second: ['operation', 'operationPlusSpecialActivity'] },
            { first: 'operation', second: ['limitedOperation'] },
            { first: 'operationPlusSpecialActivity', second: ['limitedOperation', 'event'] },
          ],
          passRewards: [],
        },
      },
    },
  }) as unknown as GameDef;

const makeCardDrivenState = (overrides?: {
  nonPassCount?: number;
  firstActionClass?: 'event' | 'operation' | 'operationPlusSpecialActivity' | null;
}): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 4,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  markers: {},
  turnOrderState: {
    type: 'cardDriven',
    runtime: {
      seatOrder: ['seat0', 'seat1', 'seat2', 'seat3'],
      eligibility: { seat0: true, seat1: true, seat2: true, seat3: true },
      pendingEligibilityOverrides: [],
      currentCard: {
        firstEligible: 'seat0',
        secondEligible: 'seat1',
        actedSeats: ['seat0'],
        passedSeats: [],
        nonPassCount: overrides?.nonPassCount ?? 1,
        firstActionClass: overrides?.firstActionClass ?? null,
      },
    },
  },
});

const makeMove = (actionId: string, actionClass?: string): Move => ({
  actionId: asActionId(actionId),
  params: {},
  ...(actionClass === undefined ? {} : { actionClass }),
});

describe('specialActivity option matrix filtering (OPCLASS-002)', () => {
  it('allows specialActivity when constrained includes operationPlusSpecialActivity (2nd after event)', () => {
    const def = makeCardDrivenDef();
    const state = makeCardDrivenState({ nonPassCount: 1, firstActionClass: 'event' });
    const move = makeMove('advise');

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, move), true);
  });

  it('allows operation when constrained includes operationPlusSpecialActivity (2nd after event)', () => {
    const def = makeCardDrivenDef();
    const state = makeCardDrivenState({ nonPassCount: 1, firstActionClass: 'event' });
    const move = makeMove('train');

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, move), true);
  });

  it('excludes specialActivity when constrained is limitedOperation only (2nd after operation)', () => {
    const def = makeCardDrivenDef();
    const state = makeCardDrivenState({ nonPassCount: 1, firstActionClass: 'operation' });
    const move = makeMove('advise');

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, move), false);
  });

  it('excludes specialActivity when constrained is limitedOperation+event (2nd after Op+SA)', () => {
    const def = makeCardDrivenDef();
    const state = makeCardDrivenState({ nonPassCount: 1, firstActionClass: 'operationPlusSpecialActivity' });
    const move = makeMove('advise');

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, move), false);
  });

  it('allows operation for both operation and operationPlusSpecialActivity in constrained', () => {
    const def = makeCardDrivenDef();
    const stateAfterEvent = makeCardDrivenState({ nonPassCount: 1, firstActionClass: 'event' });
    const move = makeMove('train');

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, stateAfterEvent, move), true);
  });

  it('allows all moves when not constrained (first eligible, nonPassCount 0)', () => {
    const def = makeCardDrivenDef();
    const state = makeCardDrivenState({ nonPassCount: 0, firstActionClass: null });
    const saMove = makeMove('advise');
    const opMove = makeMove('train');

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, saMove), true);
    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, opMove), true);
  });

  it('allows operation when constrained is limitedOperation (2nd after operation)', () => {
    const def = makeCardDrivenDef();
    const state = makeCardDrivenState({ nonPassCount: 1, firstActionClass: 'operation' });
    const move = makeMove('train');

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, move), true);
  });

  it('allows operation when constrained is limitedOperation+event (2nd after Op+SA)', () => {
    const def = makeCardDrivenDef();
    const state = makeCardDrivenState({ nonPassCount: 1, firstActionClass: 'operationPlusSpecialActivity' });
    const move = makeMove('train');

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, move), true);
  });

  it('always allows pass regardless of constraints', () => {
    const def = makeCardDrivenDef();
    const state = makeCardDrivenState({ nonPassCount: 1, firstActionClass: 'operation' });
    const move = makeMove('pass');

    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, move), true);
  });
});
