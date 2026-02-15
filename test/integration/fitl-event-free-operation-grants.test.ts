import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  legalMoves,
  type EventDeckDef,
  type GameDef,
} from '../../src/kernel/index.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'event-turn-flow-directives-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            factions: ['0', '1', '2', '3'],
            overrideWindows: [],
          },
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-1', 'card-2', 'card-3', 'card-4', 'card-5', 'card-6', 'card-7'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['branch-grant-nva', 'none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    actionPipelines: [
      {
        id: 'operation-profile',
        actionId: asActionId('operation'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [] }],
        atomicity: 'atomic',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-1',
            title: 'Directive From Side',
            sideMode: 'single',
            unshaded: {
              text: 'Grant free op to VC.',
              freeOperationGrants: [
                {
                  faction: '3',
                  sequence: { chain: 'vc-op', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
            },
          },
          {
            id: 'card-2',
            title: 'Directive From Branch',
            sideMode: 'single',
            unshaded: {
              text: 'Branch grants free op to NVA.',
              branches: [
                {
                  id: 'branch-grant-nva',
                  freeOperationGrants: [
                    {
                      faction: '2',
                      sequence: { chain: 'nva-op', step: 0 },
                      operationClass: 'operation',
                      actionIds: ['operation'],
                    },
                  ],
                },
              ],
            },
          },
          {
            id: 'card-3',
            title: 'Two Independent VC Grants',
            sideMode: 'single',
            unshaded: {
              text: 'Grant VC two free operations.',
              freeOperationGrants: [
                { faction: '3', sequence: { chain: 'vc-op-1', step: 0 }, operationClass: 'operation', actionIds: ['operation'] },
                { faction: '3', sequence: { chain: 'vc-op-2', step: 0 }, operationClass: 'operation', actionIds: ['operation'] },
              ],
            },
          },
          {
            id: 'card-4',
            title: 'Reusable VC Grant',
            sideMode: 'single',
            unshaded: {
              text: 'Grant VC a reusable free operation.',
              freeOperationGrants: [
                {
                  id: 'vc-reusable-op',
                  faction: '3',
                  sequence: { chain: 'vc-reusable-op', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  uses: 2,
                },
              ],
            },
          },
          {
            id: 'card-5',
            title: 'Limited VC Grant',
            sideMode: 'single',
            unshaded: {
              text: 'Grant VC a limited free operation.',
              freeOperationGrants: [
                {
                  faction: '3',
                  sequence: { chain: 'vc-limited', step: 0 },
                  operationClass: 'limitedOperation',
                  actionIds: ['operation'],
                },
              ],
            },
          },
          {
            id: 'card-6',
            title: 'Ordered VC Grant Chain',
            sideMode: 'single',
            unshaded: {
              text: 'VC gets limited operation first, then regular operation.',
              freeOperationGrants: [
                { faction: '3', sequence: { chain: 'vc-ordered', step: 0 }, operationClass: 'limitedOperation', actionIds: ['operation'] },
                { faction: '3', sequence: { chain: 'vc-ordered', step: 1 }, operationClass: 'operation', actionIds: ['operation'] },
              ],
            },
          },
          {
            id: 'card-7',
            title: 'Ordered Cross-Faction Grant Chain',
            sideMode: 'single',
            unshaded: {
              text: 'VC gets a free operation before NVA gets one.',
              freeOperationGrants: [
                { faction: '3', sequence: { chain: 'vc-nva-ordered', step: 0 }, operationClass: 'operation', actionIds: ['operation'] },
                { faction: '2', sequence: { chain: 'vc-nva-ordered', step: 1 }, operationClass: 'operation', actionIds: ['operation'] },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createZoneFilteredDef = (): GameDef =>
  ({
    metadata: { id: 'event-free-op-zone-filter-int', players: { min: 3, max: 3 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: 'board:cambodia', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: 'board:vietnam', owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    mapSpaces: [
      {
        id: 'board:cambodia',
        spaceType: 'province',
        population: 1,
        econ: 0,
        terrainTags: [],
        country: 'cambodia',
        coastal: false,
        adjacentTo: [],
      },
      {
        id: 'board:vietnam',
        spaceType: 'province',
        population: 1,
        econ: 0,
        terrainTags: [],
        country: 'southVietnam',
        coastal: false,
        adjacentTo: [],
      },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            factions: ['0', '1', '2'],
            overrideWindows: [],
          },
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-75-like'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    actionPipelines: [
      {
        id: 'operation-select-zone',
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
              },
            ],
          },
        ],
        atomicity: 'partial',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-75-like',
            title: 'Cambodia Restriction',
            sideMode: 'single',
            unshaded: {
              text: 'NVA free operation in Cambodia only.',
              freeOperationGrants: [
                {
                  faction: '2',
                  sequence: { chain: 'nva-cambodia', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                  zoneFilter: {
                    op: '==',
                    left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                    right: 'cambodia',
                  },
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

const createExecuteAsFactionDef = (): GameDef =>
  ({
    metadata: { id: 'event-free-op-execute-as-faction-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'executeAsMarker', type: 'int', init: 0, min: 0, max: 999 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            factions: ['0', '1'],
            overrideWindows: [],
          },
          optionMatrix: [{ first: 'event', second: ['operation'] }],
          passRewards: [],
          freeOperationActionIds: ['operation'],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-8'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['none'] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    actionPipelines: [
      {
        id: 'operation-as-us',
        actionId: asActionId('operation'),
        applicability: { op: '==', left: { ref: 'activePlayer' }, right: '0' },
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [{ setVar: { scope: 'global', var: 'executeAsMarker', value: 100 } }] }],
        atomicity: 'atomic',
      },
      {
        id: 'operation-as-self',
        actionId: asActionId('operation'),
        applicability: { op: '==', left: { ref: 'activePlayer' }, right: '1' },
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [{ effects: [{ setVar: { scope: 'global', var: 'executeAsMarker', value: 200 } }] }],
        atomicity: 'atomic',
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-8',
            title: 'Execute As Faction',
            sideMode: 'single',
            unshaded: {
              text: 'Faction 1 executes Operation as if faction 0.',
              freeOperationGrants: [
                {
                  faction: '1',
                  executeAsFaction: '0',
                  sequence: { chain: 'execute-as-faction', step: 0 },
                  operationClass: 'operation',
                  actionIds: ['operation'],
                },
              ],
            },
          },
        ],
      } as EventDeckDef,
    ],
  }) as unknown as GameDef;

describe('event free-operation grants integration', () => {
  it('creates pending free-operation grants from event side declarations', () => {
    const def = createDef();
    const start = initialState(def, 9, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-1', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;

    const runtime = requireCardDrivenRuntime(second);
    assert.equal(runtime.pendingFreeOperationGrants?.length, 1);
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.faction, '3');
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.operationClass, 'operation');
    assert.deepEqual(runtime.pendingFreeOperationGrants?.[0]?.actionIds, ['operation']);
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.remainingUses, 1);
    assert.equal(typeof runtime.pendingFreeOperationGrants?.[0]?.grantId, 'string');
    assert.equal(second.activePlayer, asPlayerId(2));

    const nvaMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(nvaMoves.some((move) => move.freeOperation === true), false);

    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(third.activePlayer, asPlayerId(3));
    const vcMoves = legalMoves(def, third).filter((move) => String(move.actionId) === 'operation');
    assert.equal(vcMoves.some((move) => move.freeOperation === true), true);
  });

  it('creates pending free-operation grants from event branch declarations', () => {
    const def = createDef();
    const start = initialState(def, 10, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-2', side: 'unshaded', branch: 'branch-grant-nva' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;

    const runtime = requireCardDrivenRuntime(second);
    assert.equal(runtime.pendingFreeOperationGrants?.length, 1);
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.faction, '2');
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.operationClass, 'operation');
    assert.deepEqual(runtime.pendingFreeOperationGrants?.[0]?.actionIds, ['operation']);
    assert.equal(runtime.pendingFreeOperationGrants?.[0]?.remainingUses, 1);
    assert.equal(typeof runtime.pendingFreeOperationGrants?.[0]?.grantId, 'string');
    const nvaMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(nvaMoves.some((move) => move.freeOperation === true), true);
  });

  it('supports two consecutive free operations when two grants exist for one faction', () => {
    const def = createDef();
    const start = initialState(def, 17, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-3', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const runtimeAfterCardPlay = requireCardDrivenRuntime(second);
    assert.equal(runtimeAfterCardPlay.pendingFreeOperationGrants?.length, 2);
    assert.equal(second.activePlayer, asPlayerId(2));

    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(third.activePlayer, asPlayerId(3));
    const vcMovesFirstWindow = legalMoves(def, third).filter((move) => String(move.actionId) === 'operation');
    assert.equal(vcMovesFirstWindow.some((move) => move.freeOperation === true), true);

    const fourth = applyMove(def, third, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    assert.equal(requireCardDrivenRuntime(fourth).pendingFreeOperationGrants?.length, 1);
    const vcMovesSecondWindow = legalMoves(def, fourth).filter((move) => String(move.actionId) === 'operation');
    assert.equal(vcMovesSecondWindow.some((move) => move.freeOperation === true), true);

    const fifth = applyMove(def, fourth, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    assert.deepEqual(requireCardDrivenRuntime(fifth).pendingFreeOperationGrants ?? [], []);
  });

  it('tracks reusable grants with remainingUses and stable explicit grant id', () => {
    const def = createDef();
    const start = initialState(def, 18, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-4', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    const beforeFreeUse = requireCardDrivenRuntime(third).pendingFreeOperationGrants ?? [];
    assert.equal(beforeFreeUse.length, 1);
    assert.equal(beforeFreeUse[0]?.grantId, 'vc-reusable-op');
    assert.equal(beforeFreeUse[0]?.remainingUses, 2);

    const fourth = applyMove(def, third, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    const afterFirstUse = requireCardDrivenRuntime(fourth).pendingFreeOperationGrants ?? [];
    assert.equal(afterFirstUse.length, 1);
    assert.equal(afterFirstUse[0]?.grantId, 'vc-reusable-op');
    assert.equal(afterFirstUse[0]?.remainingUses, 1);

    const fifth = applyMove(def, fourth, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    assert.deepEqual(requireCardDrivenRuntime(fifth).pendingFreeOperationGrants ?? [], []);
  });

  it('enforces operationClass on free-operation grants', () => {
    const def = createDef();
    const start = initialState(def, 21, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-5', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;

    assert.equal(third.activePlayer, asPlayerId(3));

    assert.throws(
      () => applyMove(def, third, { actionId: asActionId('operation'), params: {}, freeOperation: true, actionClass: 'operation' }),
      /free operation is not granted in current state/,
    );

    const fourth = applyMove(def, third, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
      actionClass: 'limitedOperation',
    }).state;
    assert.deepEqual(requireCardDrivenRuntime(fourth).pendingFreeOperationGrants ?? [], []);
  });

  it('enforces ordered same-faction grant chains within one event resolution', () => {
    const def = createDef();
    const start = initialState(def, 25, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-6', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    const third = applyMove(def, second, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(third.activePlayer, asPlayerId(3));

    assert.throws(
      () => applyMove(def, third, { actionId: asActionId('operation'), params: {}, freeOperation: true }),
      /free operation is not granted in current state/,
    );

    const fourth = applyMove(def, third, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
      actionClass: 'limitedOperation',
    }).state;
    const pendingAfterFirst = requireCardDrivenRuntime(fourth).pendingFreeOperationGrants ?? [];
    assert.equal(pendingAfterFirst.length, 1);
    assert.equal(pendingAfterFirst[0]?.operationClass, 'operation');

    const fifth = applyMove(def, fourth, {
      actionId: asActionId('operation'),
      params: {},
      freeOperation: true,
    }).state;
    assert.deepEqual(requireCardDrivenRuntime(fifth).pendingFreeOperationGrants ?? [], []);
  });

  it('enforces ordered cross-faction grant chains within one event resolution', () => {
    const def = createDef();
    const start = initialState(def, 26, 4);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-7', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {} }).state;
    assert.equal(second.activePlayer, asPlayerId(2));

    const nvaMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(
      nvaMoves.some((move) => move.freeOperation === true),
      false,
      'NVA free operation should stay locked until the earlier VC sequence step is consumed',
    );
  });

  it('enforces Cambodia-only free-operation grants across discovery, decision flow, and final apply', () => {
    const def = createZoneFilteredDef();
    const start = initialState(def, 11, 3);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-75-like', side: 'unshaded', branch: 'none' },
    }).state;
    const second = applyMove(def, first, { actionId: asActionId('operation'), params: { 'decision:$zone': 'board:cambodia' } }).state;
    assert.equal(second.activePlayer, asPlayerId(2));

    const operationMoves = legalMoves(def, second).filter((move) => String(move.actionId) === 'operation');
    assert.equal(operationMoves.some((move) => move.freeOperation === true), true);

    assert.throws(
      () =>
        applyMove(def, second, {
          actionId: asActionId('operation'),
          params: { 'decision:$zone': 'board:vietnam' },
          freeOperation: true,
        }),
      (error: unknown) =>
        error instanceof Error &&
        'reason' in error &&
        (error as { reason?: string }).reason === 'free operation is not granted in current state',
    );

    const third = applyMove(def, second, {
      actionId: asActionId('operation'),
      params: { 'decision:$zone': 'board:cambodia' },
      freeOperation: true,
    }).state;
    assert.deepEqual(requireCardDrivenRuntime(third).pendingFreeOperationGrants ?? [], []);
  });

  it('applies free-operation grants with executeAsFaction using the overridden action profile', () => {
    const def = createExecuteAsFactionDef();
    const start = initialState(def, 33, 2);

    const first = applyMove(def, start, {
      actionId: asActionId('event'),
      params: { eventCardId: 'card-8', side: 'unshaded', branch: 'none' },
    }).state;
    assert.equal(first.activePlayer, asPlayerId(1));

    const operationMoves = legalMoves(def, first).filter((move) => String(move.actionId) === 'operation');
    assert.equal(operationMoves.some((move) => move.freeOperation === true), true);

    const second = applyMove(def, first, { actionId: asActionId('operation'), params: {}, freeOperation: true }).state;
    assert.equal(second.globalVars.executeAsMarker, 100);
    assert.deepEqual(requireCardDrivenRuntime(second).pendingFreeOperationGrants ?? [], []);
  });
});
