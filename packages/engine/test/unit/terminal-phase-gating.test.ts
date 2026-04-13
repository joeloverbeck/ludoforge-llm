import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  terminalResult,
  type ConditionAST,
  type GameDef,
  type GameState,
  VictoryCheckpointSchema,
} from '../../src/kernel/index.js';

const createBaseDef = (): GameDef =>
  ({
    metadata: { id: 'terminal-phase-gating-test', players: { min: 3, max: 3 } },
    constants: {},
    globalVars: [{ name: 'done', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [
        { id: asPhaseId('coupVictory') },
        { id: asPhaseId('coupSupport') },
        { id: asPhaseId('coupRedeploy') },
      ],
    },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['us', 'nva', 'arvn'] },
          windows: [],
          actionClassByActionId: { pass: 'pass' },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const createBaseState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { done: 1 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 3,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('coupVictory'),
  activePlayer: asPlayerId(1),
  turnCount: 4,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [11n, 22n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: {
    type: 'cardDriven',
    runtime: {
      seatOrder: ['us', 'nva', 'arvn'],
      eligibility: { us: true, nva: true, arvn: true },
      currentCard: {
        firstEligible: 'us',
        secondEligible: 'nva',
        actedSeats: [],
        passedSeats: [],
        nonPassCount: 0,
        firstActionClass: null,
      },
      pendingEligibilityOverrides: [],
    },
  },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  ...overrides,
});

const whenDone: ConditionAST = { op: '>', left: { _t: 2 as const, ref: 'gvar', var: 'done' }, right: 0 };

describe('terminal phase gating', () => {
  it('skips a during-coup checkpoint when the current phase is not allowed', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [],
        checkpoints: [{ id: 'us-victory', seat: 'us', timing: 'duringCoup', phases: ['coupVictory'], when: whenDone }],
      },
    };

    assert.equal(terminalResult(def, createBaseState({ currentPhase: asPhaseId('coupSupport') })), null);
  });

  it('fires a during-coup checkpoint when the current phase is allowed', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [],
        checkpoints: [{ id: 'us-victory', seat: 'us', timing: 'duringCoup', phases: ['coupVictory'], when: whenDone }],
      },
    };

    assert.deepEqual(terminalResult(def, createBaseState({ currentPhase: asPhaseId('coupVictory') })), {
      type: 'win',
      player: asPlayerId(0),
      victory: {
        timing: 'duringCoup',
        checkpointId: 'us-victory',
        winnerSeat: 'us',
      },
    });
  });

  it('preserves ungated checkpoint behavior across phases', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [],
        checkpoints: [{ id: 'us-victory', seat: 'us', timing: 'duringCoup', when: whenDone }],
      },
    };

    assert.deepEqual(terminalResult(def, createBaseState({ currentPhase: asPhaseId('coupSupport') })), {
      type: 'win',
      player: asPlayerId(0),
      victory: {
        timing: 'duringCoup',
        checkpointId: 'us-victory',
        winnerSeat: 'us',
      },
    });
  });

  it('falls through suppressed gated checkpoints to later ungated checkpoints', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [],
        checkpoints: [
          { id: 'gated', seat: 'us', timing: 'duringCoup', phases: ['coupVictory'], when: whenDone },
          { id: 'ungated', seat: 'nva', timing: 'duringCoup', when: whenDone },
        ],
      },
    };

    assert.deepEqual(terminalResult(def, createBaseState({ currentPhase: asPhaseId('coupSupport') })), {
      type: 'win',
      player: asPlayerId(1),
      victory: {
        timing: 'duringCoup',
        checkpointId: 'ungated',
        winnerSeat: 'nva',
      },
    });
  });

  it('applies the same phase gating to final-coup checkpoints', () => {
    const def: GameDef = {
      ...createBaseDef(),
      terminal: {
        conditions: [],
        checkpoints: [{ id: 'final-ranking', seat: 'arvn', timing: 'finalCoup', phases: ['coupRedeploy'], when: whenDone }],
      },
    };

    assert.equal(terminalResult(def, createBaseState({ currentPhase: asPhaseId('coupSupport') })), null);
    assert.deepEqual(terminalResult(def, createBaseState({ currentPhase: asPhaseId('coupRedeploy') })), {
      type: 'win',
      player: asPlayerId(2),
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-ranking',
        winnerSeat: 'arvn',
      },
    });
  });

  it('accepts optional phases in the checkpoint schema while remaining strict', () => {
    assert.deepEqual(
      VictoryCheckpointSchema.parse({
        id: 'us-victory',
        seat: 'us',
        timing: 'duringCoup',
        phases: ['coupVictory'],
        when: whenDone,
      }),
      {
        id: 'us-victory',
        seat: 'us',
        timing: 'duringCoup',
        phases: ['coupVictory'],
        when: whenDone,
      },
    );
    assert.equal(
      VictoryCheckpointSchema.safeParse({
        id: 'us-victory',
        seat: 'us',
        timing: 'duringCoup',
        phases: ['coupVictory'],
        extra: true,
        when: whenDone,
      }).success,
      false,
    );
  });
});
