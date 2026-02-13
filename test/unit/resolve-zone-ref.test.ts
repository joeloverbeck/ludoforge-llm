import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  createCollector,
  asZoneId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  resolveZoneRef,
  type EvalContext,
  type GameDef,
  type GameState,
  type Token,
  type ZoneRef,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'zone-ref-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  endConditions: [],
});

const makeToken = (id: string, props: Readonly<Record<string, number | string | boolean>>): Token => ({
  id: asTokenId(id),
  type: 'cube',
  props,
});

const cube1 = makeToken('cube-1', { faction: 'US' });

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [makeToken('card-1', { vp: 1 })],
    'hand:0': [cube1],
    'hand:1': [],
    'board:none': [makeToken('cube-2', { faction: 'NVA' })],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  collector: createCollector(),
  ...overrides,
});

describe('resolveZoneRef', () => {
  it('resolves a static string zone selector', () => {
    const ctx = makeCtx();
    const ref: ZoneRef = 'deck:none';
    assert.equal(resolveZoneRef(ref, ctx), 'deck:none');
  });

  it('resolves a dynamic zoneExpr with tokenZone reference', () => {
    const ctx = makeCtx({
      bindings: { '$cube': cube1 },
    });
    const ref: ZoneRef = { zoneExpr: { ref: 'tokenZone', token: '$cube' } };
    assert.equal(resolveZoneRef(ref, ctx), 'hand:0');
  });

  it('resolves a dynamic zoneExpr with concat expression', () => {
    const ctx = makeCtx({
      bindings: { '$owner': '0' },
    });
    const ref: ZoneRef = {
      zoneExpr: { concat: ['hand:', { ref: 'binding', name: '$owner' }] },
    };
    assert.equal(resolveZoneRef(ref, ctx), 'hand:0');
  });

  it('resolves a dynamic zoneExpr with conditional expression', () => {
    const ctx = makeCtx({
      bindings: { '$useHand': 1 },
    });
    const ref: ZoneRef = {
      zoneExpr: {
        if: {
          when: { op: '==', left: { ref: 'binding', name: '$useHand' }, right: 1 },
          then: 'hand:0',
          else: 'board:none',
        },
      },
    };
    assert.equal(resolveZoneRef(ref, ctx), 'hand:0');
  });

  it('resolves conditional false branch to board:none', () => {
    const ctx = makeCtx({
      bindings: { '$useHand': 0 },
    });
    const ref: ZoneRef = {
      zoneExpr: {
        if: {
          when: { op: '==', left: { ref: 'binding', name: '$useHand' }, right: 1 },
          then: 'hand:0',
          else: 'board:none',
        },
      },
    };
    assert.equal(resolveZoneRef(ref, ctx), 'board:none');
  });
});
