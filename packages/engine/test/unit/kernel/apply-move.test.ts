import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  ILLEGAL_MOVE_REASONS,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  asZoneId,
  legalMoves,
  type ActionDef,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
  type ActionPipelineDef,
  type OperationCompoundStagesReplacedTraceEntry,
  type VariableDef,
} from '../../../src/kernel/index.js';

const resourcesVar: VariableDef = { name: 'resources', type: 'int', init: 10, min: 0, max: 100 };

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
  globalVars?: readonly VariableDef[];
  zones?: GameDef['zones'];
}): GameDef =>
  ({
    metadata: { id: 'apply-move-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: overrides?.globalVars ?? [resourcesVar],
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
  globalVars: { resources: 10 },
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
executor: 'actor',
phase: [asPhaseId('main')],
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

describe('applyMove() declared int-range params respect full domain membership', () => {
  it('accepts intsInRange values excluded from legalMoves by maxResults downsampling', () => {
    const action: ActionDef = {
      id: asActionId('preciseIntRange'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        {
          name: 'amount',
          domain: {
            query: 'intsInRange',
            min: 1,
            max: 10,
            step: 2,
            maxResults: 3,
          },
        },
      ],
      pre: null,
      cost: [],
      effects: [{ setVar: { scope: 'global', var: 'resources', value: { ref: 'binding', name: 'amount' } } }],
      limits: [],
    };
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ globalVars: { resources: 10 } });

    const enumerated = legalMoves(def, state)
      .filter((move) => move.actionId === asActionId('preciseIntRange'))
      .map((move) => Number(move.params.amount));
    assert.deepEqual(enumerated, [1, 3, 10]);
    assert.equal(enumerated.includes(9), false);

    const applied = applyMove(def, state, { actionId: asActionId('preciseIntRange'), params: { amount: 9 } });
    assert.equal(Number(applied.state.globalVars.resources), 9);

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('preciseIntRange'), params: { amount: 8 } }),
      (error: unknown) =>
        error instanceof Error
        && 'reason' in error
        && (error as { reason?: unknown }).reason === ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION,
    );

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('preciseIntRange'), params: { amount: 11 } }),
      (error: unknown) =>
        error instanceof Error
        && 'reason' in error
        && (error as { reason?: unknown }).reason === ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION,
    );
  });

  it('accepts intsInVarRange values excluded from legalMoves by maxResults downsampling', () => {
    const action: ActionDef = {
      id: asActionId('preciseVarRange'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        {
          name: 'amount',
          domain: {
            query: 'intsInVarRange',
            var: 'resources',
            min: 1,
            max: 10,
            step: 2,
            maxResults: 3,
          },
        },
      ],
      pre: null,
      cost: [],
      effects: [{ setVar: { scope: 'global', var: 'resources', value: { ref: 'binding', name: 'amount' } } }],
      limits: [],
    };
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ globalVars: { resources: 50 } });

    const enumerated = legalMoves(def, state)
      .filter((move) => move.actionId === asActionId('preciseVarRange'))
      .map((move) => Number(move.params.amount));
    assert.deepEqual(enumerated, [1, 3, 10]);
    assert.equal(enumerated.includes(9), false);

    const applied = applyMove(def, state, { actionId: asActionId('preciseVarRange'), params: { amount: 9 } });
    assert.equal(Number(applied.state.globalVars.resources), 9);

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('preciseVarRange'), params: { amount: 8 } }),
      (error: unknown) =>
        error instanceof Error
        && 'reason' in error
        && (error as { reason?: unknown }).reason === ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION,
    );
  });

  it('accepts intsInRange endpoints and alwaysInclude values that are outside step sequence', () => {
    const action: ActionDef = {
      id: asActionId('contractShape'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        {
          name: 'amount',
          domain: {
            query: 'intsInRange',
            min: 1,
            max: 10,
            step: 3,
            alwaysInclude: [8],
          },
        },
      ],
      pre: null,
      cost: [],
      effects: [{ setVar: { scope: 'global', var: 'resources', value: { ref: 'binding', name: 'amount' } } }],
      limits: [],
    };
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ globalVars: { resources: 10 } });

    assert.equal(Number(applyMove(def, state, { actionId: asActionId('contractShape'), params: { amount: 10 } }).state.globalVars.resources), 10);
    assert.equal(Number(applyMove(def, state, { actionId: asActionId('contractShape'), params: { amount: 8 } }).state.globalVars.resources), 8);

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('contractShape'), params: { amount: 5 } }),
      (error: unknown) =>
        error instanceof Error
        && 'reason' in error
        && (error as { reason?: unknown }).reason === ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION,
    );
  });
});

