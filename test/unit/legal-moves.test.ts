import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
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
    turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('other') }], activePlayerOrder: 'roundRobin' },
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
    endConditions: [],
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
      turnFlow: {
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
      },
    };

    assert.deepEqual(legalMoves(createDef(), state), []);
  });

  it('applies option matrix gating to the second eligible faction after a first event action', () => {
    const def: GameDef = {
      ...createDef(),
      metadata: { id: 'turnflow-matrix-event', players: { min: 3, max: 3 } },
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: { factions: ['0', '1', '2'], overrideWindows: [] },
        optionMatrix: [{ first: 'event', second: ['operation', 'operationPlusSpecialActivity'] }],
        passRewards: [],
        durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
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
      turnFlow: {
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
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: { factions: ['0', '1', '2'], overrideWindows: [] },
        optionMatrix: [{ first: 'operation', second: ['limitedOperation'] }],
        passRewards: [],
        durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
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
      turnFlow: {
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
      },
    };

    assert.deepEqual(legalMoves(def, state).map((move) => move.actionId), [asActionId('pass'), asActionId('limitedOperation')]);
  });
});
