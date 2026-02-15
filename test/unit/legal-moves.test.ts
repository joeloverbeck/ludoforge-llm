import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'legal-moves-test', players: { min: 2, max: 2 } },
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
        phase: asPhaseId('other'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('wrongActor'),
        actor: { id: asPlayerId(1) },
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('limitedTurn'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [{ scope: 'turn', max: 1 }],
      },
      {
        id: asActionId('comboPre'),
        actor: 'active',
        phase: asPhaseId('main'),
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
        id: asActionId('dependentDomain'),
        actor: 'active',
        phase: asPhaseId('main'),
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
        factionOrder: ['0', '1', '2'],
        eligibility: { '0': true, '1': true, '2': true },
        currentCard: {
          firstEligible: '1',
          secondEligible: '2',
          actedFactions: [],
          passedFactions: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingEligibilityOverrides: [],
        },
      },
    };

    assert.deepEqual(legalMoves(createDef(), state), []);
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
            eligibility: { factions: ['0', '1', '2'], overrideWindows: [] },
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('event'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
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
        {
          id: asActionId('limitedOperation'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('operationPlusSpecialActivity'),
          actor: 'active',
          phase: asPhaseId('main'),
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
        factionOrder: ['0', '1', '2'],
        eligibility: { '0': true, '1': true, '2': true },
        currentCard: {
          firstEligible: '1',
          secondEligible: '2',
          actedFactions: ['0'],
          passedFactions: [],
          nonPassCount: 1,
          firstActionClass: 'event',
        },
        pendingEligibilityOverrides: [],
        },
      },
    };

    assert.deepEqual(
      legalMoves(def, state).map((move) => move.actionId),
      [asActionId('pass'), asActionId('operation'), asActionId('operationPlusSpecialActivity')],
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
            eligibility: { factions: ['0', '1', '2'], overrideWindows: [] },
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('event'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
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
        {
          id: asActionId('limitedOperation'),
          actor: 'active',
          phase: asPhaseId('main'),
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
        factionOrder: ['0', '1', '2'],
        eligibility: { '0': true, '1': true, '2': true },
        currentCard: {
          firstEligible: '1',
          secondEligible: '2',
          actedFactions: ['0'],
          passedFactions: [],
          nonPassCount: 1,
          firstActionClass: 'operation',
        },
        pendingEligibilityOverrides: [],
        },
      },
    };

    assert.deepEqual(legalMoves(def, state).map((move) => move.actionId), [asActionId('pass'), asActionId('limitedOperation')]);
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
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('sweep'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('airLift'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [{ name: 'spaces', domain: { query: 'intsInRange', min: 1, max: 3 } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalEvent'),
          actor: 'active',
          phase: asPhaseId('main'),
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

  it('enforces pivotal interrupt precedence against current first/second candidates', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-pivotal-precedence', players: { min: 2, max: 2 } },
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalA'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('operate'),
          actor: 'active',
          phase: asPhaseId('main'),
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
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalA'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalB'),
          actor: 'active',
          phase: asPhaseId('main'),
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
        factionOrder: ['0', '1'],
        eligibility: { '0': true, '1': true },
        currentCard: {
          firstEligible: '1',
          secondEligible: '0',
          actedFactions: [],
          passedFactions: [],
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
            eligibility: { factions: ['0', '1'], overrideWindows: [] },
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
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: asActionId('pivotalEvent'),
          actor: 'active',
          phase: asPhaseId('main'),
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
          factionOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '1',
            secondEligible: '0',
            actedFactions: [],
            passedFactions: [],
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
      zones: [
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set' },
      ],
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
      actions: [
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

  it('enumerates dual-use event side/branch selections deterministically for any active faction', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'dual-use-event-selection-order', players: { min: 2, max: 2 } },
      actions: [
        {
          id: asActionId('event'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [
            { name: 'side', domain: { query: 'enums', values: ['unshaded', 'shaded'] } },
            { name: 'branch', domain: { query: 'enums', values: ['a', 'b'] } },
          ],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    } as unknown as GameDef;

    const expected: readonly Move[] = [
      { actionId: asActionId('event'), params: { side: 'unshaded', branch: 'a' } },
      { actionId: asActionId('event'), params: { side: 'unshaded', branch: 'b' } },
      { actionId: asActionId('event'), params: { side: 'shaded', branch: 'a' } },
      { actionId: asActionId('event'), params: { side: 'shaded', branch: 'b' } },
    ];

    const activeZero = legalMoves(def, { ...createState(), activePlayer: asPlayerId(0), actionUsage: {} });
    const activeOne = legalMoves(def, { ...createState(), activePlayer: asPlayerId(1), actionUsage: {} });

    assert.deepEqual(activeZero, expected);
    assert.deepEqual(activeOne, expected);
  });
});
