import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  enumerateLegalMoves,
  isKernelErrorCode,
  legalMoves,
  resolveMoveDecisionSequence,
  type ActionDef,
  type GameDef,
  type GameState,
  type ActionPipelineDef,
  type EventCardDef,
} from '../../../src/kernel/index.js';
import { isMoveAllowedByTurnFlowOptionMatrix } from '../../../src/kernel/legal-moves-turn-order.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
  globalVars?: GameDef['globalVars'];
  zones?: GameDef['zones'];
}): GameDef =>
  ({
    metadata: { id: 'legal-moves-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: overrides?.globalVars ?? [],
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
  globalVars: {},
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

const makeEventLegalMovesFixture = (card: EventCardDef): { def: GameDef; state: GameState; actionId: ReturnType<typeof asActionId> } => {
  const actionId = asActionId(`eventAction:${card.id}`);
  const eventAction: ActionDef = {
    id: actionId,
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
    capabilities: ['cardEvent'],
  };
  const def = {
    ...makeBaseDef({
      actions: [eventAction],
      zones: [
        { id: asZoneId('draw:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
    }),
    eventDecks: [
      {
        id: 'deck',
        drawZone: 'draw:none',
        discardZone: 'discard:none',
        cards: [card],
      },
    ],
  } as unknown as GameDef;
  const state = makeBaseState({
    zones: {
      'draw:none': [],
      'discard:none': [{ id: asTokenId(card.id), type: 'card', props: {} }],
    },
  });
  return { def, state, actionId };
};

describe('legalMoves() template moves (KERDECSEQMOD-002)', () => {
  it('supports actions declared across multiple phases', () => {
    const action: ActionDef = {
      id: asActionId('multiPhaseAction'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('setup'), asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
    });
    const state = makeBaseState({
      currentPhase: asPhaseId('main'),
    });

    const moves = legalMoves(def, state);
    assert.equal(moves.length, 1);
    assert.equal(moves[0]?.actionId, asActionId('multiPhaseAction'));
  });

  it('1. operation with profile emits a template move with params: {}', () => {
    const action: ActionDef = {
      id: asActionId('trainOp'),
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

  it('applies option-matrix gating to pipeline template emission for second eligible seat', () => {
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
    const operationAction: ActionDef = {
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
    const limitedOperationAction: ActionDef = {
      id: asActionId('limitedOperation'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const operationProfile: ActionPipelineDef = {
      id: 'operationProfile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({
        actions: [passAction, operationAction, limitedOperationAction],
        actionPipelines: [operationProfile],
      }),
      metadata: { id: 'legal-moves-option-matrix-pipeline', players: { min: 3, max: 3 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1', '2'], overrideWindows: [] },
            actionClassByActionId: {
              pass: 'pass',
              operation: 'operation',
              limitedOperation: 'limitedOperation',
            },
            optionMatrix: [{ first: 'operation', second: ['limitedOperation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      playerCount: 3,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1', '2'],
          eligibility: { '0': true, '1': true, '2': true },
          currentCard: {
            firstEligible: '1',
            secondEligible: '2',
            actedSeats: ['0'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
        },
      },
    });

    // operation-class action also gets a limitedOperation variant
    assert.deepEqual(
      legalMoves(def, state).map((move) => move.actionId),
      [asActionId('pass'), asActionId('operation'), asActionId('limitedOperation')],
    );
  });

  it('rejects move.actionClass overrides that conflict with mapped class during option-matrix checks', () => {
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
    const operationAction: ActionDef = {
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
    const limitedOperationAction: ActionDef = {
      id: asActionId('limitedOperation'),
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
      ...makeBaseDef({
        actions: [passAction, operationAction, limitedOperationAction],
      }),
      metadata: { id: 'legal-moves-option-matrix-class-mismatch', players: { min: 3, max: 3 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1', '2'], overrideWindows: [] },
            actionClassByActionId: {
              pass: 'pass',
              operation: 'operation',
              limitedOperation: 'limitedOperation',
            },
            optionMatrix: [{ first: 'operation', second: ['limitedOperation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const state = makeBaseState({
      playerCount: 3,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1', '2'],
          eligibility: { '0': true, '1': true, '2': true },
          currentCard: {
            firstEligible: '1',
            secondEligible: '2',
            actedSeats: ['0'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
        },
      },
    });

    // Compatible override: operation → limitedOperation is allowed since operation
    // base class is compatible with limitedOperation constraint
    const compatibleMove = {
      actionId: asActionId('operation'),
      params: {},
      actionClass: 'limitedOperation',
    };
    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, compatibleMove), true);

    // Incompatible case: an unmapped action with event class is rejected since
    // event is not in the constrained set [limitedOperation]
    const incompatibleMove = {
      actionId: asActionId('unmappedAction'),
      params: {},
      actionClass: 'event',
    };
    assert.equal(isMoveAllowedByTurnFlowOptionMatrix(def, state, incompatibleMove), false);
  });

  it('2. simple action (no profile) still emits fully-enumerated moves', () => {
    const action: ActionDef = {
      id: asActionId('simpleAction'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
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

  it('normalizes declared action param options to canonical move-param values', () => {
    const action: ActionDef = {
      id: asActionId('pickTokenDeclared'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        {
          name: 'targetToken',
          domain: { query: 'tokensInZone', zone: asZoneId('board:none') },
        },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({
      actions: [action],
      zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'stack' }],
    });
    const state = makeBaseState({
      zones: {
        'board:none': [{ id: asTokenId('tok-1'), type: 'piece', props: {} }],
      } as GameState['zones'],
      nextTokenOrdinal: 1,
    });

    const moves = legalMoves(def, state);
    assert.deepStrictEqual(
      moves.filter((move) => move.actionId === asActionId('pickTokenDeclared')).map((move) => move.params.targetToken),
      [asTokenId('tok-1')],
    );
  });

  it('fails fast when declared action param domain options are not move-param encodable', () => {
    const action: ActionDef = {
      id: asActionId('pickScheduleRowDeclared'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [
        {
          name: 'row',
          domain: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
        },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] }) as GameDef & {
      runtimeDataAssets?: unknown;
      tableContracts?: unknown;
    };
    def.runtimeDataAssets = [
      {
        id: 'tournament-standard',
        kind: 'scenario',
        payload: { blindSchedule: { levels: [{ level: 1, smallBlind: 10 }] } },
      },
    ];
    def.tableContracts = [
      {
        id: 'tournament-standard::blindSchedule.levels',
        assetId: 'tournament-standard',
        tablePath: 'blindSchedule.levels',
        fields: [
          { field: 'level', type: 'int' },
          { field: 'smallBlind', type: 'int' },
        ],
      },
    ];
    const state = makeBaseState();

    assert.throws(
      () => legalMoves(def, state),
      (error: unknown) => {
        assert.ok(isKernelErrorCode(error, 'LEGAL_MOVES_VALIDATION_FAILED'));
        const details = error as Error & { context?: Record<string, unknown> };
        assert.equal(details.context?.param, 'row');
        return true;
      },
    );
  });

  it('3. template move respects legality predicate (failing legality produces no template)', () => {
    const action: ActionDef = {
      id: asActionId('blockedOp'),
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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

  it('11. map-aware profile legality evaluates against zone category/attributes', () => {
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
      stages: [{ effects: [] }],
      atomicity: 'atomic',
    };

    const def = makeBaseDef({
      actions: [action],
      actionPipelines: [profile],
      zones: [
        { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'city', attributes: { population: 2, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false } },
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
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'strictProfile',
      actionId: asActionId('strictProfileOp'),
      applicability: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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

  it('16b. defers unresolved non-$zone bindings on per-zone filter probing during template generation', () => {
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
                internalDecisionId: 'decision:$targetProvince',
                bind: '$targetProvince',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({
        actions: [action],
        actionPipelines: [profile],
        zones: [
          { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
          { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
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
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
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
                left: { ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
                right: { ref: 'binding', name: '$targetCountry' },
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const moves = legalMoves(def, state);
    assert.equal(
      moves.some((move) => String(move.actionId) === 'operation' && move.freeOperation === true),
      true,
    );
  });

  it('16c. keeps free-operation template probing deterministic with multi-unresolved zone aliases', () => {
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
                internalDecisionId: 'decision:$targetProvince',
                bind: '$targetProvince',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = {
      ...makeBaseDef({
        actions: [action],
        actionPipelines: [profile],
        zones: [
          { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
          { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
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
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
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
                op: 'and',
                args: [
                  {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
                    right: 'cambodia',
                  },
                  {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$supportProvince', prop: 'country' },
                    right: 'cambodia',
                  },
                ],
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const template = legalMoves(def, state).find((move) => String(move.actionId) === 'operation' && move.freeOperation === true);
    assert.ok(template);
    const sequence = resolveMoveDecisionSequence(def, state, template, { choose: () => undefined });
    assert.equal(sequence.complete, false);
    assert.deepEqual(sequence.nextDecision?.options.map((option) => option.value), ['board:cambodia']);
  });

  it('17. skips actions when actor selector resolves outside playerCount', () => {
    const action: ActionDef = {
      id: asActionId('actorOutOfRange'),
actor: { id: asPlayerId(2) },
executor: 'actor',
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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
phase: [asPhaseId('main')],
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

  it('21. enumerates declared executor binding params and resolves executor after binding', () => {
    const action: ActionDef = {
      id: asActionId('missingExecutorBinding'),
actor: 'active',
executor: { chosen: '$owner' },
phase: [asPhaseId('main')],
      params: [{ name: '$owner', domain: { query: 'players' } }],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const moves = legalMoves(def, makeBaseState());
    assert.equal(moves.length, 2);
    assert.deepEqual(
      moves.map((move) => move.params.$owner).sort(),
      [asPlayerId(0), asPlayerId(1)],
    );
  });

  it('22. truncates templates deterministically when maxTemplates budget is reached', () => {
    const firstAction: ActionDef = {
      id: asActionId('first'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const secondAction: ActionDef = {
      id: asActionId('second'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const result = enumerateLegalMoves(makeBaseDef({ actions: [firstAction, secondAction] }), makeBaseState(), {
      budgets: { maxTemplates: 1 },
    });

    assert.deepEqual(result.moves.map((move) => move.actionId), [asActionId('first')]);
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED'), true);
  });

  it('23. truncates parameter expansion deterministically when maxParamExpansions budget is reached', () => {
    const action: ActionDef = {
      id: asActionId('expand'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [
        { name: 'a', domain: { query: 'enums', values: ['x', 'y'] } },
        { name: 'b', domain: { query: 'enums', values: ['1', '2'] } },
      ],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const result = enumerateLegalMoves(makeBaseDef({ actions: [action] }), makeBaseState(), {
      budgets: { maxParamExpansions: 2 },
    });

    assert.deepEqual(result.moves, [{ actionId: asActionId('expand'), params: { a: 'x', b: '1' } }]);
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED'), true);
  });

  it('24. surfaces decision probe budget warnings through legal move diagnostics', () => {
    const action: ActionDef = {
      id: asActionId('needsDecision'),
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
      id: 'needsDecisionProfile',
      actionId: asActionId('needsDecision'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a'] },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const result = enumerateLegalMoves(makeBaseDef({ actions: [action], actionPipelines: [profile] }), makeBaseState(), {
      budgets: { maxDecisionProbeSteps: 0 },
    });

    assert.deepEqual(result.moves, []);
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'), true);
  });

  it('25. preserves class-distinct free-operation variants for same actionId and params', () => {
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
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [{ first: 'operation', second: ['operation', 'limitedOperation'] }],
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
            firstEligible: '1',
            secondEligible: '0',
            actedSeats: ['1'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-op',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              remainingUses: 1,
            },
            {
              grantId: 'grant-lim-op',
              seat: '0',
              operationClass: 'limitedOperation',
              actionIds: ['operation'],
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const firstRun = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation' && move.freeOperation === true);
    const secondRun = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation' && move.freeOperation === true);

    assert.equal(firstRun.some((move) => move.actionClass === 'operation'), true);
    assert.equal(firstRun.some((move) => move.actionClass === 'limitedOperation'), true);
    assert.deepEqual(secondRun, firstRun);
  });

  it('does not expose free-operation variants when grant and turn-flow action domains are both absent', () => {
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
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [{ first: 'operation', second: ['operation', 'limitedOperation'] }],
            passRewards: [],
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
            firstEligible: '1',
            secondEligible: '0',
            actedSeats: ['1'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-empty-domain',
              seat: '0',
              operationClass: 'operation',
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.equal(moves.some((move) => move.freeOperation === true), false);
  });

  it('exposes free-operation variants when grant actionIds are absent but turn-flow defaults include the action', () => {
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
      ...makeBaseDef({ actions: [action] }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [{ first: 'operation', second: ['operation', 'limitedOperation'] }],
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
            firstEligible: '1',
            secondEligible: '0',
            actedSeats: ['1'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-default-domain',
              seat: '0',
              operationClass: 'operation',
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.equal(moves.some((move) => move.freeOperation === true), true);
  });

  it('26. preserves event moves when event decision probing hits deferrable missing bindings', () => {
    const { def, state, actionId } = makeEventLegalMovesFixture({
      id: 'event-deferrable-binding',
      title: 'Deferrable event',
      sideMode: 'single',
      unshaded: {
        effects: [
          {
            if: {
              when: { op: '==', left: { ref: 'binding', name: '$missing' }, right: 1 },
              then: [],
            },
          } as GameDef['actions'][number]['effects'][number],
        ],
      },
    });

    const moves = legalMoves(def, state);
    assert.equal(moves.length, 1);
    assert.deepEqual(moves[0], {
      actionId,
      params: {
        eventCardId: 'event-deferrable-binding',
        eventDeckId: 'deck',
        side: 'unshaded',
      },
    });
  });

  it('27. preserves event moves when event decision satisfiability is unknown', () => {
    const { def, state, actionId } = makeEventLegalMovesFixture({
      id: 'event-unknown',
      title: 'Unknown event',
      sideMode: 'single',
      unshaded: {
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: ['a'] },
            },
          } as GameDef['actions'][number]['effects'][number],
        ],
      },
    });

    const result = enumerateLegalMoves(def, state, { budgets: { maxDecisionProbeSteps: 0 } });
    assert.deepEqual(result.moves, [
      {
        actionId,
        params: {
          eventCardId: 'event-unknown',
          eventDeckId: 'deck',
          side: 'unshaded',
        },
      },
    ]);
    assert.equal(
      result.warnings.some((warning) => warning.code === 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'),
      true,
    );
  });

  it('28. excludes event moves when event decision sequence is unsatisfiable', () => {
    const { def, state } = makeEventLegalMovesFixture({
      id: 'event-unsat',
      title: 'Unsatisfiable event',
      sideMode: 'single',
      unshaded: {
        effects: [
          {
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: [] },
            },
          } as GameDef['actions'][number]['effects'][number],
        ],
      },
    });

    assert.deepEqual(legalMoves(def, state), []);
  });

  it('29. does not fall back to generic template enumeration for card-event actions', () => {
    const { def, actionId } = makeEventLegalMovesFixture({
      id: 'event-no-current-card',
      title: 'No current card',
      sideMode: 'single',
      unshaded: { effects: [] },
    });
    const state = makeBaseState({
      zones: {
        'draw:none': [],
        'discard:none': [],
      },
    });

    const moves = legalMoves(def, state);
    assert.equal(moves.some((move) => move.actionId === actionId && Object.keys(move.params).length === 0), false);
    assert.deepEqual(moves, []);
  });
});