describe('applyMove() maxPhaseTransitionsPerMove replay boundary', () => {
  it('caps phase transition effects within a single move when configured', () => {
    const action: ActionDef = {
      id: asActionId('jump'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        { gotoPhaseExact: { phase: asPhaseId('street1') } },
        { gotoPhaseExact: { phase: asPhaseId('street2') } },
      ],
      limits: [],
    };
    const def = makeBaseDef({ actions: [action] }) as GameDef;
    const cappedDef: GameDef = {
      ...def,
      turnStructure: {
        phases: [
          { id: asPhaseId('main') },
          { id: asPhaseId('street1') },
          { id: asPhaseId('street2') },
        ],
      },
    };
    const state = makeBaseState({ currentPhase: asPhaseId('main') });

    const uncapped = applyMove(
      cappedDef,
      state,
      { actionId: asActionId('jump'), params: {} },
      { advanceToDecisionPoint: false },
    );
    assert.equal(uncapped.state.currentPhase, 'street2');

    const capped = applyMove(
      cappedDef,
      state,
      { actionId: asActionId('jump'), params: {} },
      { maxPhaseTransitionsPerMove: 1, advanceToDecisionPoint: false },
    );
    assert.equal(capped.state.currentPhase, 'street1');
  });

  it('rejects invalid maxPhaseTransitionsPerMove values', () => {
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
    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('noop'), params: {} }, { maxPhaseTransitionsPerMove: -1 }),
      /maxPhaseTransitionsPerMove must be a non-negative safe integer/,
    );
  });

  it('caps trigger-dispatched phase transitions under the same move budget', () => {
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
      turnStructure: {
        phases: [
          { id: asPhaseId('main') },
          { id: asPhaseId('street1') },
          { id: asPhaseId('street2') },
        ],
      },
      triggers: [
        {
          id: asTriggerId('on_noop'),
          event: { type: 'actionResolved', action: asActionId('noop') },
          effects: [
            { gotoPhaseExact: { phase: asPhaseId('street1') } },
            { gotoPhaseExact: { phase: asPhaseId('street2') } },
          ],
        },
      ],
    } as GameDef;
    const state = makeBaseState({ currentPhase: asPhaseId('main') });

    const uncapped = applyMove(
      def,
      state,
      { actionId: asActionId('noop'), params: {} },
      { advanceToDecisionPoint: false },
    );
    assert.equal(uncapped.state.currentPhase, 'street2');

    const capped = applyMove(
      def,
      state,
      { actionId: asActionId('noop'), params: {} },
      { maxPhaseTransitionsPerMove: 1, advanceToDecisionPoint: false },
    );
    assert.equal(capped.state.currentPhase, 'street1');
  });

  it('caps event-card side effects under the same move budget', () => {
    const action: ActionDef = {
      id: asActionId('event'),
      actor: 'active',
      executor: 'actor',
      capabilities: ['cardEvent'],
      phase: [asPhaseId('main')],
      params: [
        { name: 'eventCardId', domain: { query: 'enums', values: ['card-budget'] } },
        { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const def = {
      ...makeBaseDef({ actions: [action] }),
      turnStructure: {
        phases: [
          { id: asPhaseId('main') },
          { id: asPhaseId('street1') },
          { id: asPhaseId('street2') },
        ],
      },
      eventDecks: [
        {
          id: 'deck',
          drawZone: 'board:none',
          discardZone: 'city:none',
          cards: [
            {
              id: 'card-budget',
              title: 'Budget Card',
              sideMode: 'single',
              unshaded: {
                effects: [
                  { gotoPhaseExact: { phase: asPhaseId('street1') } },
                  { gotoPhaseExact: { phase: asPhaseId('street2') } },
                ],
              },
            },
          ],
        },
      ],
    } as GameDef;
    const state = makeBaseState({ currentPhase: asPhaseId('main') });
    const move: Move = {
      actionId: asActionId('event'),
      params: {
        eventCardId: 'card-budget',
        side: 'unshaded',
      },
    };

    const uncapped = applyMove(def, state, move, { advanceToDecisionPoint: false });
    assert.equal(uncapped.state.currentPhase, 'street2');

    const capped = applyMove(def, state, move, { maxPhaseTransitionsPerMove: 1, advanceToDecisionPoint: false });
    assert.equal(capped.state.currentPhase, 'street1');
  });

  it('shares budget across advancePhase and lifecycle-enter transitions', () => {
    const action: ActionDef = {
      id: asActionId('advance'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [{ advancePhase: {} }],
      limits: [],
    };
    const def = {
      ...makeBaseDef({ actions: [action] }),
      turnStructure: {
        phases: [
          { id: asPhaseId('main') },
          {
            id: asPhaseId('street1'),
            onEnter: [{ gotoPhaseExact: { phase: asPhaseId('street2') } }],
          },
          { id: asPhaseId('street2') },
        ],
      },
    } as GameDef;
    const state = makeBaseState({ currentPhase: asPhaseId('main') });

    const uncapped = applyMove(
      def,
      state,
      { actionId: asActionId('advance'), params: {} },
      { advanceToDecisionPoint: false },
    );
    assert.equal(uncapped.state.currentPhase, 'street2');

    const capped = applyMove(
      def,
      state,
      { actionId: asActionId('advance'), params: {} },
      { maxPhaseTransitionsPerMove: 1, advanceToDecisionPoint: false },
    );
    assert.equal(capped.state.currentPhase, 'street1');
  });

  it('shares budget for compound timing=before across special activity and operation', () => {
    const operation: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [{ gotoPhaseExact: { phase: asPhaseId('street2') } }],
      limits: [],
    };
    const specialActivity: ActionDef = {
      id: asActionId('special'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main'), asPhaseId('street1')],
      params: [],
      pre: null,
      cost: [],
      effects: [{ gotoPhaseExact: { phase: asPhaseId('street1') } }],
      limits: [],
    };
    const def = {
      ...makeBaseDef({ actions: [operation, specialActivity] }),
      turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('street1') }, { id: asPhaseId('street2') }] },
    } as GameDef;
    const state = makeBaseState({ currentPhase: asPhaseId('main') });
    const move: Move = {
      actionId: asActionId('operation'),
      params: {},
      compound: {
        timing: 'before',
        specialActivity: { actionId: asActionId('special'), params: {} },
      },
    };

    const capped = applyMove(def, state, move, { maxPhaseTransitionsPerMove: 1, advanceToDecisionPoint: false });
    assert.equal(capped.state.currentPhase, 'street1');
  });

  it('shares budget for compound timing=during across operation stages and special activity', () => {
    const operation: ActionDef = {
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
    const operationPipeline: ActionPipelineDef = {
      id: 'operation-pipeline',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          stage: 'resolve',
          effects: [{ gotoPhaseExact: { phase: asPhaseId('street1') } }],
        },
      ],
      atomicity: 'atomic',
    };
    const specialActivity: ActionDef = {
      id: asActionId('special'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main'), asPhaseId('street1')],
      params: [],
      pre: null,
      cost: [],
      effects: [{ gotoPhaseExact: { phase: asPhaseId('street2') } }],
      limits: [],
    };
    const def = {
      ...makeBaseDef({
        actions: [operation, specialActivity],
        actionPipelines: [operationPipeline],
      }),
      turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('street1') }, { id: asPhaseId('street2') }] },
    } as GameDef;
    const state = makeBaseState({ currentPhase: asPhaseId('main') });
    const move: Move = {
      actionId: asActionId('operation'),
      params: {},
      compound: {
        timing: 'during',
        insertAfterStage: 0,
        specialActivity: { actionId: asActionId('special'), params: {} },
      },
    };

    const capped = applyMove(def, state, move, { maxPhaseTransitionsPerMove: 1, advanceToDecisionPoint: false });
    assert.equal(capped.state.currentPhase, 'street1');
  });

  it('shares budget for compound timing=after across operation and special activity', () => {
    const operation: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [{ gotoPhaseExact: { phase: asPhaseId('street1') } }],
      limits: [],
    };
    const specialActivity: ActionDef = {
      id: asActionId('special'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main'), asPhaseId('street1')],
      params: [],
      pre: null,
      cost: [],
      effects: [{ gotoPhaseExact: { phase: asPhaseId('street2') } }],
      limits: [],
    };
    const def = {
      ...makeBaseDef({ actions: [operation, specialActivity] }),
      turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('street1') }, { id: asPhaseId('street2') }] },
    } as GameDef;
    const state = makeBaseState({ currentPhase: asPhaseId('main') });
    const move: Move = {
      actionId: asActionId('operation'),
      params: {},
      compound: {
        timing: 'after',
        specialActivity: { actionId: asActionId('special'), params: {} },
      },
    };

    const capped = applyMove(def, state, move, { maxPhaseTransitionsPerMove: 1, advanceToDecisionPoint: false });
    assert.equal(capped.state.currentPhase, 'street1');
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

