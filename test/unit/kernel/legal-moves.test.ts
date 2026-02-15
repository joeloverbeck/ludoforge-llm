import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalMoves,
  type ActionDef,
  type GameDef,
  type GameState,
  type ActionPipelineDef,
} from '../../../src/kernel/index.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
  globalVars?: GameDef['globalVars'];
  mapSpaces?: GameDef['mapSpaces'];
}): GameDef =>
  ({
    metadata: { id: 'legal-moves-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: overrides?.globalVars ?? [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    ...(overrides?.mapSpaces === undefined ? {} : { mapSpaces: overrides.mapSpaces }),
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

describe('legalMoves() template moves (KERDECSEQMOD-002)', () => {
  it('1. operation with profile emits a template move with params: {}', () => {
    const action: ActionDef = {
      id: asActionId('trainOp'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
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

  it('2. simple action (no profile) still emits fully-enumerated moves', () => {
    const action: ActionDef = {
      id: asActionId('simpleAction'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
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

  it('3. template move respects legality predicate (failing legality produces no template)', () => {
    const action: ActionDef = {
      id: asActionId('blockedOp'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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

  it('6. limited operations produce template moves when within limits', () => {
    const action: ActionDef = {
      id: asActionId('limitedOp'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [{ scope: 'turn', max: 1 }],
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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

  it('11. map-aware profile legality evaluates against def.mapSpaces', () => {
    const action: ActionDef = {
      id: asActionId('mapAwareOp'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
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
        left: { ref: 'zoneProp', zone: 'city:none', prop: 'spaceType' },
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
      mapSpaces: [
        {
          id: 'city:none',
          spaceType: 'city',
          population: 2,
          econ: 0,
          terrainTags: [],
          country: 'southVietnam',
          coastal: false,
          adjacentTo: [],
        },
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
phase: asPhaseId('main'),
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'strictProfile',
      actionId: asActionId('strictProfileOp'),
      applicability: { op: '==', left: { ref: 'activePlayer' }, right: '1' },
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
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
          factionOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedFactions: [],
            passedFactions: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              faction: '0',
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

  it('17. skips actions when actor selector resolves outside playerCount', () => {
    const action: ActionDef = {
      id: asActionId('actorOutOfRange'),
actor: { id: asPlayerId(2) },
executor: 'actor',
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
phase: asPhaseId('main'),
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
});
