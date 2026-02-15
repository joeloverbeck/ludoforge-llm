import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  computeFullHash,
  createRng,
  createZobristTable,
  nextInt,
  serialize,
  updateHashTokenPlacement,
} from '../../src/kernel/index.js';
import type { GameDef, GameState, Token } from '../../src/kernel/index.js';

const STEP_COUNT = 20;
const ZONE_IDS = ['bag:none', 'lane:none', 'vault:none'] as const;

const createGameDef = (): GameDef =>
  ({
    metadata: { id: 'determinism-full', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: ZONE_IDS.map((id, index) => ({
      id,
      owner: 'none',
      visibility: 'public',
      ordering: index === 0 ? 'stack' : 'queue',
    })),
    tokenTypes: [{ id: 'piece', props: {} }],
    setup: [],
    turnStructure: {
      phases: [{ id: 'main' }],
    },
    actions: [
      {
        id: 'advance',
actor: 'active',
executor: 'actor',
phase: 'main',
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [{ when: { op: '==', left: 0, right: 1 }, result: { type: 'draw' } }] },
  }) as unknown as GameDef;

const createInitialState = (seed: bigint): GameState => {
  const tokens: readonly Token[] = [
    { id: asTokenId('t-1'), type: 'piece', props: {} },
    { id: asTokenId('t-2'), type: 'piece', props: {} },
    { id: asTokenId('t-3'), type: 'piece', props: {} },
    { id: asTokenId('t-4'), type: 'piece', props: {} },
  ];

  return {
    globalVars: {},
    perPlayerVars: {
      '0': {},
      '1': {},
    },
    playerCount: 2,
    zones: {
      'bag:none': [...tokens],
      'lane:none': [],
      'vault:none': [],
    },
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 0,
    rng: serialize(createRng(seed)),
    stateHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  };
};

const simulateHashTimeline = (seed: bigint): readonly bigint[] => {
  const def = createGameDef();
  const table = createZobristTable(def);
  let rng = createRng(seed);
  let state = createInitialState(seed);

  state = {
    ...state,
    stateHash: computeFullHash(table, state),
  };

  const timeline: bigint[] = [state.stateHash];

  for (let step = 0; step < STEP_COUNT; step += 1) {
    const nonEmptyZones = ZONE_IDS.filter((zoneId) => (state.zones[zoneId]?.length ?? 0) > 0);
    assert.ok(nonEmptyZones.length > 0);

    const [zoneIndex, afterZonePick] = nextInt(rng, 0, nonEmptyZones.length - 1);
    const fromZone = nonEmptyZones[zoneIndex];
    assert.ok(fromZone !== undefined);
    const fromTokens = state.zones[fromZone] ?? [];
    assert.ok(fromTokens.length > 0);

    // Pop from the end to keep remaining token slots unchanged (single-feature hash update).
    const fromSlot = fromTokens.length - 1;
    const movingToken = fromTokens[fromSlot];
    assert.ok(movingToken);

    const destinationZones = ZONE_IDS.filter((zoneId) => zoneId !== fromZone);
    const [destinationIndex, afterDestinationPick] = nextInt(afterZonePick, 0, destinationZones.length - 1);
    const toZone = destinationZones[destinationIndex];
    assert.ok(toZone !== undefined);

    const toTokens = state.zones[toZone] ?? [];
    const toSlot = toTokens.length;

    const nextFromTokens = [...fromTokens.slice(0, fromSlot), ...fromTokens.slice(fromSlot + 1)];
    const nextToTokens = [...toTokens, movingToken];

    const incrementalHash = updateHashTokenPlacement(
      state.stateHash,
      table,
      movingToken.id,
      asZoneId(fromZone),
      fromSlot,
      asZoneId(toZone),
      toSlot,
    );

    const nextState: GameState = {
      ...state,
      zones: {
        ...state.zones,
        [fromZone]: nextFromTokens,
        [toZone]: nextToTokens,
      },
      rng: serialize(afterDestinationPick),
      stateHash: incrementalHash,
    };

    const recomputedHash = computeFullHash(table, nextState);
    assert.equal(incrementalHash, recomputedHash);

    state = {
      ...nextState,
      stateHash: recomputedHash,
    };
    rng = afterDestinationPick;
    timeline.push(recomputedHash);
  }

  return timeline;
};

describe('determinism full integration replay', () => {
  it('same seed and move policy yield identical 20-step hash timeline', () => {
    const seed = 42n;

    const firstRun = simulateHashTimeline(seed);
    const secondRun = simulateHashTimeline(seed);

    assert.equal(firstRun.length, STEP_COUNT + 1);
    assert.deepEqual(firstRun, secondRun);
  });
});