describe('applyMove() map-aware pipeline evaluation', () => {
  it('evaluates zoneProp in profile legality/effects using zone category/attributes', () => {
    const mapFlagVar: VariableDef = { name: 'mapFlag', type: 'int', init: 0, min: 0, max: 1 };

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
      stages: [
        {
          stage: 'resolve',
          effects: [
            {
              if: {
                when: {
                  op: 'zonePropIncludes',
                  zone: 'city:none',
                  prop: 'terrainTags',
                  value: 'urban',
                },
                then: [{ setVar: { scope: 'global', var: 'mapFlag', value: 1 } }],
              },
            },
          ],
        },
      ],
      atomicity: 'atomic',
    };

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      globalVars: [resourcesVar, mapFlagVar],
      zones: [
        { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'city', attributes: { population: 2, econ: 0, terrainTags: ['urban'], country: 'southVietnam', coastal: false } },
      ],
    });

    const state = makeBaseState({ globalVars: { resources: 10, mapFlag: 0 } });
    const result = applyMove(def, state, { actionId: asActionId('mapAwareOp'), params: {} });
    assert.equal(result.state.globalVars['mapFlag'], 1);
  });
});

describe('applyMove() free-operation zone-filter diagnostics', () => {
  it('throws typed error for malformed free-operation zone filters during final validation', () => {
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
      ...makeBaseDef({ actions: [action], globalVars: [] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
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
      globalVars: {},
    });

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED');
        assert.equal(details.context?.surface, 'turnFlowEligibility');
        assert.equal(details.context?.actionId, 'operation');
        return true;
      },
    );
  });

  it('throws typed error with candidateZone diagnostics for per-zone free-operation zone-filter failures', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [
        {
          name: 'zone',
          domain: { query: 'zones' },
        },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = {
      ...makeBaseDef({
        actions: [action],
        globalVars: [],
        zones: [
          { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set' },
        ],
      }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      zones: { 'board:cambodia': [] },
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
      globalVars: {},
    });

    assert.throws(
      () =>
        applyMove(def, state, {
          actionId: asActionId('operation'),
          params: { zone: 'board:cambodia' },
          freeOperation: true,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED');
        assert.equal(details.context?.surface, 'turnFlowEligibility');
        assert.equal(details.context?.actionId, 'operation');
        assert.equal(details.context?.candidateZone, 'board:cambodia');
        assert.deepEqual(details.context?.candidateZones, ['board:cambodia']);
        return true;
      },
    );
  });
});

