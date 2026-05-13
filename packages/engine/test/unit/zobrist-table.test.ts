// @test-class: architectural-invariant
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
  zobristKey,
  zobristInternals,
} from '../../src/kernel/index.js';

const FNV_MASK_64 = (1n << 64n) - 1n;
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;

const fnv1a64Oracle = (input: string): bigint => {
  let hash = FNV_OFFSET_BASIS_64;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * FNV_PRIME_64) & FNV_MASK_64;
  }
  return hash;
};

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
        adjacentTo: [{ to: 'discard:none' }, { to: 'table:none' }],
      },
      {
        id: 'table:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'queue',
        adjacentTo: [{ to: 'deck:none' }],
      },
      {
        id: 'discard:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        adjacentTo: [{ to: 'deck:none' }],
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
executor: 'actor',
phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: 'passTurn',
actor: 'active',
executor: 'actor',
phase: ['main'],
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
        adjacentTo: [{ to: 'deck:none' }],
      },
      {
        id: 'deck:none',
        owner: 'none',
        visibility: 'hidden',
        ordering: 'stack',
        adjacentTo: [{ to: 'table:none' }, { to: 'discard:none' }],
      },
      {
        id: 'table:none',
        owner: 'none',
        visibility: 'public',
        ordering: 'queue',
        adjacentTo: [{ to: 'deck:none' }],
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
executor: 'actor',
phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: 'playCard',
actor: 'active',
executor: 'actor',
phase: ['main'],
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

const createHashState = (): GameState =>
  ({
    globalVars: { energy: 0, rounds: 1 },
    perPlayerVars: {
      0: { health: 5, score: 0 },
      1: { health: 5, score: 0 },
      2: { health: 5, score: 0 },
      3: { health: 5, score: 0 },
    },
    zoneVars: {},
    playerCount: 4,
    zones: {
      'deck:none': [],
      'table:none': [],
      'discard:none': [],
    },
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    activeDeciderSeatId: '0',
    turnCount: 0,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
    reveals: undefined,
    globalMarkers: undefined,
    activeLastingEffects: undefined,
    interruptPhaseStack: undefined,
  }) as unknown as GameState;

describe('zobrist table canonicalization and feature keying', () => {
  it('same GameDef produces identical fingerprint and seed across calls', () => {
    const def = createBaseGameDef();
    const first = createZobristTable(def);
    const second = createZobristTable(def);

    assert.equal(first.fingerprint, second.fingerprint);
    assert.equal(first.seed, second.seed);
  });

  it('matches the canonical BigInt FNV-1a oracle for table seeds and feature keys', () => {
    const table = createZobristTable(createBaseGameDef());
    const feature = { kind: 'globalVar', varName: 'energy', value: 7 } as const;

    assert.equal(table.seed, fnv1a64Oracle(`table-seed|fingerprint=${table.fingerprint}`));
    assert.equal(
      zobristKey(table, feature),
      fnv1a64Oracle(`zobrist-key-v1|seed=${table.seedHex}|kind=globalVar|varName=energy|value=7`),
    );
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
      zobristKey(table, {
        kind: 'lastingEffect',
        slot: 0,
        id: 'aid-shift',
        sourceCardId: 'card-1',
        side: 'unshaded',
        branchId: '',
        duration: 'nextTurn',
        remainingTurnBoundaries: 2,
        remainingRoundBoundaries: -1,
        remainingCycleBoundaries: -1,
      }),
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

  it('hashes structurally identical decision-stack frames deterministically', () => {
    const table = createZobristTable(createBaseGameDef());
    const baseState = createHashState();
    const first = {
      ...baseState,
      decisionStack: [
        {
          frameId: 0,
          parentFrameId: null,
          turnId: 0,
          context: {
            kind: 'chooseOne',
            seatId: '0',
            decisionKey: '$choice',
            options: [
              { value: 'a', legality: 'legal', illegalReason: null, resolution: 'exact' },
              { value: 'b', legality: 'legal', illegalReason: null, resolution: 'exact' },
            ],
          },
          effectFrame: {
            programCounter: 0,
            boundedIterationCursors: {},
            localBindings: {},
            pendingTriggerQueue: [],
          },
        },
      ],
    } as unknown as GameState;
    const second = {
      ...baseState,
      decisionStack: [
        {
          frameId: 0,
          parentFrameId: null,
          turnId: 0,
          context: {
            kind: 'chooseOne',
            seatId: '0',
            decisionKey: '$choice',
            options: [
              { value: 'a', legality: 'legal', illegalReason: null, resolution: 'exact' },
              { value: 'b', legality: 'legal', illegalReason: null, resolution: 'exact' },
            ],
          },
          effectFrame: {
            programCounter: 0,
            boundedIterationCursors: {},
            localBindings: {},
            pendingTriggerQueue: [],
          },
        },
      ],
    } as unknown as GameState;

    assert.notEqual(first.decisionStack?.[0], second.decisionStack?.[0]);
    assert.equal(computeFullHash(table, first), computeFullHash(table, second));
  });

  it('memoises repeated bounded runtime feature keys on the table cache', () => {
    const table = createZobristTable(createBaseGameDef());
    const feature = {
      kind: 'globalVar',
      varName: 'energy',
      value: 3,
    } as const;
    zobristInternals.resetZobristKeyCounters();

    const first = zobristKey(table, feature);
    const sizeAfterFirst = table.keyCache.size;
    const second = zobristKey(table, feature);

    assert.equal(first, second);
    assert.equal(table.keyCache.size, sizeAfterFirst);
    assert.equal(zobristInternals.getZobristKeyCacheMissCount(), 1);
    assert.equal(zobristInternals.getZobristKeyCacheHitCount(), 1);
  });

  it('memoises repeated dynamic feature keys without adding them to the table cache', () => {
    const table = createZobristTable(createBaseGameDef());
    const before = table.keyCache.size;
    const feature = {
      kind: 'turnCount',
      value: 7,
    } as const;
    zobristInternals.resetZobristKeyCounters();

    const first = zobristKey(table, feature);
    const second = zobristKey(table, feature);

    assert.equal(first, second);
    assert.equal(table.keyCache.size, before);
    assert.equal(zobristInternals.getZobristKeyUncachedCount(), 1);
    assert.equal(zobristInternals.getZobristKeyCacheHitCount(), 1);
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
