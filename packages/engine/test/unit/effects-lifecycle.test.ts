import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  applyEffect,
  applyEffects,
  EffectRuntimeError,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  isEffectErrorCode,
  type EffectContext,
  type EffectAST,
  type GameDef,
  type GameState,
  type SpaceMarkerLatticeDef,
  type StackingConstraint,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-lifecycle-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: { cost: 'int', label: 'string', frozen: 'boolean' } }],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const token = (id: string, type = 'card', props: Token['props'] = {}): Token => ({
  id: asTokenId(id),
  type,
  props,
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [token('d1'), token('d2')],
    'discard:none': [token('x1')],
    'hand:0': [],
  },
  nextTokenOrdinal: 3,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(99n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('effects token lifecycle', () => {
  it('createToken adds one token to target zone and increments nextTokenOrdinal once', () => {
    const ctx = makeCtx();
    const totalBefore = Object.values(ctx.state.zones).reduce((sum, zone) => sum + zone.length, 0);

    const result = applyEffect(
      { createToken: { type: 'card', zone: 'deck:none', props: { cost: 2, label: 'alpha', frozen: false } } },
      ctx,
    );

    const created = result.state.zones['deck:none']?.[0];
    const totalAfter = Object.values(result.state.zones).reduce((sum, zone) => sum + zone.length, 0);
    assert.ok(created !== undefined);
    assert.equal(created.id, asTokenId('tok_card_3'));
    assert.equal(created.type, 'card');
    assert.deepEqual(created.props, { cost: 2, label: 'alpha', frozen: false });
    assert.equal(result.state.nextTokenOrdinal, 4);
    assert.equal(totalAfter, totalBefore + 1);
  });

  it('createToken evaluates prop expressions via evalValue', () => {
    const ctx = makeCtx({ bindings: { $baseCost: 4 } });

    const result = applyEffect(
      {
        createToken: {
          type: 'card',
          zone: 'deck:none',
          props: {
            cost: { op: '+', left: { ref: 'binding', name: '$baseCost' }, right: 1 },
            label: { ref: 'binding', name: '$label' },
            frozen: true,
          },
        },
      },
      { ...ctx, moveParams: { $label: 'beta' } },
    );

    assert.deepEqual(result.state.zones['deck:none']?.[0]?.props, { cost: 5, label: 'beta', frozen: true });
  });

  it('repeated createToken calls produce deterministic unique IDs', () => {
    const ctx = makeCtx();
    const effects: readonly EffectAST[] = [
      { createToken: { type: 'card', zone: 'deck:none' } },
      { createToken: { type: 'card', zone: 'deck:none' } },
    ];

    const result = applyEffects(effects, ctx);
    const createdIds = result.state.zones['deck:none']?.slice(0, 2).map((entry) => entry.id);

    assert.deepEqual(createdIds, [asTokenId('tok_card_4'), asTokenId('tok_card_3')]);
    assert.equal(result.state.nextTokenOrdinal, 5);
  });

  it('failed createToken does not increment nextTokenOrdinal', () => {
    const ctx = makeCtx();

    assert.throws(() =>
      applyEffect(
        {
          createToken: {
            type: 'card',
            zone: 'deck:none',
            props: { cost: { op: '+', left: 1, right: 'bad' } },
          },
        },
        ctx,
      ),
    );

    assert.equal(ctx.state.nextTokenOrdinal, 3);
    assert.equal(ctx.state.zones['deck:none']?.length, 2);
  });

  it('destroyToken removes exactly one token when present', () => {
    const ctx = makeCtx();
    const doomed = ctx.state.zones['deck:none']?.[1];
    assert.ok(doomed !== undefined);
    const totalBefore = Object.values(ctx.state.zones).reduce((sum, zone) => sum + zone.length, 0);

    const result = applyEffect({ destroyToken: { token: '$token' } }, { ...ctx, bindings: { $token: doomed } });

    const totalAfter = Object.values(result.state.zones).reduce((sum, zone) => sum + zone.length, 0);
    assert.deepEqual(
      result.state.zones['deck:none']?.map((entry) => entry.id),
      [asTokenId('d1')],
    );
    assert.deepEqual(
      result.state.zones['discard:none']?.map((entry) => entry.id),
      [asTokenId('x1')],
    );
    assert.equal(totalAfter, totalBefore - 1);
    assert.equal(result.state.nextTokenOrdinal, ctx.state.nextTokenOrdinal);
  });

  it('destroyToken emits a destroyToken trace entry with token type and zone', () => {
    const collector = createCollector({ trace: true });
    const ctx = makeCtx({ collector });
    const doomed = ctx.state.zones['deck:none']?.[1];
    assert.ok(doomed !== undefined);

    applyEffect({ destroyToken: { token: '$token' } }, { ...ctx, bindings: { $token: doomed } });

    const traceEntries = collector.trace ?? [];
    const destroyEntries = traceEntries.filter((entry) => entry.kind === 'destroyToken');
    assert.equal(destroyEntries.length, 1);
    const entry = destroyEntries[0]!;
    assert.equal(entry.kind, 'destroyToken');
    assert.equal(entry.tokenId, String(doomed.id));
    assert.equal(entry.type, doomed.type);
    assert.equal(entry.zone, 'deck:none');
    assert.ok(entry.provenance !== undefined);
  });

  it('destroyToken throws when token is not found', () => {
    const ctx = makeCtx({ bindings: { $token: asTokenId('missing') } });

    assert.throws(
      () => applyEffect({ destroyToken: { token: '$token' } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('not found'),
    );
  });

  it('destroyToken throws when token appears in multiple zones', () => {
    const dup = token('dup');
    const state = makeState();
    const ctx = makeCtx({
      state: {
        ...state,
        zones: {
          ...state.zones,
          'deck:none': [dup, ...(state.zones['deck:none'] ?? [])],
          'discard:none': [dup, ...(state.zones['discard:none'] ?? [])],
        },
      },
      bindings: { $token: dup.id },
    });

    assert.throws(
      () => applyEffect({ destroyToken: { token: '$token' } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('multiple zones'),
    );
  });
});

describe('effects createToken stacking enforcement', () => {
  const prohibitConstraint: StackingConstraint[] = [
    {
      id: 'no-bases-loc',
      description: 'No Bases on LoCs',
      spaceFilter: { category: ['loc'] },
      pieceFilter: { pieceTypeIds: ['base'] },
      rule: 'prohibit',
    },
  ];

  const stackingZones = (): GameDef['zones'] => [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack', category: 'loc', attributes: { population: 0, econ: 1, terrainTags: [], country: 'southVietnam', coastal: false } },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ];

  it('createToken in zone violating prohibit rule throws STACKING_VIOLATION', () => {
    const def: GameDef = {
      ...makeDef(),
      zones: stackingZones(),
      stackingConstraints: prohibitConstraint,
    };
    const ctx = makeCtx({ def });

    assert.throws(
      () =>
        applyEffect(
          { createToken: { type: 'base', zone: 'deck:none', props: { faction: 'US' } } },
          ctx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'STACKING_VIOLATION'),
    );
  });

  it('createToken succeeds when constraint does not apply', () => {
    const def: GameDef = {
      ...makeDef(),
      zones: stackingZones(),
      stackingConstraints: prohibitConstraint,
    };
    // discard:none does not have category 'loc', so constraint doesn't apply
    const ctx = makeCtx({ def });

    const result = applyEffect(
      { createToken: { type: 'base', zone: 'discard:none', props: { faction: 'US' } } },
      ctx,
    );

    assert.ok(result.state.zones['discard:none']!.length > 0);
  });
});

describe('effects setTokenProp', () => {
  const makeTokenWithProps = (id: string, props: Token['props']): Token => ({
    id: asTokenId(id),
    type: 'piece',
    props,
  });

  const makePieceDef = (): GameDef => ({
    ...makeDef(),
    tokenTypes: [
      { id: 'card', props: { cost: 'int', label: 'string', frozen: 'boolean' } },
      {
        id: 'piece',
        props: { faction: 'string', activity: 'string' },
        transitions: [
          { prop: 'activity', from: 'underground', to: 'active' },
          { prop: 'activity', from: 'active', to: 'underground' },
        ],
      },
    ],
  });

  it('updates a token property in-place preserving ID and zone position', () => {
    const t = makeTokenWithProps('g1', { faction: 'NVA', activity: 'underground' });
    const state = makeState();
    const ctx = makeCtx({
      def: makePieceDef(),
      state: {
        ...state,
        zones: { ...state.zones, 'deck:none': [token('d1'), t, token('d2')] },
      },
      bindings: { $unit: t },
    });

    const result = applyEffect(
      { setTokenProp: { token: '$unit', prop: 'activity', value: 'active' } },
      ctx,
    );

    const updated = result.state.zones['deck:none']?.[1];
    assert.ok(updated !== undefined);
    assert.equal(updated.id, asTokenId('g1'));
    assert.equal(updated.props['activity'], 'active');
    assert.equal(updated.props['faction'], 'NVA');
    assert.equal(result.state.zones['deck:none']?.length, 3);
  });

  it('throws when token is not found', () => {
    const ctx = makeCtx({
      def: makePieceDef(),
      bindings: { $unit: asTokenId('missing') },
    });

    assert.throws(
      () => applyEffect({ setTokenProp: { token: '$unit', prop: 'activity', value: 'active' } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('not found'),
    );
  });

  it('throws when property is not defined on token type', () => {
    const t = makeTokenWithProps('g1', { faction: 'NVA', activity: 'underground' });
    const state = makeState();
    const ctx = makeCtx({
      def: makePieceDef(),
      state: { ...state, zones: { ...state.zones, 'deck:none': [t] } },
      bindings: { $unit: t },
    });

    assert.throws(
      () => applyEffect({ setTokenProp: { token: '$unit', prop: 'nonexistent', value: 'x' } }, ctx),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('not defined on token type'),
    );
  });

  it('throws when transition is invalid', () => {
    const t = makeTokenWithProps('g1', { faction: 'NVA', activity: 'underground' });
    const state = makeState();
    const ctx = makeCtx({
      def: makePieceDef(),
      state: { ...state, zones: { ...state.zones, 'deck:none': [t] } },
      bindings: { $unit: t },
    });

    // underground → destroyed is not a valid transition
    assert.throws(
      () => applyEffect({ setTokenProp: { token: '$unit', prop: 'activity', value: 'destroyed' } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Invalid transition'),
    );
  });

  it('allows any value when no transitions are defined for the property', () => {
    const t = makeTokenWithProps('g1', { faction: 'NVA', activity: 'underground' });
    const state = makeState();
    const ctx = makeCtx({
      def: makePieceDef(),
      state: { ...state, zones: { ...state.zones, 'deck:none': [t] } },
      bindings: { $unit: t },
    });

    // 'faction' has no transitions defined, so any value is allowed
    const result = applyEffect(
      { setTokenProp: { token: '$unit', prop: 'faction', value: 'ARVN' } },
      ctx,
    );

    assert.equal(result.state.zones['deck:none']?.[0]?.props['faction'], 'ARVN');
  });

  it('evaluates value expressions via evalValue', () => {
    const t = makeTokenWithProps('g1', { faction: 'NVA', activity: 'underground' });
    const state = makeState();
    const ctx = makeCtx({
      def: makePieceDef(),
      state: { ...state, zones: { ...state.zones, 'deck:none': [t] } },
      bindings: { $unit: t },
      moveParams: { $newFaction: 'VC' },
    });

    const result = applyEffect(
      { setTokenProp: { token: '$unit', prop: 'faction', value: { ref: 'binding', name: '$newFaction' } } },
      ctx,
    );

    assert.equal(result.state.zones['deck:none']?.[0]?.props['faction'], 'VC');
  });

  it('does not mutate original state', () => {
    const t = makeTokenWithProps('g1', { faction: 'NVA', activity: 'underground' });
    const state = makeState();
    const ctx = makeCtx({
      def: makePieceDef(),
      state: { ...state, zones: { ...state.zones, 'deck:none': [t] } },
      bindings: { $unit: t },
    });

    applyEffect(
      { setTokenProp: { token: '$unit', prop: 'activity', value: 'active' } },
      ctx,
    );

    assert.equal(ctx.state.zones['deck:none']?.[0]?.props['activity'], 'underground');
  });
});

const supportLattice: SpaceMarkerLatticeDef = {
  id: 'support',
  states: ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
  defaultState: 'neutral',
};

const makeMarkerDef = (): GameDef => ({
  ...makeDef(),
  markerLattices: [supportLattice],
});

const makeMarkerCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeMarkerDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(42n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('effects setMarker', () => {
  it('sets a marker state on a space', () => {
    const ctx = makeMarkerCtx();
    const effect: EffectAST = {
      setMarker: { space: 'deck:none', marker: 'support', state: 'activeSupport' },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.markers['deck:none']?.['support'], 'activeSupport');
  });

  it('throws for invalid marker state', () => {
    const ctx = makeMarkerCtx();
    const effect: EffectAST = {
      setMarker: { space: 'deck:none', marker: 'support', state: 'invalidState' },
    };

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => error instanceof EffectRuntimeError && String(error).includes('invalidState'),
    );
  });

  it('throws for unknown marker lattice', () => {
    const ctx = makeMarkerCtx();
    const effect: EffectAST = {
      setMarker: { space: 'deck:none', marker: 'nonexistent', state: 'neutral' },
    };

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => error instanceof EffectRuntimeError && String(error).includes('nonexistent'),
    );
  });

  it('overwrites existing marker state', () => {
    const state: GameState = {
      ...makeState(),
      markers: { 'deck:none': { support: 'neutral' } },
    };
    const ctx = makeMarkerCtx({ state });
    const effect: EffectAST = {
      setMarker: { space: 'deck:none', marker: 'support', state: 'activeOpposition' },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.markers['deck:none']?.['support'], 'activeOpposition');
  });

  it('does not mutate original state', () => {
    const ctx = makeMarkerCtx();
    const effect: EffectAST = {
      setMarker: { space: 'deck:none', marker: 'support', state: 'activeSupport' },
    };

    applyEffect(effect, ctx);
    assert.deepEqual(ctx.state.markers, {});
  });
});

describe('effects shiftMarker', () => {
  it('shifts marker state forward in lattice', () => {
    const state: GameState = {
      ...makeState(),
      markers: { 'deck:none': { support: 'neutral' } },
    };
    const ctx = makeMarkerCtx({ state });
    const effect: EffectAST = {
      shiftMarker: { space: 'deck:none', marker: 'support', delta: 1 },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.markers['deck:none']?.['support'], 'passiveSupport');
  });

  it('shifts marker state backward in lattice', () => {
    const state: GameState = {
      ...makeState(),
      markers: { 'deck:none': { support: 'neutral' } },
    };
    const ctx = makeMarkerCtx({ state });
    const effect: EffectAST = {
      shiftMarker: { space: 'deck:none', marker: 'support', delta: -1 },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.markers['deck:none']?.['support'], 'passiveOpposition');
  });

  it('clamps at lattice boundaries (no overshoot)', () => {
    const state: GameState = {
      ...makeState(),
      markers: { 'deck:none': { support: 'activeSupport' } },
    };
    const ctx = makeMarkerCtx({ state });
    const effect: EffectAST = {
      shiftMarker: { space: 'deck:none', marker: 'support', delta: 10 },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.markers['deck:none']?.['support'], 'activeSupport');
  });

  it('uses default state when space has no markers', () => {
    const ctx = makeMarkerCtx();
    const effect: EffectAST = {
      shiftMarker: { space: 'deck:none', marker: 'support', delta: 2 },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.markers['deck:none']?.['support'], 'activeSupport');
  });

  it('is a no-op when already at boundary and shift goes further', () => {
    const state: GameState = {
      ...makeState(),
      markers: { 'deck:none': { support: 'activeOpposition' } },
    };
    const ctx = makeMarkerCtx({ state });
    const effect: EffectAST = {
      shiftMarker: { space: 'deck:none', marker: 'support', delta: -5 },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('throws for unknown marker lattice', () => {
    const ctx = makeMarkerCtx();
    const effect: EffectAST = {
      shiftMarker: { space: 'deck:none', marker: 'unknown', delta: 1 },
    };

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => error instanceof EffectRuntimeError && String(error).includes('unknown'),
    );
  });
});

describe('effects global marker lifecycle', () => {
  it('setGlobalMarker sets global marker state', () => {
    const ctx = makeMarkerCtx({
      def: {
        ...makeMarkerDef(),
        globalMarkerLattices: [{ id: 'cap_topGun', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' }],
      },
    });
    const effect: EffectAST = {
      setGlobalMarker: { marker: 'cap_topGun', state: 'unshaded' },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalMarkers?.cap_topGun, 'unshaded');
  });

  it('shiftGlobalMarker shifts and clamps by lattice order', () => {
    const ctx = makeMarkerCtx({
      def: {
        ...makeMarkerDef(),
        globalMarkerLattices: [{ id: 'cap_topGun', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' }],
      },
      state: {
        ...makeState(),
        globalMarkers: { cap_topGun: 'inactive' },
      },
    });
    const effect: EffectAST = {
      shiftGlobalMarker: { marker: 'cap_topGun', delta: 5 },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalMarkers?.cap_topGun, 'shaded');
  });

  it('flipGlobalMarker toggles between two states for a selected marker', () => {
    const ctx = makeMarkerCtx({
      def: {
        ...makeMarkerDef(),
        globalMarkerLattices: [{ id: 'cap_topGun', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' }],
      },
      state: {
        ...makeState(),
        globalMarkers: { cap_topGun: 'unshaded' },
      },
      bindings: { $marker: 'cap_topGun' },
    });
    const effect: EffectAST = {
      flipGlobalMarker: {
        marker: { ref: 'binding', name: '$marker' },
        stateA: 'unshaded',
        stateB: 'shaded',
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalMarkers?.cap_topGun, 'shaded');
  });

  it('flipGlobalMarker throws when current marker state is outside flip pair', () => {
    const ctx = makeMarkerCtx({
      def: {
        ...makeMarkerDef(),
        globalMarkerLattices: [{ id: 'cap_topGun', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' }],
      },
      state: {
        ...makeState(),
        globalMarkers: { cap_topGun: 'inactive' },
      },
      bindings: { $marker: 'cap_topGun' },
    });
    const effect: EffectAST = {
      flipGlobalMarker: {
        marker: { ref: 'binding', name: '$marker' },
        stateA: 'unshaded',
        stateB: 'shaded',
      },
    };

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => error instanceof EffectRuntimeError && String(error).includes('not flippable'),
    );
  });
});
