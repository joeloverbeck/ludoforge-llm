import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  advanceToDecisionPoint,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const createBaseDef = (): GameDef =>
  ({
    metadata: { id: 'phase-advance-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'step', type: 'int', init: 0, min: 0, max: 100 },
      { name: 'order', type: 'int', init: 0, min: 0, max: 10000 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('p1') }, { id: asPhaseId('p2') }],
      activePlayerOrder: 'roundRobin',
    },
    actions: [],
    triggers: [],
    endConditions: [],
  }) as unknown as GameDef;

const createState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { step: 0, order: 0 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('p1'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {
    pass: { turnCount: 3, phaseCount: 2, gameCount: 9 },
  },
  ...overrides,
});

describe('phase advancement', () => {
  it('advances phases in declared order', () => {
    const def = createBaseDef();
    const state = createState({ currentPhase: asPhaseId('p1') });

    const next = advancePhase(def, state);

    assert.equal(next.currentPhase, asPhaseId('p2'));
    assert.equal(next.turnCount, 0);
    assert.equal(next.activePlayer, asPlayerId(0));
  });

  it('advances from last phase to next turn and next player for roundRobin', () => {
    const def = createBaseDef();
    const state = createState({
      currentPhase: asPhaseId('p2'),
      turnCount: 4,
      activePlayer: asPlayerId(0),
    });

    const next = advancePhase(def, state);

    assert.equal(next.currentPhase, asPhaseId('p1'));
    assert.equal(next.turnCount, 5);
    assert.equal(next.activePlayer, asPlayerId(1));
  });

  it('resets phase counters on phase boundary and preserves gameCount', () => {
    const def = createBaseDef();
    const state = createState({ currentPhase: asPhaseId('p1') });

    const next = advancePhase(def, state);

    assert.deepEqual(next.actionUsage.pass, { turnCount: 3, phaseCount: 0, gameCount: 9 });
  });

  it('resets turn and phase counters on turn boundary and preserves gameCount', () => {
    const def = createBaseDef();
    const state = createState({ currentPhase: asPhaseId('p2') });

    const next = advancePhase(def, state);

    assert.deepEqual(next.actionUsage.pass, { turnCount: 0, phaseCount: 0, gameCount: 9 });
  });

  it('dispatches intra-turn lifecycle events in order: phaseExit then phaseEnter', () => {
    const def = createBaseDef();
    const orderedDef: GameDef = {
      ...def,
      triggers: [
        {
          id: asTriggerId('onP1Exit'),
          event: { type: 'phaseExit', phase: asPhaseId('p1') },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 100 } } },
          ],
        },
        {
          id: asTriggerId('onP2Enter'),
          event: { type: 'phaseEnter', phase: asPhaseId('p2') },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 10 } } },
          ],
        },
      ],
    };

    const next = advancePhase(orderedDef, createState({ currentPhase: asPhaseId('p1') }));

    assert.equal(next.globalVars.step, 2);
    assert.equal(next.globalVars.order, 120);
  });

  it('dispatches turn-boundary lifecycle order: phaseExit(last), turnEnd, turnStart, phaseEnter(first)', () => {
    const def = createBaseDef();
    const orderedDef: GameDef = {
      ...def,
      triggers: [
        {
          id: asTriggerId('onP2Exit'),
          event: { type: 'phaseExit', phase: asPhaseId('p2') },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 1000 } } },
          ],
        },
        {
          id: asTriggerId('onTurnEnd'),
          event: { type: 'turnEnd' },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 100 } } },
          ],
        },
        {
          id: asTriggerId('onTurnStart'),
          event: { type: 'turnStart' },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { op: '*', left: { ref: 'gvar', var: 'step' }, right: 10 } } },
          ],
        },
        {
          id: asTriggerId('onP1Enter'),
          event: { type: 'phaseEnter', phase: asPhaseId('p1') },
          effects: [
            { addVar: { scope: 'global', var: 'step', delta: 1 } },
            { addVar: { scope: 'global', var: 'order', delta: { ref: 'gvar', var: 'step' } } },
          ],
        },
      ],
    };

    const next = advancePhase(orderedDef, createState({ currentPhase: asPhaseId('p2') }));

    assert.equal(next.globalVars.step, 4);
    assert.equal(next.globalVars.order, 1234);
  });

  it('auto-advances empty decision points to next legal decision point', () => {
    const def = createBaseDef();
    const withAction: GameDef = {
      ...def,
      actions: [
        {
          id: asActionId('onlyInP2'),
          actor: 'active',
          phase: asPhaseId('p2'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    };

    const next = advanceToDecisionPoint(withAction, createState({ currentPhase: asPhaseId('p1') }));

    assert.equal(next.currentPhase, asPhaseId('p2'));
    assert.equal(next.turnCount, 0);
  });

  it('throws STALL_LOOP_DETECTED when bounded auto-advancement is exceeded', () => {
    const def = createBaseDef();
    const state = createState({ currentPhase: asPhaseId('p1') });

    assert.throws(() => advanceToDecisionPoint(def, state), /STALL_LOOP_DETECTED/);
  });
});