describe('applyMove() free-operation execution seat threading', () => {
  it('uses executeAsSeat override when evaluating pipeline applicability', () => {
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
      id: 'operation-profile',
      actionId: asActionId('operation'),
      applicability: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      activePlayer: asPlayerId(0),
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
              executeAsSeat: '1',
              operationClass: 'operation',
              actionIds: ['operation'],
              remainingUses: 1,
            },
          ],
        },
      },
    });

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('operation'), params: {} }, { advanceToDecisionPoint: false }),
      (error: unknown) =>
        error instanceof Error
        && 'reason' in error
        && (error as { reason?: unknown }).reason === ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
    );

    assert.doesNotThrow(() =>
      applyMove(def, state, { actionId: asActionId('operation'), params: {}, freeOperation: true }, { advanceToDecisionPoint: false }));
  });

  it('prioritizes free-operation denial over pipeline inapplicability when both apply', () => {
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
      id: 'operation-profile',
      actionId: action.id,
      applicability: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };
    const def = {
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;
    const state = makeBaseState({
      activePlayer: asPlayerId(0),
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
              actionIds: ['operation-alt'],
              remainingUses: 1,
            },
          ],
        },
      },
    });

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & {
          code?: unknown;
          reason?: unknown;
          context?: { freeOperationDenial?: { cause?: string } };
        };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED);
        assert.equal(details.context?.freeOperationDenial?.cause, 'actionIdMismatch');
        return true;
      },
    );
  });

  it('threads free-operation zone-filter context into validation preflight pipeline applicability', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [{ name: 'zone', domain: { query: 'zones' } }],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const profile: ActionPipelineDef = {
      id: 'operation-profile',
      actionId: action.id,
      applicability: {
        op: '==',
        left: { aggregate: { op: 'count', query: { query: 'zones' } } },
        right: 2,
      },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };
    const def = {
      ...makeBaseDef({
        actions: [action],
        actionPipelines: [profile],
        zones: [
          { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'board' },
          { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'city' },
        ],
      }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
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
                left: { ref: 'zoneProp', zone: '$zone', prop: 'category' },
                right: 'board',
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    assert.throws(
      () =>
        applyMove(def, state, {
          actionId: action.id,
          params: { zone: 'board:none' },
          freeOperation: true,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
        return true;
      },
    );
  });
});

