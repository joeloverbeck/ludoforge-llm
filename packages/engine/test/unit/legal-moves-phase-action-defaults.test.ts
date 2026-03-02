import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalMoves,
  type ActionDef,
  type ConditionAST,
  type GameDef,
  type GameState,
  type PhaseDef,
  type VariableDef,
} from '../../src/kernel/index.js';

const gateVar: VariableDef = { name: 'gate', type: 'int', init: 1, min: 0, max: 1 };

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  phases?: readonly PhaseDef[];
  interrupts?: readonly PhaseDef[];
  globalVars?: readonly VariableDef[];
}): GameDef =>
  ({
    metadata: { id: 'phase-action-defaults-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: overrides?.globalVars ?? [gateVar],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: overrides?.phases ?? [{ id: asPhaseId('main') }],
      ...(overrides?.interrupts !== undefined ? { interrupts: overrides.interrupts } : {}),
    },
    actions: overrides?.actions ?? [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: { gate: 1 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
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

const gatePassCondition: ConditionAST = {
  op: '==',
  left: { ref: 'gvar', var: 'gate' },
  right: 1,
};

const gateFailCondition: ConditionAST = {
  op: '==',
  left: { ref: 'gvar', var: 'gate' },
  right: 0,
};

const simpleAction: ActionDef = {
  id: asActionId('doThing'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
};

describe('legal-moves phase actionDefaults.pre', () => {
  it('phase pre AND action pre both pass → move is legal', () => {
    const action: ActionDef = {
      ...simpleAction,
      pre: gatePassCondition,
    };
    const def = makeBaseDef({
      actions: [action],
      phases: [{ id: asPhaseId('main'), actionDefaults: { pre: gatePassCondition } }],
    });
    const state = makeBaseState();
    const moves = legalMoves(def, state);
    assert.ok(moves.length > 0, 'move should be legal when both phase pre and action pre pass');
  });

  it('phase pre fails → move is illegal (action pre not evaluated)', () => {
    const action: ActionDef = {
      ...simpleAction,
      pre: gatePassCondition,
    };
    const def = makeBaseDef({
      actions: [action],
      phases: [{ id: asPhaseId('main'), actionDefaults: { pre: gateFailCondition } }],
    });
    const state = makeBaseState();
    const moves = legalMoves(def, state);
    assert.equal(moves.length, 0, 'move should be illegal when phase pre fails');
  });

  it('phase pre passes, action pre fails → move is illegal', () => {
    const action: ActionDef = {
      ...simpleAction,
      pre: gateFailCondition,
    };
    const def = makeBaseDef({
      actions: [action],
      phases: [{ id: asPhaseId('main'), actionDefaults: { pre: gatePassCondition } }],
    });
    const state = makeBaseState();
    const moves = legalMoves(def, state);
    assert.equal(moves.length, 0, 'move should be illegal when action pre fails');
  });

  it('phase with no actionDefaults → behavior unchanged', () => {
    const def = makeBaseDef({
      actions: [simpleAction],
      phases: [{ id: asPhaseId('main') }],
    });
    const state = makeBaseState();
    const moves = legalMoves(def, state);
    assert.ok(moves.length > 0, 'move should be legal with no actionDefaults');
  });

  it('action with pre: null → only phase pre is evaluated', () => {
    const def = makeBaseDef({
      actions: [simpleAction],
      phases: [{ id: asPhaseId('main'), actionDefaults: { pre: gatePassCondition } }],
    });
    const state = makeBaseState();
    const moves = legalMoves(def, state);
    assert.ok(moves.length > 0, 'move should be legal when phase pre passes and action pre is null');

    const defFail = makeBaseDef({
      actions: [simpleAction],
      phases: [{ id: asPhaseId('main'), actionDefaults: { pre: gateFailCondition } }],
    });
    const movesFail = legalMoves(defFail, state);
    assert.equal(movesFail.length, 0, 'move should be illegal when phase pre fails and action pre is null');
  });

  it('phase pre in interrupt phase works correctly', () => {
    const action: ActionDef = {
      ...simpleAction,
      phase: [asPhaseId('interrupt1')],
    };
    const def = makeBaseDef({
      actions: [action],
      phases: [{ id: asPhaseId('main') }],
      interrupts: [{ id: asPhaseId('interrupt1'), actionDefaults: { pre: gatePassCondition } }],
    });
    const state = makeBaseState({ currentPhase: asPhaseId('interrupt1') });
    const moves = legalMoves(def, state);
    assert.ok(moves.length > 0, 'move should be legal in interrupt phase when phase pre passes');

    const defFail = makeBaseDef({
      actions: [action],
      phases: [{ id: asPhaseId('main') }],
      interrupts: [{ id: asPhaseId('interrupt1'), actionDefaults: { pre: gateFailCondition } }],
    });
    const movesFail = legalMoves(defFail, state);
    assert.equal(movesFail.length, 0, 'move should be illegal in interrupt phase when phase pre fails');
  });
});
