import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeDiscoveryEffectContext, makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import {
  buildAdjacencyGraph,
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  isEffectErrorCode,
  nextInt,
  type EffectContext,
  type GameDef,
  type GameState,
  type StackingConstraint,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';
import { assertSelectorResolutionPolicyBoundary } from '../helpers/effect-error-assertions.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-token-move-draw-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const token = (id: string): Token => ({ id: asTokenId(id), type: 'card', props: {} });

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [token('d1'), token('d2'), token('d3')],
    'discard:none': [token('x1'), token('x2')],
    'hand:0': [],
    'hand:1': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(123n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

const makeDiscoveryCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeDiscoveryEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(123n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('effects moveToken and draw', () => {
  it('moveToken to top inserts at destination index 0', () => {
    const ctx = makeCtx();
    const movingToken = ctx.state.zones['deck:none']?.[1];
    assert.ok(movingToken !== undefined);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none', position: 'top' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    assert.equal(result.state.zones['discard:none']?.[0]?.id, movingToken.id);
  });

  it('moveToken to bottom appends at destination end', () => {
    const ctx = makeCtx();
    const movingToken = ctx.state.zones['deck:none']?.[0];
    assert.ok(movingToken !== undefined);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none', position: 'bottom' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    const destination = result.state.zones['discard:none'];
    const destinationLastIndex = (destination?.length ?? 1) - 1;
    assert.equal(destination?.[destinationLastIndex]?.id, movingToken.id);
  });

  it('moveToken with random chooses deterministic index for known seed', () => {
    const ctx = makeCtx({ rng: createRng(7n) });
    const movingToken = ctx.state.zones['deck:none']?.[2];
    assert.ok(movingToken !== undefined);

    const destinationSizeAfterRemoval = ctx.state.zones['discard:none']?.length ?? 0;
    const [expectedIndex, expectedRng] = nextInt(ctx.rng, 0, destinationSizeAfterRemoval);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none', position: 'random' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    assert.equal(result.state.zones['discard:none']?.[expectedIndex]?.id, movingToken.id);
    assert.deepEqual(result.rng.state, expectedRng.state);
  });

  it('moveToken updates source and destination counts by exactly one and conserves total tokens', () => {
    const ctx = makeCtx();
    const movingToken = ctx.state.zones['deck:none']?.[0];
    assert.ok(movingToken !== undefined);

    const sourceBefore = ctx.state.zones['deck:none']?.length ?? 0;
    const destinationBefore = ctx.state.zones['discard:none']?.length ?? 0;
    const totalBefore = Object.values(ctx.state.zones).reduce((sum, zone) => sum + zone.length, 0);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    const sourceAfter = result.state.zones['deck:none']?.length ?? 0;
    const destinationAfter = result.state.zones['discard:none']?.length ?? 0;
    const totalAfter = Object.values(result.state.zones).reduce((sum, zone) => sum + zone.length, 0);

    assert.equal(sourceAfter, sourceBefore - 1);
    assert.equal(destinationAfter, destinationBefore + 1);
    assert.equal(totalAfter, totalBefore);
  });

  it('moveToken throws when token is not in resolved from zone', () => {
    const ctx = makeCtx();
    const tokenInDiscard = ctx.state.zones['discard:none']?.[0];
    assert.ok(tokenInDiscard !== undefined);

    assert.throws(
      () =>
        applyEffect(
          { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none' } },
          { ...ctx, bindings: { $token: tokenInDiscard } },
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('resolved from zone'),
    );
  });

  it('moveToken throws when token appears in multiple zones', () => {
    const duplicate = token('dup');
    const state = makeState();
    const ctx = makeCtx({
      state: {
        ...state,
        zones: {
          ...state.zones,
          'deck:none': [duplicate, ...(state.zones['deck:none'] ?? [])],
          'discard:none': [duplicate, ...(state.zones['discard:none'] ?? [])],
        },
      },
    });

    assert.throws(
      () =>
        applyEffect(
          { moveToken: { token: '$token', from: 'deck:none', to: 'hand:0' } },
          { ...ctx, bindings: { $token: duplicate } },
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('multiple zones'),
    );
  });

  it('draw moves min(count, sourceSize) tokens from source front', () => {
    const ctx = makeCtx();

    const result = applyEffect({ draw: { from: 'deck:none', to: 'discard:none', count: 5 } }, ctx);

    assert.equal(result.state.zones['deck:none']?.length, 0);
    assert.equal(result.state.zones['discard:none']?.length, 5);
    assert.equal(result.state.zones['discard:none']?.[0]?.id, asTokenId('d1'));
    assert.equal(result.state.zones['discard:none']?.[1]?.id, asTokenId('d2'));
    assert.equal(result.state.zones['discard:none']?.[2]?.id, asTokenId('d3'));
  });

  it('draw from empty source is a no-op', () => {
    const state = makeState();
    const ctx = makeCtx({
      state: {
        ...state,
        zones: {
          ...state.zones,
          'deck:none': [],
        },
      },
    });

    const result = applyEffect({ draw: { from: 'deck:none', to: 'discard:none', count: 2 } }, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('draw throws on negative or non-integer count', () => {
    const ctx = makeCtx();

    assert.throws(
      () => applyEffect({ draw: { from: 'deck:none', to: 'discard:none', count: -1 } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('draw.count'),
    );

    assert.throws(
      () => applyEffect({ draw: { from: 'deck:none', to: 'discard:none', count: 1.5 } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('draw.count'),
    );
  });

  it('draw unresolved selector follows execution/discovery policy boundary', () => {
    assertSelectorResolutionPolicyBoundary({
      executionRun: () =>
        applyEffect(
          { draw: { from: { zoneExpr: { ref: 'binding', name: '$missingFromZone' } }, to: 'discard:none', count: 1 } },
          makeCtx(),
        ),
      discoveryRun: () =>
        applyEffect(
          { draw: { from: { zoneExpr: { ref: 'binding', name: '$missingFromZone' } }, to: 'discard:none', count: 1 } },
          makeDiscoveryCtx(),
        ),
      normalizedMessage: 'draw.from zone resolution failed',
    });
  });

  it('moveToken.from unresolved selector follows execution/discovery policy boundary', () => {
    assertSelectorResolutionPolicyBoundary({
      executionRun: () =>
        applyEffect(
          {
            moveToken: {
              token: '$token',
              from: { zoneExpr: { ref: 'binding', name: '$missingFromZone' } },
              to: 'discard:none',
            },
          },
          makeCtx(),
        ),
      discoveryRun: () =>
        applyEffect(
          {
            moveToken: {
              token: '$token',
              from: { zoneExpr: { ref: 'binding', name: '$missingFromZone' } },
              to: 'discard:none',
            },
          },
          makeDiscoveryCtx(),
        ),
      normalizedMessage: 'moveToken.from zone resolution failed',
    });
  });

  it('moveToken unresolved selector follows execution/discovery policy boundary', () => {
    assertSelectorResolutionPolicyBoundary({
      executionRun: () =>
        applyEffect(
          {
            moveToken: {
              token: '$token',
              from: 'deck:none',
              to: { zoneExpr: { ref: 'binding', name: '$missingToZone' } },
            },
          },
          makeCtx(),
        ),
      discoveryRun: () =>
        applyEffect(
          {
            moveToken: {
              token: '$token',
              from: 'deck:none',
              to: { zoneExpr: { ref: 'binding', name: '$missingToZone' } },
            },
          },
          makeDiscoveryCtx(),
        ),
      normalizedMessage: 'moveToken.to zone resolution failed',
    });
  });

  it('moveToken random with empty destination does not advance rng', () => {
    const state = makeState();
    const ctx = makeCtx({
      rng: createRng(99n),
      state: {
        ...state,
        zones: {
          ...state.zones,
          'discard:none': [],
        },
      },
    });
    const movingToken = ctx.state.zones['deck:none']?.[0];
    assert.ok(movingToken !== undefined);

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none', position: 'random' } },
      { ...ctx, bindings: { $token: movingToken } },
    );

    assert.deepEqual(result.rng.state, ctx.rng.state);
  });
});

describe('draw trace emission', () => {
  const makeTraceCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
    def: makeDef(),
    adjacencyGraph: buildAdjacencyGraph([]),
    state: makeState(),
    rng: createRng(123n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams: {},
    collector: createCollector({ trace: true }),
    traceContext: { eventContext: 'actionEffect', actionId: 'test-draw', effectPathRoot: 'test.effects' },
    effectPath: '',
    ...overrides,
  });

  it('draw emits one moveToken trace entry per token drawn', () => {
    const ctx = makeTraceCtx();

    applyEffect({ draw: { from: 'deck:none', to: 'hand:0', count: 2 } }, ctx);

    const trace = ctx.collector.trace ?? [];
    assert.equal(trace.length, 2);
    for (const entry of trace) {
      assert.equal(entry.kind, 'moveToken');
      assert.equal(entry.from, 'deck:none');
      assert.equal(entry.to, 'hand:0');
    }
    const first = trace[0]!;
    const second = trace[1]!;
    assert.equal(first.kind, 'moveToken');
    assert.equal(second.kind, 'moveToken');
    if (first.kind === 'moveToken') assert.equal(first.tokenId, 'd1');
    if (second.kind === 'moveToken') assert.equal(second.tokenId, 'd2');
  });

  it('draw from empty source emits no trace entries', () => {
    const state = makeState();
    const ctx = makeTraceCtx({
      state: {
        ...state,
        zones: { ...state.zones, 'deck:none': [] },
      },
    });

    applyEffect({ draw: { from: 'deck:none', to: 'hand:0', count: 2 } }, ctx);

    assert.deepEqual(ctx.collector.trace, []);
  });

  it('draw with count 0 emits no trace entries', () => {
    const ctx = makeTraceCtx();

    applyEffect({ draw: { from: 'deck:none', to: 'hand:0', count: 0 } }, ctx);

    assert.deepEqual(ctx.collector.trace, []);
  });

  it('draw with count > source length emits entries for actual count', () => {
    const ctx = makeTraceCtx();

    applyEffect({ draw: { from: 'deck:none', to: 'hand:0', count: 5 } }, ctx);

    const trace = ctx.collector.trace ?? [];
    assert.equal(trace.length, 3);
    for (const entry of trace) {
      assert.equal(entry.kind, 'moveToken');
    }
  });
});

describe('effects moveToken stacking enforcement', () => {
  const stackingConstraints: StackingConstraint[] = [
    {
      id: 'max-2-bases',
      description: 'Max 2 Bases per Province',
      spaceFilter: { category: ['province'] },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'maxCount',
      maxCount: 2,
    },
  ];

  const stackingZones = (): GameDef['zones'] => [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack', category: 'province', attributes: { population: 2, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false } },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ];

  const base = (id: string): Token => ({ id: asTokenId(id), type: 'base', props: { faction: 'US' } });

  it('moveToken to zone exceeding maxCount throws STACKING_VIOLATION', () => {
    const def = { ...makeDef(), zones: stackingZones(), stackingConstraints };
    const state: GameState = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        'deck:none': [base('b3')],
        'discard:none': [base('b1'), base('b2')],
      },
    };
    const ctx = makeCtx({ def, state });

    assert.throws(
      () =>
        applyEffect(
          { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none' } },
          { ...ctx, bindings: { $token: 'b3' } },
        ),
      (error: unknown) => isEffectErrorCode(error, 'STACKING_VIOLATION'),
    );
  });

  it('moveToken to zone within maxCount succeeds normally', () => {
    const def = { ...makeDef(), zones: stackingZones(), stackingConstraints };
    const state: GameState = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        'deck:none': [base('b2')],
        'discard:none': [base('b1')],
      },
    };
    const ctx = makeCtx({ def, state });

    const result = applyEffect(
      { moveToken: { token: '$token', from: 'deck:none', to: 'discard:none' } },
      { ...ctx, bindings: { $token: 'b2' } },
    );

    assert.equal(result.state.zones['discard:none']!.length, 2);
  });
});
