import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  computeFullHash,
  createZobristTable,
  type GameDef,
  type GameState,
  updateHashFeatureChange,
  updateHashTokenPlacement,
} from '../../src/kernel/index.js';

const createGameDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-hash-updates', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'energy', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
    zones: [
      {
        id: 'deck:none',
        owner: 'none',
        visibility: 'hidden',
        ordering: 'stack',
      },
      {
        id: 'hand:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'queue',
      },
    ],
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [],
    turnStructure: {
      phases: [{ id: 'draw' }, { id: 'main' }],
      activePlayerOrder: 'roundRobin',
    },
    actions: [
      {
        id: 'playCard',
        actor: 'active',
        phase: 'main',
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    endConditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
  }) as unknown as GameDef;

const createBaseState = (): GameState => ({
  globalVars: { energy: 2 },
  perPlayerVars: {
    '0': { score: 3 },
    '1': { score: 1 },
  },
  playerCount: 2,
  zones: {
    'deck:none': [
      { id: asTokenId('t-1'), type: 'card', props: {} },
      { id: asTokenId('t-2'), type: 'card', props: {} },
    ],
    'hand:none': [{ id: asTokenId('t-3'), type: 'card', props: {} }],
  },
  currentPhase: asPhaseId('draw'),
  activePlayer: asPlayerId(0),
  turnCount: 5,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {
    playCard: { turnCount: 1, phaseCount: 2, gameCount: 4 },
  },
});

describe('zobrist full hash and incremental update helpers', () => {
  it('token placement incremental update matches full recomputation', () => {
    const table = createZobristTable(createGameDef());
    const before = createBaseState();
    const beforeHash = computeFullHash(table, before);

    const after: GameState = {
      ...before,
      zones: {
        ...before.zones,
        'deck:none': [before.zones['deck:none']?.[0]].filter((token) => token !== undefined),
        'hand:none': [before.zones['hand:none']?.[0], before.zones['deck:none']?.[1]].filter((token) => token !== undefined),
      },
    };

    const movedToken = before.zones['deck:none']?.[1];
    assert.ok(movedToken);

    const incremental = updateHashTokenPlacement(
      beforeHash,
      table,
      movedToken.id,
      asZoneId('deck:none'),
      1,
      asZoneId('hand:none'),
      1,
    );
    const recomputed = computeFullHash(table, after);

    assert.equal(incremental, recomputed);
  });

  it('variable feature updates match full recomputation', () => {
    const table = createZobristTable(createGameDef());
    const before = createBaseState();

    let incremental = computeFullHash(table, before);
    incremental = updateHashFeatureChange(
      incremental,
      table,
      { kind: 'globalVar', varName: 'energy', value: 2 },
      { kind: 'globalVar', varName: 'energy', value: 5 },
    );
    incremental = updateHashFeatureChange(
      incremental,
      table,
      { kind: 'perPlayerVar', playerId: asPlayerId(1), varName: 'score', value: 1 },
      { kind: 'perPlayerVar', playerId: asPlayerId(1), varName: 'score', value: 4 },
    );

    const after: GameState = {
      ...before,
      globalVars: { ...before.globalVars, energy: 5 },
      perPlayerVars: {
        ...before.perPlayerVars,
        '1': { ...before.perPlayerVars['1'], score: 4 },
      },
    };

    assert.equal(incremental, computeFullHash(table, after));
  });

  it('metadata updates (active player, phase, turn, action usage) match recomputation', () => {
    const table = createZobristTable(createGameDef());
    const before = createBaseState();
    const playCardUsage = before.actionUsage.playCard;
    assert.ok(playCardUsage);

    let incremental = computeFullHash(table, before);
    incremental = updateHashFeatureChange(
      incremental,
      table,
      { kind: 'activePlayer', playerId: asPlayerId(0) },
      { kind: 'activePlayer', playerId: asPlayerId(1) },
    );
    incremental = updateHashFeatureChange(
      incremental,
      table,
      { kind: 'currentPhase', phaseId: asPhaseId('draw') },
      { kind: 'currentPhase', phaseId: asPhaseId('main') },
    );
    incremental = updateHashFeatureChange(
      incremental,
      table,
      { kind: 'turnCount', value: 5 },
      { kind: 'turnCount', value: 6 },
    );
    incremental = updateHashFeatureChange(
      incremental,
      table,
      { kind: 'actionUsage', actionId: asActionId('playCard'), scope: 'turn', count: 1 },
      { kind: 'actionUsage', actionId: asActionId('playCard'), scope: 'turn', count: 2 },
    );

    const after: GameState = {
      ...before,
      activePlayer: asPlayerId(1),
      currentPhase: asPhaseId('main'),
      turnCount: 6,
      actionUsage: {
        ...before.actionUsage,
        playCard: {
          phaseCount: playCardUsage.phaseCount,
          gameCount: playCardUsage.gameCount,
          turnCount: 2,
        },
      },
    };

    const recomputed = computeFullHash(table, after);
    assert.notEqual(recomputed, computeFullHash(table, before));
    assert.equal(incremental, recomputed);
  });

  it('different transition paths to the same final state produce the same hash', () => {
    const table = createZobristTable(createGameDef());
    const before = createBaseState();
    const baseHash = computeFullHash(table, before);

    let pathOneHash = updateHashFeatureChange(
      baseHash,
      table,
      { kind: 'globalVar', varName: 'energy', value: 2 },
      { kind: 'globalVar', varName: 'energy', value: 5 },
    );
    pathOneHash = updateHashFeatureChange(
      pathOneHash,
      table,
      { kind: 'activePlayer', playerId: asPlayerId(0) },
      { kind: 'activePlayer', playerId: asPlayerId(1) },
    );

    let pathTwoHash = updateHashFeatureChange(
      baseHash,
      table,
      { kind: 'activePlayer', playerId: asPlayerId(0) },
      { kind: 'activePlayer', playerId: asPlayerId(1) },
    );
    pathTwoHash = updateHashFeatureChange(
      pathTwoHash,
      table,
      { kind: 'globalVar', varName: 'energy', value: 2 },
      { kind: 'globalVar', varName: 'energy', value: 5 },
    );

    const finalHash = computeFullHash(table, {
      ...before,
      globalVars: { ...before.globalVars, energy: 5 },
      activePlayer: asPlayerId(1),
    });
    assert.equal(pathOneHash, finalHash);
    assert.equal(pathTwoHash, finalHash);
  });

  it('zone order differences produce different hashes', () => {
    const table = createZobristTable(createGameDef());
    const base = createBaseState();

    const swapped: GameState = {
      ...base,
      zones: {
        ...base.zones,
        'deck:none': [
          base.zones['deck:none']?.[1],
          base.zones['deck:none']?.[0],
        ].filter((token) => token !== undefined),
      },
    };

    assert.notEqual(computeFullHash(table, base), computeFullHash(table, swapped));
  });

  it('same-type tokens with distinct IDs do not cancel hash contribution', () => {
    const table = createZobristTable(createGameDef());

    const base = createBaseState();
    const oneToken: GameState = {
      ...base,
      zones: {
        ...base.zones,
        'deck:none': [{ id: asTokenId('t-1'), type: 'card', props: {} }],
        'hand:none': [],
      },
    };
    const twoTokens: GameState = {
      ...base,
      zones: {
        ...base.zones,
        'deck:none': [
          { id: asTokenId('t-1'), type: 'card', props: {} },
          { id: asTokenId('t-2'), type: 'card', props: {} },
        ],
        'hand:none': [],
      },
    };

    assert.notEqual(computeFullHash(table, oneToken), computeFullHash(table, twoTokens));
  });
});