describe('applyMove() compound special-activity free-operation pipeline overlay parity', () => {
  const makeTurnFlowDef = (actions: readonly ActionDef[], actionPipelines: readonly ActionPipelineDef[]): GameDef =>
    ({
      ...makeBaseDef({
        actions,
        actionPipelines,
        zones: [
          { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'board' },
          { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'city' },
        ],
      }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['special'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef);

  const makeTurnFlowState = (): GameState =>
    makeBaseState({
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
              actionIds: ['special'],
              zoneFilter: {
                op: '==',
                left: { ref: 'zoneProp', zone: '$zone', prop: 'category' },
                right: 'board',
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

  it('does not enforce accompanyingOps from a zone-filtered-out special-activity pipeline', () => {
    const operation: ActionDef = {
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
    const special: ActionDef = {
      id: asActionId('special'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [{ name: 'zone', domain: { query: 'zones' } }],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const restrictiveProfile: ActionPipelineDef = {
      id: 'special-profile-restrictive',
      actionId: special.id,
      applicability: {
        op: '==',
        left: { aggregate: { op: 'count', query: { query: 'zones' } } },
        right: 2,
      },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      accompanyingOps: ['different-operation'],
      atomicity: 'partial',
    };
    const fallbackProfile: ActionPipelineDef = {
      id: 'special-profile-fallback',
      actionId: special.id,
      applicability: { op: '==', left: 1, right: 1 },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };

    const def = makeTurnFlowDef([operation, special], [restrictiveProfile, fallbackProfile]);
    const state = makeTurnFlowState();

    assert.doesNotThrow(() =>
      applyMove(def, state, {
        actionId: operation.id,
        params: {},
        compound: {
          timing: 'before',
          specialActivity: {
            actionId: special.id,
            params: { zone: 'board:none' },
            freeOperation: true,
          },
        },
      }, { advanceToDecisionPoint: false }));
  });

  it('does not enforce compoundParamConstraints from a zone-filtered-out special-activity pipeline', () => {
    const operation: ActionDef = {
      id: asActionId('operation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [{ name: 'source', domain: { query: 'zones' } }],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const special: ActionDef = {
      id: asActionId('special'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [{ name: 'zone', domain: { query: 'zones' } }],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const restrictiveProfile: ActionPipelineDef = {
      id: 'special-profile-restrictive',
      actionId: special.id,
      applicability: {
        op: '==',
        left: { aggregate: { op: 'count', query: { query: 'zones' } } },
        right: 2,
      },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      compoundParamConstraints: [
        {
          operationParam: 'source',
          specialActivityParam: 'zone',
          relation: 'subset',
        },
      ],
      atomicity: 'partial',
    };
    const fallbackProfile: ActionPipelineDef = {
      id: 'special-profile-fallback',
      actionId: special.id,
      applicability: { op: '==', left: 1, right: 1 },
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };

    const def = makeTurnFlowDef([operation, special], [restrictiveProfile, fallbackProfile]);
    const state = makeTurnFlowState();

    assert.doesNotThrow(() =>
      applyMove(def, state, {
        actionId: operation.id,
        params: { source: 'city:none' },
        compound: {
          timing: 'before',
          specialActivity: {
            actionId: special.id,
            params: { zone: 'board:none' },
            freeOperation: true,
          },
        },
      }, { advanceToDecisionPoint: false }));
  });
});

describe('applyMove() executor applicability contract', () => {
  it('returns illegal move when actor does not include active player', () => {
    const action: ActionDef = {
      id: asActionId('wrongActor'),
      actor: { id: asPlayerId(1) },
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState({ activePlayer: asPlayerId(0) });

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('wrongActor'), params: {} }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_ACTOR_NOT_APPLICABLE);
        return true;
      },
    );
  });

  it('returns illegal move when fixed executor is outside playerCount', () => {
    const action: ActionDef = {
      id: asActionId('outOfRangeExecutor'),
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
    const state = makeBaseState({ playerCount: 2 });

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('outOfRangeExecutor'), params: {} }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE);
        return true;
      },
    );
  });

  it('returns dedicated runtime contract error when actor selector is invalid', () => {
    const action: ActionDef = {
      id: asActionId('invalidActor'),
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
    const state = makeBaseState();

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('invalidActor'), params: {} }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown>; cause?: unknown };
        assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
        assert.equal(details.context?.surface, 'applyMove');
        assert.equal(details.context?.selector, 'actor');
        assert.equal(String(details.context?.actionId), 'invalidActor');
        assert.ok(details.cause instanceof Error);
        assert.match((details.cause as Error).message, /Invalid player selector value/);
        return true;
      },
    );
  });

  it('returns dedicated runtime contract error when executor selector is invalid', () => {
    const action: ActionDef = {
      id: asActionId('invalidExecutor'),
      actor: 'active',
      executor: '$owner' as unknown as ActionDef['executor'],
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('invalidExecutor'), params: {} }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown>; cause?: unknown };
        assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
        assert.equal(details.context?.surface, 'applyMove');
        assert.equal(details.context?.selector, 'executor');
        assert.equal(String(details.context?.actionId), 'invalidExecutor');
        assert.ok(details.cause instanceof Error);
        assert.match((details.cause as Error).message, /Invalid player selector value/);
        return true;
      },
    );
  });

  it('returns pipeline profile metadata when atomic pipeline cost validation fails', () => {
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
    const pipeline: ActionPipelineDef = {
      id: 'costlyProfile',
      actionId: action.id,
      legality: null,
      costValidation: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 20 },
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [pipeline] });
    const state = makeBaseState({ globalVars: { resources: 1 } });

    assert.throws(
      () => applyMove(def, state, { actionId: asActionId('costlyOp'), params: {} }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED);
        assert.equal(details.context?.profileId, 'costlyProfile');
        assert.equal(details.context?.partialExecutionMode, 'atomic');
        return true;
      },
    );
  });
});

