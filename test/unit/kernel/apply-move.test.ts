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
  type ActionPipelineDef,
  type VariableDef,
} from '../../../src/kernel/index.js';

const resourcesVar: VariableDef = { name: 'resources', type: 'int', init: 10, min: 0, max: 100 };

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
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
    },
    actions: overrides?.actions ?? [],
    actionPipelines: overrides?.actionPipelines,
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
  turnOrderState: { type: 'roundRobin' },
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

const makeOperationProfile = (resolutionEffects: readonly EffectAST[]): ActionPipelineDef => ({
  id: 'trainProfile',
  actionId: asActionId('trainOp'),
  legality: null,
  costValidation: null, costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'resolve',
      effects: resolutionEffects,
    },
  ],
  atomicity: 'partial',
});

describe('applyMove() __freeOperation binding (KERDECSEQMOD-004)', () => {
  it('1. freeOperation: true makes __freeOperation binding resolve to true in effect context', () => {
    const action = makeOperationAction();
    const profile = makeOperationProfile([conditionalCostEffect]);
    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
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
    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
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

  it('3. stages effects can read __freeOperation via { ref: "binding", name: "__freeOperation" }', () => {
    // Use a setVar that stores 1 when __freeOperation is true, 0 when false,
    // proving the binding is readable in stages effects.
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
      actionPipelines: [profile],
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
    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
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

/**
 * Resolution effect: conditionally checks __actionClass binding.
 *
 * Sets a flag variable to 1 when __actionClass is 'limitedOperation'.
 */
const actionClassCheckEffect: EffectAST = {
  if: {
    when: { op: '==', left: { ref: 'binding', name: '__actionClass' }, right: 'limitedOperation' },
    then: [{ setVar: { scope: 'global', var: 'isLimited', value: 1 } }],
  },
};

describe('applyMove() __actionClass binding (FITLOPEFULEFF-001)', () => {
  const isLimitedVar: VariableDef = { name: 'isLimited', type: 'int', init: 0, min: 0, max: 1 };

  it('1. move.actionClass = "limitedOperation" → bindings contain __actionClass: "limitedOperation"', () => {
    const action = makeOperationAction();
    const profile = makeOperationProfile([actionClassCheckEffect]);
    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      globalVars: [resourcesVar, isLimitedVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, isLimited: 0 } });

    const move: Move = {
      actionId: asActionId('trainOp'),
      params: {},
      actionClass: 'limitedOperation',
    };

    const result = applyMove(def, state, move);
    assert.equal(result.state.globalVars['isLimited'], 1, '__actionClass should be "limitedOperation"');
  });

  it('2. move without actionClass field → bindings contain __actionClass: "operation" (default)', () => {
    const action = makeOperationAction();
    const profile = makeOperationProfile([actionClassCheckEffect]);
    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      globalVars: [resourcesVar, isLimitedVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, isLimited: 0 } });

    const move: Move = {
      actionId: asActionId('trainOp'),
      params: {},
    };

    const result = applyMove(def, state, move);
    // Default is 'operation', not 'limitedOperation', so isLimited stays 0
    assert.equal(result.state.globalVars['isLimited'], 0, '__actionClass should default to "operation"');
  });

  it('3. move.actionClass = "operationPlusSpecialActivity" → bindings contain correct value', () => {
    const opSACheckEffect: EffectAST = {
      if: {
        when: { op: '==', left: { ref: 'binding', name: '__actionClass' }, right: 'operationPlusSpecialActivity' },
        then: [{ setVar: { scope: 'global', var: 'isLimited', value: 1 } }],
      },
    };

    const action = makeOperationAction();
    const profile = makeOperationProfile([opSACheckEffect]);
    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      globalVars: [resourcesVar, isLimitedVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, isLimited: 0 } });

    const move: Move = {
      actionId: asActionId('trainOp'),
      params: {},
      actionClass: 'operationPlusSpecialActivity',
    };

    const result = applyMove(def, state, move);
    assert.equal(result.state.globalVars['isLimited'], 1, '__actionClass should be "operationPlusSpecialActivity"');
  });

  it('4. __freeOperation binding is unchanged by actionClass addition', () => {
    const action = makeOperationAction();
    const profile = makeOperationProfile([conditionalCostEffect]);
    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();

    // Free + limitedOperation: resources unchanged (freeOperation still works)
    const moveFree: Move = {
      actionId: asActionId('trainOp'),
      params: {},
      freeOperation: true,
      actionClass: 'limitedOperation',
    };
    const resultFree = applyMove(def, state, moveFree);
    assert.equal(resultFree.state.globalVars['resources'], 10, '__freeOperation still works with actionClass set');

    // Non-free + limitedOperation: resources deducted
    const moveNonFree: Move = {
      actionId: asActionId('trainOp'),
      params: {},
      actionClass: 'limitedOperation',
    };
    const resultNonFree = applyMove(def, state, moveNonFree);
    assert.equal(resultNonFree.state.globalVars['resources'], 7, 'non-free still deducts with actionClass set');
  });
});
