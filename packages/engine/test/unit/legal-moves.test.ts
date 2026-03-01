import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  legalChoicesDiscover,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import { applyTurnFlowWindowFilters } from '../../src/kernel/legal-moves-turn-order.js';
import { resolveTurnFlowActionClass } from '../../src/kernel/turn-flow-eligibility.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'legal-moves-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
      { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('other') }] },
    actions: [
      {
        id: asActionId('wrongPhase'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('other')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('wrongActor'),
actor: { id: asPlayerId(1) },
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('limitedTurn'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [{ scope: 'turn', max: 1 }],
      },
      {
        id: asActionId('comboPre'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [
          { name: 'n', domain: { query: 'intsInRange', min: 1, max: 2 } },
          { name: 'c', domain: { query: 'enums', values: ['x', 'y'] } },
        ],
        pre: { op: '==', left: { ref: 'binding', name: 'n' }, right: 1 },
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('invalidExecutorForPlayerCount'),
actor: 'active',
executor: { id: asPlayerId(2) },
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('invalidActorForPlayerCount'),
actor: { id: asPlayerId(2) },
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('dependentDomain'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [
          { name: '$owner', domain: { query: 'players' } },
          { name: 'zone', domain: { query: 'zones', filter: { owner: { chosen: '$owner' } } } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const createState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [],
    'hand:0': [],
    'hand:1': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {
    limitedTurn: { turnCount: 1, phaseCount: 0, gameCount: 0 },
  },
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

function expectedMoves(): readonly Move[] {
  return [
    { actionId: asActionId('comboPre'), params: { n: 1, c: 'x' } },
    { actionId: asActionId('comboPre'), params: { n: 1, c: 'y' } },
    { actionId: asActionId('dependentDomain'), params: { $owner: asPlayerId(0), zone: asZoneId('hand:0') } },
    { actionId: asActionId('dependentDomain'), params: { $owner: asPlayerId(1), zone: asZoneId('hand:1') } },
  ];
}

describe('legalMoves', () => {
  it('excludes phase/actor/limit mismatches and includes only precondition-valid combinations in deterministic order', () => {
    const moves = legalMoves(createDef(), createState());
    assert.deepEqual(moves, expectedMoves());
  });

  it('returns empty list when no actions are legal', () => {
    const state = createState();
    const noPhaseState: GameState = { ...state, currentPhase: asPhaseId('missing') };

    assert.deepEqual(legalMoves(createDef(), noPhaseState), []);
  });

  it('returns identical ordering for identical state snapshots', () => {
    const def = createDef();
    const state = createState();
    const first = legalMoves(def, state);
    const second = legalMoves(def, state);

    assert.deepEqual(first, second);
  });

  it('enumerates params from dynamic intsInRange bounds', () => {
    const base = createDef();
    const def: GameDef = {
      ...base,
      actions: [
        ...base.actions,
        {
          id: asActionId('dynamicRange'),
          actor: 'active',
          executor: 'actor',
          phase: [asPhaseId('main')],
          params: [
            { name: 'base', domain: { query: 'intsInRange', min: 1, max: 1 } },
            {
              name: 'amount',
              domain: {
                query: 'intsInRange',
                min: { ref: 'binding', name: 'base' },
                max: { op: '+', left: { ref: 'binding', name: 'base' }, right: 1 },
              },
            },
          ],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    };

    const moves = legalMoves(def, createState())
      .filter((move) => move.actionId === asActionId('dynamicRange'))
      .map((move) => move.params);

    assert.deepEqual(moves, [
      { base: 1, amount: 1 },
      { base: 1, amount: 2 },
    ]);
  });

  it('materializes move params in declaration key order', () => {
    const moves = legalMoves(createDef(), createState());
    const combo = moves.find((move) => move.actionId === asActionId('comboPre'));
    const dependent = moves.find((move) => move.actionId === asActionId('dependentDomain'));

    assert.deepEqual(Object.keys(combo?.params ?? {}), ['n', 'c']);
    assert.deepEqual(Object.keys(dependent?.params ?? {}), ['$owner', 'zone']);
  });

  it('returns no legal moves when active faction is not a current turnFlow candidate', () => {
    const state: GameState = {
      ...createState(),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
        seatOrder: ['0', '1', '2'],
        eligibility: { '0': true, '1': true, '2': true },
        currentCard: {
          firstEligible: '1',
          secondEligible: '2',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingEligibilityOverrides: [],
        },
      },
    };

    assert.deepEqual(legalMoves(createDef(), state), []);
  });

  it('throws runtime contract error for invalid pending deferred actorPlayer in card-driven runtime state', () => {
    const state: GameState = {
      ...createState(),
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
          pendingDeferredEventEffects: [
            {
              deferredId: 'deferred-invalid',
              requiredGrantBatchIds: [],
              effects: [],
              moveParams: {},
              actorPlayer: 2,
              actionId: 'wrongActor',
            },
          ],
        },
      },
    };

    assert.throws(
      () => legalMoves(createDef(), state),
      (error: unknown) => {
        const details = error as { readonly code?: string; readonly message?: string };
        assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
        assert.match(String(details.message), /pendingDeferredEventEffects\[0\]\.actorPlayer out of range/);
        return true;
      },
    );
  });

  it('skips actions whose fixed executor is outside current playerCount', () => {
    assert.doesNotThrow(() => legalMoves(createDef(), createState()));
    assert.deepEqual(legalMoves(createDef(), createState()), expectedMoves());
  });

  it('surfaces invalid executor specs instead of silently skipping them', () => {
    const base = createDef();
    const def: GameDef = {
      ...base,
      actions: [
        {
          id: asActionId('badExecutorCardinality'),
          actor: 'active',
          executor: 'all' as unknown as GameDef['actions'][number]['executor'],
          phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    };

    assert.throws(
      () => legalMoves(def, createState()),
      /legalMoves: invalid executor selector/,
    );
  });

  it('surfaces invalid actor specs instead of silently skipping them', () => {
    const base = createDef();
    const def: GameDef = {
      ...base,
      actions: [
        {
          id: asActionId('badActorBinding'),
          actor: '$owner' as unknown as GameDef['actions'][number]['actor'],
          executor: 'actor',
          phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    };

    assert.throws(
      () => legalMoves(def, createState()),
      /legalMoves: invalid actor selector/,
    );
  });

  it('applies option matrix gating to the second eligible faction after a first event action', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-matrix-event', players: { min: 3, max: 3 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1', '2'], overrideWindows: [] },
            actionClassByActionId: {
              pass: 'pass',
              event: 'event',
              operation: 'operation',
              limitedOperation: 'limitedOperation',
              operationPlusSpecialActivity: 'operationPlusSpecialActivity',
            },
            optionMatrix: [{ first: 'event', second: ['operation', 'operationPlusSpecialActivity'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('limitedOperation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('operationPlusSpecialActivity'),
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
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      playerCount: 3,
      activePlayer: asPlayerId(1),
      actionUsage: {},
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
          firstActionClass: 'event',
        },
        pendingEligibilityOverrides: [],
        },
      },
    };

    // operation-class action gets variants for both compatible constrained classes
    assert.deepEqual(
      legalMoves(def, state).map((move) => move.actionId),
      [asActionId('pass'), asActionId('operation'), asActionId('operation'), asActionId('operationPlusSpecialActivity')],
    );
  });

  it('allows only limited operations as second action when first-action class is operation', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-matrix-operation', players: { min: 3, max: 3 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1', '2'], overrideWindows: [] },
            actionClassByActionId: {
              pass: 'pass',
              event: 'event',
              operation: 'operation',
              limitedOperation: 'limitedOperation',
            },
            optionMatrix: [{ first: 'operation', second: ['limitedOperation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('limitedOperation'),
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
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      playerCount: 3,
      activePlayer: asPlayerId(1),
      actionUsage: {},
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
    };

    // operation-class action also gets a limitedOperation variant
    assert.deepEqual(legalMoves(def, state).map((move) => move.actionId), [asActionId('pass'), asActionId('operation'), asActionId('limitedOperation')]);
  });

  it('resolves card-driven action class from turnFlow.actionClassByActionId even when move.actionClass conflicts', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-class-authority', players: { min: 3, max: 3 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1', '2'], overrideWindows: [] },
            actionClassByActionId: {
              operation: 'operation',
              limitedOperation: 'limitedOperation',
              pass: 'pass',
            },
            optionMatrix: [{ first: 'operation', second: ['limitedOperation'] }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    } as unknown as GameDef;

    const resolved = resolveTurnFlowActionClass(def, {
      actionId: asActionId('operation'),
      params: {},
      actionClass: 'limitedOperation',
    });

    assert.equal(resolved, 'operation');
  });

  it('applies monsoon action restrictions and pivotal override metadata when lookahead is coup', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-monsoon-windows', players: { min: 2, max: 2 } },
      zones: [
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            monsoon: {
              restrictedActions: [
                { actionId: 'sweep' },
                { actionId: 'airLift', maxParam: { name: 'spaces', max: 2 } },
              ],
              blockPivotal: true,
              pivotalOverrideToken: 'monsoonPivotalAllowed',
            },
            pivotal: {
              actionIds: ['pivotalEvent'],
            },
          },
        },
      },
      tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('sweep'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('airLift'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [{ name: 'spaces', domain: { query: 'intsInRange', min: 1, max: 3 } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalEvent'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [
            {
              name: 'override',
              domain: { query: 'enums', values: ['none', 'monsoonPivotalAllowed'] },
            },
          ],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      zones: {
        'played:none': [],
        'lookahead:none': [{ id: asTokenId('tok_coup'), type: 'card', props: { isCoup: true } }],
        'leader:none': [],
      },
      actionUsage: {},
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
        },
      },
    };

    assert.deepEqual(legalMoves(def, state), [
      { actionId: asActionId('pass'), params: {} },
      { actionId: asActionId('airLift'), params: { spaces: 1 } },
      { actionId: asActionId('airLift'), params: { spaces: 2 } },
      { actionId: asActionId('pivotalEvent'), params: { override: 'monsoonPivotalAllowed' } },
    ]);
  });

  it('supports monsoon maxParamsTotal restrictions across multiple move params', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-monsoon-multi-param-cap', players: { min: 2, max: 2 } },
      zones: [
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            monsoon: {
              restrictedActions: [
                {
                  actionId: 'airStrike',
                  maxParam: { name: 'spaces', max: 2 },
                  maxParamsTotal: { names: ['spaces', '$bonusSpaces'], max: 2 },
                },
              ],
              blockPivotal: true,
            },
          },
        },
      },
      tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('airStrike'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [
            { name: 'spaces', domain: { query: 'intsInRange', min: 1, max: 2 } },
            { name: '$bonusSpaces', domain: { query: 'intsInRange', min: 0, max: 1 } },
          ],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      zones: {
        'played:none': [],
        'lookahead:none': [{ id: asTokenId('tok_coup'), type: 'card', props: { isCoup: true } }],
        'leader:none': [],
      },
      actionUsage: {},
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
        },
      },
    };

    assert.deepEqual(legalMoves(def, state), [
      { actionId: asActionId('pass'), params: {} },
      { actionId: asActionId('airStrike'), params: { spaces: 1, $bonusSpaces: 0 } },
      { actionId: asActionId('airStrike'), params: { spaces: 1, $bonusSpaces: 1 } },
      { actionId: asActionId('airStrike'), params: { spaces: 2, $bonusSpaces: 0 } },
    ]);
  });

  it('counts array-valued params in monsoon maxParamsTotal restrictions', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-monsoon-array-param-cap', players: { min: 2, max: 2 } },
      zones: [
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            monsoon: {
              restrictedActions: [
                {
                  actionId: 'airStrike',
                  maxParamsTotal: { names: ['spaces', '$bonusSpaces'], max: 2 },
                },
              ],
              blockPivotal: true,
            },
          },
        },
      },
      tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('airStrike'),
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
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      zones: {
        'played:none': [],
        'lookahead:none': [{ id: asTokenId('tok_coup'), type: 'card', props: { isCoup: true } }],
        'leader:none': [],
      },
      actionUsage: {},
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
        },
      },
    };

    const filtered = applyTurnFlowWindowFilters(def, state, [
      { actionId: asActionId('pass'), params: {} },
      { actionId: asActionId('airStrike'), params: { spaces: ['a'], $bonusSpaces: ['b'] } },
      { actionId: asActionId('airStrike'), params: { spaces: ['a', 'b'], $bonusSpaces: [] } },
      { actionId: asActionId('airStrike'), params: { spaces: ['a', 'b'], $bonusSpaces: ['c'] } },
    ]);

    assert.deepEqual(filtered, [
      { actionId: asActionId('pass'), params: {} },
      { actionId: asActionId('airStrike'), params: { spaces: ['a'], $bonusSpaces: ['b'] } },
      { actionId: asActionId('airStrike'), params: { spaces: ['a', 'b'], $bonusSpaces: [] } },
    ]);
  });

  it('enforces pivotal interrupt precedence against current first/second candidates', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-pivotal-precedence', players: { min: 2, max: 2 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            pivotal: {
              actionIds: ['pivotalA', 'pivotalB'],
              interrupt: {
                precedence: ['1', '0'],
              },
            },
          },
        },
      },
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalA'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('operate'),
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
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      actionUsage: {},
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
        },
      },
    };

    assert.deepEqual(legalMoves(def, state), [
      { actionId: asActionId('pass'), params: {} },
      { actionId: asActionId('operate'), params: {} },
    ]);
  });

  it('applies deterministic pivotal cancellation after restriction filtering', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-pivotal-cancellation', players: { min: 2, max: 2 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            pivotal: {
              actionIds: ['pivotalA', 'pivotalB'],
              interrupt: {
                precedence: ['1', '0'],
                cancellation: [
                  {
                    winner: { actionId: 'pivotalA' },
                    canceled: { actionId: 'pivotalB' },
                  },
                ],
              },
            },
          },
        },
      },
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalA'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalB'),
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
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      activePlayer: asPlayerId(1),
      actionUsage: {},
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
        seatOrder: ['0', '1'],
        eligibility: { '0': true, '1': true },
        currentCard: {
          firstEligible: '1',
          secondEligible: '0',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingEligibilityOverrides: [],
        },
      },
    };

    assert.deepEqual(legalMoves(def, state), [
      { actionId: asActionId('pass'), params: {} },
      { actionId: asActionId('pivotalA'), params: {} },
    ]);
  });

  it('supports event-card-tag cancellation selectors for interrupt windows', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-pivotal-card-tag-cancellation', players: { min: 2, max: 2 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'], overrideWindows: [] },
            optionMatrix: [],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
            pivotal: {
              actionIds: ['pivotalEvent'],
              interrupt: {
                precedence: ['1', '0'],
                cancellation: [
                  {
                    winner: {
                      actionId: 'pivotalEvent',
                      eventCardTagsAll: ['pivotal', 'VC'],
                    },
                    canceled: {
                      actionId: 'pivotalEvent',
                      eventCardTagsAll: ['pivotal', 'US'],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      eventDecks: [
        {
          id: 'pivotal-deck',
          drawZone: 'deck:none',
          discardZone: 'discard:none',
          shuffleOnSetup: false,
          cards: [
            { id: 'piv-us', title: 'US Pivotal', sideMode: 'single', tags: ['pivotal', 'US'], unshaded: { text: 'x' } },
            { id: 'piv-vc', title: 'VC Pivotal', sideMode: 'single', tags: ['pivotal', 'VC'], unshaded: { text: 'x' } },
          ],
        },
      ],
      actions: [
        {
          id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalEvent'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
          params: [
            { name: 'eventCardId', domain: { query: 'enums', values: ['piv-us', 'piv-vc'] } },
          ],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      activePlayer: asPlayerId(1),
      actionUsage: {},
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '1',
            secondEligible: '0',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
        },
      },
    };

    assert.deepEqual(legalMoves(def, state), [
      { actionId: asActionId('pass'), params: {} },
      { actionId: asActionId('pivotalEvent'), params: { eventCardId: 'piv-vc' } },
    ]);
  });

  it('emits free-operation template variants before zone decisions are bound when grant action/faction matches', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'free-op-template-zone-filter-discovery', players: { min: 2, max: 2 } },
      zones: [
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
      ],
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
      actions: [
        {
          id: asActionId('operation'),
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
      actionPipelines: [
        {
          id: 'operationPipeline',
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
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      zones: {
        'board:cambodia': [],
        'board:vietnam': [],
      },
      actionUsage: {},
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
                left: { ref: 'zoneProp', zone: '$zone', prop: 'country' },
                right: 'cambodia',
              },
              remainingUses: 1,
            },
          ],
        },
      },
    };

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.equal(moves.some((move) => move.freeOperation === true), true);
    assert.equal(moves.some((move) => move.freeOperation !== true), true);
  });

  it('does not emit free-operation variants when a matching grant is sequence-locked behind an inapplicable earlier step', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'free-op-template-sequence-lock', players: { min: 2, max: 2 } },
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
      actions: [
        {
          id: asActionId('operation'),
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
    } as unknown as GameDef;

    const state: GameState = {
      ...createState(),
      actionUsage: {},
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
              grantId: 'grant-step-0',
              seat: '0',
              operationClass: 'limitedOperation',
              actionIds: ['operation'],
              remainingUses: 1,
              sequenceBatchId: 'batch:chain',
              sequenceIndex: 0,
            },
            {
              grantId: 'grant-step-1',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              remainingUses: 1,
              sequenceBatchId: 'batch:chain',
              sequenceIndex: 1,
            },
          ],
        },
      },
    };

    const moves = legalMoves(def, state).filter((move) => String(move.actionId) === 'operation');
    assert.equal(moves.some((move) => move.freeOperation === true), false);
    assert.equal(moves.some((move) => move.freeOperation !== true), true);
  });

  it('enumerates dual-use event side/branch selections deterministically for any active faction', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'dual-use-event-selection-order', players: { min: 2, max: 2 } },
      zones: [
        { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      actions: [
        {
          id: asActionId('event'),
capabilities: ['cardEvent'],
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
      eventDecks: [
        {
          id: 'deck-1',
          drawZone: asZoneId('deck:none'),
          discardZone: asZoneId('played:none'),
          cards: [
            {
              id: 'card-1',
              title: 'Card 1',
              sideMode: 'dual',
              unshaded: { effects: [], branches: [{ id: 'a' }, { id: 'b' }] },
              shaded: { effects: [], branches: [{ id: 'a' }, { id: 'b' }] },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const expected: readonly Move[] = [
      {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-1', eventDeckId: 'deck-1', side: 'unshaded', branch: 'a' },
      },
      {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-1', eventDeckId: 'deck-1', side: 'unshaded', branch: 'b' },
      },
      {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-1', eventDeckId: 'deck-1', side: 'shaded', branch: 'a' },
      },
      {
        actionId: asActionId('event'),
        params: { eventCardId: 'card-1', eventDeckId: 'deck-1', side: 'shaded', branch: 'b' },
      },
    ];

    const activeZero = legalMoves(def, {
      ...createState(),
      activePlayer: asPlayerId(0),
      actionUsage: {},
      zones: {
        'deck:none': [],
        'played:none': [{ id: asTokenId('card-1'), type: 'card', props: {} }],
      },
    });
    const activeOne = legalMoves(def, {
      ...createState(),
      activePlayer: asPlayerId(1),
      actionUsage: {},
      zones: {
        'deck:none': [],
        'played:none': [{ id: asTokenId('card-1'), type: 'card', props: {} }],
      },
    });

    assert.deepEqual(activeZero, expected);
    assert.deepEqual(activeOne, expected);
  });

  it('does not route event-card side/branch discovery by misleading action id without cardEvent capability', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'misleading-event-id-without-capability', players: { min: 2, max: 2 } },
      zones: [
        { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      actions: [
        {
          id: asActionId('event'),
          actor: 'active',
          executor: 'actor',
          phase: [asPhaseId('main')],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('resolveCard'),
          capabilities: ['cardEvent'],
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
      eventDecks: [
        {
          id: 'deck-1',
          drawZone: asZoneId('deck:none'),
          discardZone: asZoneId('played:none'),
          cards: [
            {
              id: 'card-1',
              title: 'Card 1',
              sideMode: 'dual',
              unshaded: { effects: [], branches: [{ id: 'a' }] },
              shaded: { effects: [], branches: [{ id: 'a' }] },
            },
          ],
        },
      ],
    } as unknown as GameDef;

    const moves = legalMoves(def, {
      ...createState(),
      zones: {
        'deck:none': [],
        'played:none': [{ id: asTokenId('card-1'), type: 'card', props: {} }],
      },
    });
    assert.equal(moves.some((move) => String(move.actionId) === 'event' && move.params.side !== undefined), false);
    assert.equal(moves.some((move) => String(move.actionId) === 'resolveCard' && move.params.side === 'unshaded'), true);
  });

  it('keeps distributeTokens decision flow consistent across legalMoves, legalChoicesDiscover, and applyMove', () => {
    const compiled = compileGameSpecToGameDef({
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'legal-moves-distribute-parity', players: { min: 1, max: 1 } },
      zones: [
        { id: 'source', owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: 'left', owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: 'right', owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
      tokenTypes: [{ id: 'piece', props: {} }],
      turnStructure: { phases: [{ id: 'main' }] },
      terminal: { conditions: [] },
      actions: [
        {
          id: 'distribute',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [
            {
              distributeTokens: {
                tokens: { query: 'tokensInZone', zone: 'source' },
                destinations: { query: 'zones' },
                n: 1,
              },
            },
          ],
          limits: [],
        },
      ],
    });

    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.ok(compiled.gameDef !== null);
    if (compiled.gameDef === null) {
      return;
    }

    const def = compiled.gameDef;
    const state: GameState = {
      globalVars: {},
      perPlayerVars: {},
      zoneVars: {},
      playerCount: 1,
      zones: {
        'source:none': [{ id: asTokenId('tok-1'), type: 'piece', props: {} }],
        'left:none': [],
        'right:none': [],
      },
      nextTokenOrdinal: 1,
      currentPhase: asPhaseId('main'),
      activePlayer: asPlayerId(0),
      turnCount: 0,
      rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [3n, 7n] },
      stateHash: 0n,
      actionUsage: {},
      turnOrderState: { type: 'roundRobin' },
      markers: {},
    };

    const template = legalMoves(def, state).find((move) => move.actionId === asActionId('distribute'));
    assert.deepEqual(template, { actionId: asActionId('distribute'), params: {} });

    const firstChoice = legalChoicesDiscover(def, state, template!);
    assert.equal(firstChoice.kind, 'pending');
    if (firstChoice.kind !== 'pending') {
      return;
    }
    assert.equal(firstChoice.decisionId, 'decision:doc.actions.0.effects.0.distributeTokens.selectTokens');

    const withTokens: Move = {
      ...template!,
      params: {
        ...template!.params,
        'decision:doc.actions.0.effects.0.distributeTokens.selectTokens': ['tok-1'],
      },
    };
    const secondChoice = legalChoicesDiscover(def, state, withTokens);
    assert.equal(secondChoice.kind, 'pending');
    if (secondChoice.kind !== 'pending') {
      return;
    }
    assert.equal(secondChoice.decisionId, 'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination[0]');

    const applied = applyMove(def, state, {
      ...withTokens,
      params: {
        ...withTokens.params,
        'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination[0]': 'right:none',
      },
    });

    assert.deepEqual(applied.state.zones['source:none'], []);
    assert.deepEqual(applied.state.zones['right:none']?.map((entry) => entry.id), [asTokenId('tok-1')]);
  });
});