describe('applyMove() simultaneous commit preflight parity', () => {
  it('enforces pipeline cost-validation invariants during skipValidation commit fan-in', () => {
    const costlyAction: ActionDef = {
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
    const costlyPipeline: ActionPipelineDef = {
      id: 'costlyProfile',
      actionId: costlyAction.id,
      legality: null,
      costValidation: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 20 },
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };

    const def = {
      ...makeBaseDef({ actions: [costlyAction, passAction], actionPipelines: [costlyPipeline] }),
      turnOrder: { type: 'simultaneous' as const },
    } as unknown as GameDef;
    const state = makeBaseState({
      globalVars: { resources: 1 },
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'simultaneous',
        submitted: { 0: true, 1: false },
        pending: {
          0: {
            actionId: String(costlyAction.id),
            params: {},
          },
        },
      },
    });

    assert.throws(
      () => applyMove(def, state, { actionId: passAction.id, params: {} }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED);
        assert.equal(details.context?.profileId, 'costlyProfile');
        assert.equal(details.context?.partialExecutionMode, 'atomic');
        return true;
      },
    );

    assert.throws(
      () => applyMove(makeBaseDef({ actions: [costlyAction], actionPipelines: [costlyPipeline] }), makeBaseState({ globalVars: { resources: 1 } }), {
        actionId: costlyAction.id,
        params: {},
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED);
        assert.equal(details.context?.profileId, 'costlyProfile');
        assert.equal(details.context?.partialExecutionMode, 'atomic');
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// compound timing validation + replaceRemainingStages behavior
// ---------------------------------------------------------------------------

describe('applyMove() compound timing validation and replaceRemainingStages', () => {
  const costVar: VariableDef = { name: 'cost', type: 'int', init: 0, min: 0, max: 100 };
  const combatVar: VariableDef = { name: 'combat', type: 'int', init: 0, min: 0, max: 100 };
  const saVar: VariableDef = { name: 'saEffect', type: 'int', init: 0, min: 0, max: 100 };

  const operation: ActionDef = {
    id: asActionId('attack'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };
  const specialActivityAction: ActionDef = {
    id: asActionId('ambush'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [{ addVar: { scope: 'global', var: 'saEffect', delta: 1 } }],
    limits: [],
  };
  const noPipelineDef = makeBaseDef({
    actions: [operation, specialActivityAction],
    globalVars: [resourcesVar, costVar, combatVar, saVar],
  });

  const threeStageProfile: ActionPipelineDef = {
    id: 'attack-profile',
    actionId: asActionId('attack'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [
      { stage: 'select-spaces', effects: [] },
      { stage: 'cost-per-space', effects: [{ addVar: { scope: 'global', var: 'cost', delta: 1 } }] },
      { stage: 'resolve-per-space', effects: [{ addVar: { scope: 'global', var: 'combat', delta: 1 } }] },
    ],
    atomicity: 'atomic',
  };

  it('insertAfterStage with timing=before is illegal', () => {
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'before',
        insertAfterStage: 0,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    assert.throws(
      () => applyMove(noPipelineDef, state, move),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
        assert.equal(details.context?.['invalidField'], 'insertAfterStage');
        assert.equal(details.context?.['timing'], 'before');
        return true;
      },
    );
  });

  it('insertAfterStage with timing=after is illegal', () => {
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'after',
        insertAfterStage: 0,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    assert.throws(
      () => applyMove(noPipelineDef, state, move),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
        assert.equal(details.context?.['invalidField'], 'insertAfterStage');
        assert.equal(details.context?.['timing'], 'after');
        return true;
      },
    );
  });

  it('replaceRemainingStages with timing=before is illegal', () => {
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'before',
        replaceRemainingStages: true,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    assert.throws(
      () => applyMove(noPipelineDef, state, move),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
        assert.equal(details.context?.['invalidField'], 'replaceRemainingStages');
        assert.equal(details.context?.['timing'], 'before');
        return true;
      },
    );
  });

  it('replaceRemainingStages: false with timing=before is illegal', () => {
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'before',
        replaceRemainingStages: false,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    assert.throws(
      () => applyMove(noPipelineDef, state, move),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
        assert.equal(details.context?.['invalidField'], 'replaceRemainingStages');
        assert.equal(details.context?.['timing'], 'before');
        return true;
      },
    );
  });

  it('replaceRemainingStages with timing=after is illegal', () => {
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'after',
        replaceRemainingStages: true,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    assert.throws(
      () => applyMove(noPipelineDef, state, move),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
        assert.equal(details.context?.['invalidField'], 'replaceRemainingStages');
        assert.equal(details.context?.['timing'], 'after');
        return true;
      },
    );
  });

  it('replaceRemainingStages: false with timing=after is illegal', () => {
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'after',
        replaceRemainingStages: false,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    assert.throws(
      () => applyMove(noPipelineDef, state, move),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
        assert.equal(details.context?.['invalidField'], 'replaceRemainingStages');
        assert.equal(details.context?.['timing'], 'after');
        return true;
      },
    );
  });

  it('timing=during without matched pipeline is illegal', () => {
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'during',
        insertAfterStage: 0,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    assert.throws(
      () => applyMove(noPipelineDef, state, move),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
        assert.equal(details.context?.['timing'], 'during');
        assert.match(String(details.context?.['detail']), /requires a matched staged action pipeline/);
        return true;
      },
    );
  });

  it('timing=during with zero-stage pipeline is illegal', () => {
    const zeroStageProfile: ActionPipelineDef = {
      id: 'attack-zero-stage-profile',
      actionId: asActionId('attack'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeBaseDef({
      actions: [operation, specialActivityAction],
      actionPipelines: [zeroStageProfile],
      globalVars: [resourcesVar, costVar, combatVar, saVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'during',
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    assert.throws(
      () => applyMove(def, state, move),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
        assert.equal(details.context?.['invalidField'], 'insertAfterStage');
        assert.equal(details.context?.['stageCount'], 0);
        assert.equal(details.context?.['insertAfterStage'], 0);
        return true;
      },
    );
  });

  it('insertAfterStage out of bounds is illegal for timing=during', () => {
    const def = makeBaseDef({
      actions: [operation, specialActivityAction],
      actionPipelines: [threeStageProfile],
      globalVars: [resourcesVar, costVar, combatVar, saVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'during',
        insertAfterStage: 3,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    assert.throws(
      () => applyMove(def, state, move),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ILLEGAL_MOVE');
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
        assert.equal(details.context?.['invalidField'], 'insertAfterStage');
        assert.equal(details.context?.['stageCount'], 3);
        assert.equal(details.context?.['insertAfterStage'], 3);
        return true;
      },
    );
  });

  it('replaceRemainingStages: true skips stages after insertAfterStage', () => {
    const def = makeBaseDef({
      actions: [operation, specialActivityAction],
      actionPipelines: [threeStageProfile],
      globalVars: [resourcesVar, costVar, combatVar, saVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'during',
        insertAfterStage: 1,
        replaceRemainingStages: true,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    const result = applyMove(def, state, move);
    // Stage 0 (select-spaces): no vars changed
    // Stage 1 (cost-per-space): cost +1
    // SA fires after stage 1: saEffect +1
    // Stage 2 (resolve-per-space): SKIPPED due to replaceRemainingStages
    assert.equal(result.state.globalVars['cost'], 1, 'cost stage should execute');
    assert.equal(result.state.globalVars['saEffect'], 1, 'SA should execute');
    assert.equal(result.state.globalVars['combat'], 0, 'combat stage should be skipped');
    const traceEntry = result.triggerFirings.find(
      (entry): entry is OperationCompoundStagesReplacedTraceEntry => entry.kind === 'operationCompoundStagesReplaced',
    );
    assert.ok(traceEntry, 'trace should include operationCompoundStagesReplaced');
    assert.equal(traceEntry.actionId, asActionId('attack'));
    assert.equal(traceEntry.profileId, 'attack-profile');
    assert.equal(traceEntry.insertAfterStage, 1);
    assert.equal(traceEntry.totalStages, 3);
    assert.equal(traceEntry.skippedStageCount, 1);
  });

  it('replaceRemainingStages: false preserves all stages', () => {
    const def = makeBaseDef({
      actions: [operation, specialActivityAction],
      actionPipelines: [threeStageProfile],
      globalVars: [resourcesVar, costVar, combatVar, saVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'during',
        insertAfterStage: 1,
        replaceRemainingStages: false,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    const result = applyMove(def, state, move);
    assert.equal(result.state.globalVars['cost'], 1, 'cost stage should execute');
    assert.equal(result.state.globalVars['saEffect'], 1, 'SA should execute');
    assert.equal(result.state.globalVars['combat'], 1, 'combat stage should also execute');
    assert.equal(
      result.triggerFirings.some((entry) => entry.kind === 'operationCompoundStagesReplaced'),
      false,
      'trace should not include operationCompoundStagesReplaced when stages are preserved',
    );
  });

  it('absent replaceRemainingStages preserves all stages (backward compat)', () => {
    const def = makeBaseDef({
      actions: [operation, specialActivityAction],
      actionPipelines: [threeStageProfile],
      globalVars: [resourcesVar, costVar, combatVar, saVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'during',
        insertAfterStage: 1,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    const result = applyMove(def, state, move);
    assert.equal(result.state.globalVars['cost'], 1);
    assert.equal(result.state.globalVars['saEffect'], 1);
    assert.equal(result.state.globalVars['combat'], 1, 'all stages preserved when flag absent');
    assert.equal(
      result.triggerFirings.some((entry) => entry.kind === 'operationCompoundStagesReplaced'),
      false,
      'trace should not include operationCompoundStagesReplaced when replaceRemainingStages is absent',
    );
  });

  it('replaceRemainingStages: true at final stage emits zero skippedStageCount', () => {
    const def = makeBaseDef({
      actions: [operation, specialActivityAction],
      actionPipelines: [threeStageProfile],
      globalVars: [resourcesVar, costVar, combatVar, saVar],
    });
    const state = makeBaseState({ globalVars: { resources: 10, cost: 0, combat: 0, saEffect: 0 } });
    const move: Move = {
      actionId: asActionId('attack'),
      params: {},
      compound: {
        timing: 'during',
        insertAfterStage: 2,
        replaceRemainingStages: true,
        specialActivity: { actionId: asActionId('ambush'), params: {} },
      },
    };

    const result = applyMove(def, state, move);
    const traceEntry = result.triggerFirings.find(
      (entry): entry is OperationCompoundStagesReplacedTraceEntry => entry.kind === 'operationCompoundStagesReplaced',
    );
    assert.ok(traceEntry, 'trace should include operationCompoundStagesReplaced');
    assert.equal(traceEntry.insertAfterStage, 2);
    assert.equal(traceEntry.totalStages, 3);
    assert.equal(traceEntry.skippedStageCount, 0);
  });
});
