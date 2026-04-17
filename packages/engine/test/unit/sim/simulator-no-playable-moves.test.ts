import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NoPlayableMovesAfterPreparationError } from '../../../src/agents/no-playable-move.js';
import {
  GameTraceSchema,
  SimulationStopReasonSchema,
  assertValidatedGameDef,
  asActionId,
  asPhaseId,
  type Agent,
  type SimulationStopReason,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';

const createNoLegalMovesDef = (): ValidatedGameDef =>
  assertValidatedGameDef({
    metadata: { id: 'sim-no-legal-moves', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  } as const);

const createSingleActionDef = (): ValidatedGameDef =>
  assertValidatedGameDef({
    metadata: { id: 'sim-single-action', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('step'),
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
    triggers: [],
    terminal: { conditions: [] },
  } as const);

describe('simulator no-playable-move handling', () => {
  it('returns noLegalMoves for a true zero-legal-move state', () => {
    const def = createNoLegalMovesDef();
    const idleAgent: Agent = {
      chooseMove() {
        throw new Error('should not be called when there are no legal moves');
      },
    };

    const trace = runGame(def, 17, [idleAgent, idleAgent], 5);

    assert.equal(trace.moves.length, 0);
    assert.equal(trace.result, null);
    assert.equal(trace.stopReason, 'noLegalMoves');
  });

  it('propagates NoPlayableMovesAfterPreparationError to the caller', () => {
    const def = createSingleActionDef();
    const throwingAgent: Agent = {
      chooseMove(input) {
        if (input.legalMoves[0]?.move === undefined) {
          throw new Error('expected at least one legal move');
        }
        throw new NoPlayableMovesAfterPreparationError('policy', input.legalMoves.length);
      },
    };

    assert.throws(
      () => runGame(def, 17, [throwingAgent, throwingAgent], 5),
      (error) => error instanceof NoPlayableMovesAfterPreparationError,
    );
  });

  it('rejects agentStuck in TypeScript and Zod stop-reason schemas', () => {
    // @ts-expect-error 'agentStuck' is no longer a valid SimulationStopReason.
    const invalidStopReason: SimulationStopReason = 'agentStuck';
    void invalidStopReason;

    assert.equal(SimulationStopReasonSchema.safeParse('agentStuck').success, false);
    assert.equal(GameTraceSchema.safeParse({
      gameDefId: 'sim-single-action',
      seed: 17,
      moves: [],
      finalState: {
        globalVars: {},
        perPlayerVars: {},
        zoneVars: {},
        playerCount: 2,
        zones: {},
        nextTokenOrdinal: 0,
        currentPhase: 'main',
        activePlayer: 0,
        turnCount: 0,
        rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
        stateHash: 0n,
        _runningHash: 0n,
        actionUsage: {},
        turnOrderState: { type: 'roundRobin' },
        markers: {},
      },
      result: null,
      turnsCount: 0,
      stopReason: 'agentStuck',
    }).success, false);
  });
});
