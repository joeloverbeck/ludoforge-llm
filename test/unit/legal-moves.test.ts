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
});
