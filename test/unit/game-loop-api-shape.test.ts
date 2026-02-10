import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  dispatchTriggers,
  initialState,
  legalMoves,
  resetPhaseUsage,
  resetTurnUsage,
  terminalResult,
  type ApplyMoveResult,
  type GameDef,
  type GameState,
  type Move,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';

const gameDefStub: GameDef = {
  metadata: { id: 'stub', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
};

const gameStateStub: GameState = {
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 0n] },
  stateHash: 0n,
  actionUsage: {},
};

const moveStub: Move = {
  actionId: asActionId('pass'),
  params: {},
};

describe('game-loop API shape', () => {
  it('exports Spec 06 entrypoints that are callable', () => {
    assert.equal(typeof initialState, 'function');
    assert.equal(typeof legalMoves, 'function');
    assert.equal(typeof applyMove, 'function');
    assert.equal(typeof dispatchTriggers, 'function');
    assert.equal(typeof resetTurnUsage, 'function');
    assert.equal(typeof resetPhaseUsage, 'function');
    assert.equal(typeof terminalResult, 'function');

    assert.throws(() => initialState(gameDefStub, 1), /not implemented/i);
    assert.throws(() => legalMoves(gameDefStub, gameStateStub), /not implemented/i);
    assert.throws(() => applyMove(gameDefStub, gameStateStub, moveStub), /not implemented/i);
    assert.throws(
      () =>
        dispatchTriggers(
          gameDefStub,
          gameStateStub,
          { state: gameStateStub.rng },
          { type: 'turnStart' },
          0,
          8,
          [],
        ),
      /not implemented/i,
    );
    assert.throws(() => resetTurnUsage(gameStateStub), /not implemented/i);
    assert.throws(() => resetPhaseUsage(gameStateStub), /not implemented/i);
    assert.throws(() => terminalResult(gameDefStub, gameStateStub), /not implemented/i);
  });

  it('accepts fired and truncated trigger log entries via TriggerLogEntry union', () => {
    const entries: readonly TriggerLogEntry[] = [
      { kind: 'fired', triggerId: asTriggerId('onStart'), event: { type: 'turnStart' }, depth: 0 },
      { kind: 'truncated', event: { type: 'actionResolved', action: asActionId('pass') }, depth: 3 },
    ];

    assert.equal(entries[0]?.kind, 'fired');
    assert.equal(entries[1]?.kind, 'truncated');
  });

  it('keeps ApplyMoveResult.triggerFirings typed as TriggerLogEntry[]', () => {
    const result: ApplyMoveResult = {
      state: gameStateStub,
      triggerFirings: [{ kind: 'fired', triggerId: asTriggerId('onStart'), event: { type: 'turnStart' }, depth: 0 }],
    };

    assert.equal(result.triggerFirings.length, 1);
    assert.equal(result.triggerFirings[0]?.kind, 'fired');
  });
});
