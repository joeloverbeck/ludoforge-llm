import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  type ActionDef,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
  type OperationProfileDef,
  type VariableDef,
} from '../../../src/kernel/index.js';

const resourcesVar: VariableDef = { name: 'resources', type: 'int', init: 10, min: 0, max: 100 };

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  operationProfiles?: readonly OperationProfileDef[];
  globalVars?: readonly VariableDef[];
}): GameDef =>
  ({
    metadata: { id: 'apply-move-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: overrides?.globalVars ?? [resourcesVar],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
      activePlayerOrder: 'roundRobin',
    },
    actions: overrides?.actions ?? [],
    operationProfiles: overrides?.operationProfiles,
    triggers: [],
    endConditions: [],
  }) as unknown as GameDef;

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: { resources: 10 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  markers: {},
  ...overrides,
});

/**
 * Resolution effect: conditionally deducts resources when __freeOperation is NOT true.
 *
 * Equivalent YAML:
 *   - if:
 *       when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
 *       then:
 *         - addVar: { scope: global, var: resources, delta: -3 }
 */
const conditionalCostEffect: EffectAST = {
  if: {
    when: { op: '!=', left: { ref: 'binding', name: '__freeOperation' }, right: true },
    then: [{ addVar: { scope: 'global', var: 'resources', delta: -3 } }],
  },
};

const makeOperationAction = (): ActionDef => ({
  id: asActionId('trainOp'),
  actor: 'active',
  phase: asPhaseId('main'),
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const makeOperationProfile = (resolutionEffects: readonly EffectAST[]): OperationProfileDef => ({
  id: 'trainProfile',
  actionId: asActionId('trainOp'),
  legality: {},
  cost: {},
  targeting: {},
  resolution: [
    {
      stage: 'resolve',
      effects: resolutionEffects,
    },
  ],
  partialExecution: { mode: 'allow' },
});

describe('applyMove() __freeOperation binding (KERDECSEQMOD-004)', () => {
  it('1. freeOperation: true makes __freeOperation binding resolve to true in effect context', () => {
    const action = makeOperationAction();
    const profile = makeOperationProfile([conditionalCostEffect]);
    const def = makeBaseDef({ actions: [action], operationProfiles: [profile] });
    const state = makeBaseState();

    const move: Move = {
      actionId: asActionId('trainOp'),
      params: {},
      freeOperation: true,
    };

    const result = applyMove(def, state, move);

    // When __freeOperation is true, the condition `!= true` is false,
    // so the addVar is NOT executed → resources remain at 10.
    assert.equal(result.state.globalVars['resources'], 10);
  });

  it('2. freeOperation: false (or absent) makes __freeOperation binding resolve to false', () => {
    const action = makeOperationAction();
    const profile = makeOperationProfile([conditionalCostEffect]);
    const def = makeBaseDef({ actions: [action], operationProfiles: [profile] });
    const state = makeBaseState();

    // Explicit false
    const moveFalse: Move = {
      actionId: asActionId('trainOp'),
      params: {},
      freeOperation: false,
    };
    const resultFalse = applyMove(def, state, moveFalse);
    assert.equal(resultFalse.state.globalVars['resources'], 7);

    // Absent (defaults to false)
    const moveAbsent: Move = {
      actionId: asActionId('trainOp'),
      params: {},
    };
    const resultAbsent = applyMove(def, state, moveAbsent);
    assert.equal(resultAbsent.state.globalVars['resources'], 7);
  });

  it('3. resolution effects can read __freeOperation via { ref: "binding", name: "__freeOperation" }', () => {
    // Use a setVar that stores 1 when __freeOperation is true, 0 when false,
    // proving the binding is readable in resolution effects.
    const flagVar: VariableDef = { name: 'wasFree', type: 'int', init: 0, min: 0, max: 1 };
    const setFlagEffect: EffectAST = {
      if: {
        when: { op: '==', left: { ref: 'binding', name: '__freeOperation' }, right: true },
        then: [{ setVar: { scope: 'global', var: 'wasFree', value: 1 } }],
      },
    };

    const action = makeOperationAction();
    const profile = makeOperationProfile([setFlagEffect]);
    const def = makeBaseDef({
      actions: [action],
      operationProfiles: [profile],
      globalVars: [resourcesVar, flagVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, wasFree: 0 } });

    const moveFree: Move = {
      actionId: asActionId('trainOp'),
      params: {},
      freeOperation: true,
    };
    const resultFree = applyMove(def, state, moveFree);
    assert.equal(resultFree.state.globalVars['wasFree'], 1);

    const moveNotFree: Move = {
      actionId: asActionId('trainOp'),
      params: {},
    };
    const resultNotFree = applyMove(def, state, moveNotFree);
    assert.equal(resultNotFree.state.globalVars['wasFree'], 0);
  });

  it('4. per-space cost deduction is conditionally skipped when __freeOperation is true', () => {
    const action = makeOperationAction();
    const profile = makeOperationProfile([conditionalCostEffect]);
    const def = makeBaseDef({ actions: [action], operationProfiles: [profile] });
    const state = makeBaseState({ globalVars: { resources: 10 } });

    // Non-free: resources go from 10 → 7 (deducted 3)
    const moveNonFree: Move = { actionId: asActionId('trainOp'), params: {} };
    const resultNonFree = applyMove(def, state, moveNonFree);
    assert.equal(resultNonFree.state.globalVars['resources'], 7);

    // Free: resources stay at 10 (deduction skipped)
    const moveFree: Move = { actionId: asActionId('trainOp'), params: {}, freeOperation: true };
    const resultFree = applyMove(def, state, moveFree);
    assert.equal(resultFree.state.globalVars['resources'], 10);
  });
});
