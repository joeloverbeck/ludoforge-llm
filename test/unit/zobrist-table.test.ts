import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createZobristTable,
  type GameDef,
  zobristKey,
} from '../../src/kernel/index.js';

const createBaseGameDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-test', players: { min: 2, max: 4 } },
    constants: {},
    globalVars: [
      { name: 'energy', type: 'int', init: 0, min: 0, max: 10 },
      { name: 'rounds', type: 'int', init: 1, min: 1, max: 99 },
    ],
    perPlayerVars: [
      { name: 'health', type: 'int', init: 5, min: 0, max: 10 },
      { name: 'score', type: 'int', init: 0, min: 0, max: 99 },
    ],
    zones: [
      {
        id: 'deck:none',
        owner: 'none',
        visibility: 'hidden',
        ordering: 'stack',
        adjacentTo: ['discard:none', 'table:none'],
      },
      {
        id: 'table:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'queue',
        adjacentTo: ['deck:none'],
      },
      {
        id: 'discard:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        adjacentTo: ['deck:none'],
      },
    ],
    tokenTypes: [
      { id: 'card', props: { cost: 'int', faction: 'string' } },
      { id: 'marker', props: { active: 'boolean' } },
    ],
    setup: [],
    turnStructure: {
      phases: [{ id: 'draw' }, { id: 'main' }],
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
      {
        id: 'passTurn',
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
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }] },
  }) as unknown as GameDef;

const createEquivalentReorderedGameDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-test', players: { min: 2, max: 4 } },
    constants: {},
    globalVars: [
      { name: 'rounds', type: 'int', init: 1, min: 1, max: 99 },
      { name: 'energy', type: 'int', init: 0, min: 0, max: 10 },
    ],
    perPlayerVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'health', type: 'int', init: 5, min: 0, max: 10 },
    ],
    zones: [
      {
        id: 'discard:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        adjacentTo: ['deck:none'],
      },
      {
        id: 'deck:none',
        owner: 'none',
        visibility: 'hidden',
        ordering: 'stack',
        adjacentTo: ['table:none', 'discard:none'],
      },
      {
        id: 'table:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'queue',
        adjacentTo: ['deck:none'],
      },
    ],
    tokenTypes: [
      { id: 'marker', props: { active: 'boolean' } },
      { id: 'card', props: { faction: 'string', cost: 'int' } },
    ],
    setup: [],
    turnStructure: {
      phases: [{ id: 'main' }, { id: 'draw' }],
    },
    actions: [
      {
        id: 'passTurn',
        actor: 'active',
        phase: 'main',
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
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
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }] },
  }) as unknown as GameDef;

describe('zobrist table canonicalization and feature keying', () => {
  it('same GameDef produces identical fingerprint and seed across calls', () => {
    const def = createBaseGameDef();
    const first = createZobristTable(def);
    const second = createZobristTable(def);

    assert.equal(first.fingerprint, second.fingerprint);
    assert.equal(first.seed, second.seed);
  });

  it('equivalent declaration reordering produces identical table output', () => {
    const tableA = createZobristTable(createBaseGameDef());
    const tableB = createZobristTable(createEquivalentReorderedGameDef());

    assert.equal(tableA.fingerprint, tableB.fingerprint);
    assert.equal(tableA.seed, tableB.seed);
  });

  it('different representative feature tuples map to different keys', () => {
    const table = createZobristTable(createBaseGameDef());

    const keys = [
      zobristKey(table, {
        kind: 'tokenPlacement',
        tokenId: asTokenId('token-1'),
        zoneId: asZoneId('deck:none'),
        slot: 0,
      }),
      zobristKey(table, {
        kind: 'tokenPlacement',
        tokenId: asTokenId('token-1'),
        zoneId: asZoneId('deck:none'),
        slot: 1,
      }),
      zobristKey(table, { kind: 'globalVar', varName: 'energy', value: 2 }),
      zobristKey(table, { kind: 'activePlayer', playerId: asPlayerId(1) }),
      zobristKey(table, { kind: 'currentPhase', phaseId: asPhaseId('main') }),
      zobristKey(table, { kind: 'actionUsage', actionId: asActionId('playCard'), scope: 'turn', count: 1 }),
    ];

    assert.equal(new Set(keys).size, keys.length);
  });

  it('repeated identical table+feature input produces identical keys', () => {
    const table = createZobristTable(createBaseGameDef());
    const feature = {
      kind: 'perPlayerVar',
      playerId: asPlayerId(2),
      varName: 'score',
      value: 8,
    } as const;

    const first = zobristKey(table, feature);
    const second = zobristKey(table, feature);

    assert.equal(first, second);
  });

  it('kind-labeled feature encoding separates similarly-shaped values', () => {
    const table = createZobristTable(createBaseGameDef());

    const globalKey = zobristKey(table, { kind: 'globalVar', varName: '1', value: 23 });
    const perPlayerKey = zobristKey(table, {
      kind: 'perPlayerVar',
      playerId: asPlayerId(1),
      varName: '23',
      value: 0,
    });

    assert.notEqual(globalKey, perPlayerKey);
  });
});
