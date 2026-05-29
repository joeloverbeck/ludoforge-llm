// @test-class: architectural-invariant
// @witness: POLPREVDRIVE-002, POLPREVDRIVE-007
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDraftTokenStateIndex,
  copyCachedTokenStateIndex,
  getTokenStateIndex,
  refreshCachedTokenStateIndexEntries,
  type TokenStateIndexEntry,
  __internal_for_tests,
} from '../../../src/kernel/token-state-index.js';
import { applyPublishedDecisionFromCanonicalState } from '../../../src/kernel/microturn/apply.js';
import { publishMicroturnGreedyChooseOne } from '../../../src/kernel/microturn/publish.js';
import { createMutableState, freezeState } from '../../../src/kernel/state-draft.js';
import {
  applyEffects,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../../src/kernel/index.js';
import { makeExecutionEffectContext } from '../../helpers/effect-context-test-helpers.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import {
  PREVIEW_DEPTH_CAP,
  collectChooseOneDriveFixtures,
} from '../../helpers/drive-parity-helpers.js';
import {
  createFitlRuntime,
  FITL_PLAYER_COUNT,
} from '../../helpers/zobrist-incremental-property-helpers.js';

describe('POLPREVDRIVE-002 draft token-state index', () => {
  it('matches a fresh rebuild after each greedy drive kernel mutation', () => {
    const { def, runtime } = createFitlRuntime();
    const fixtures = collectChooseOneDriveFixtures(def, runtime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 3,
      expectedMinDepth: 2,
      maxSteps: 24,
    });

    for (const fixture of fixtures) {
      const draftIndex = createDraftTokenStateIndex(fixture.state);
      assertIndexMatchesFreshRebuild(`${fixture.label}: initial`, fixture.state, draftIndex.read());

      let state = fixture.state;
      let depth = 0;
      while (depth < PREVIEW_DEPTH_CAP) {
        const top = state.decisionStack?.at(-1);
        if (
          top === undefined
          || top.context.kind !== 'chooseOne'
          || top.context.seatId !== fixture.origin.seatId
          || top.turnId !== fixture.origin.turnId
        ) {
          break;
        }

        const greedy = publishMicroturnGreedyChooseOne(def, state, runtime);
        assert.notEqual(greedy, null, `${fixture.label}: expected greedy chooseOne decision at depth ${depth}`);
        const prevState = state;
        state = applyPublishedDecisionFromCanonicalState(
          def,
          prevState,
          greedy!.microturn,
          greedy!.decision,
          { advanceToDecisionPoint: true },
          runtime,
        ).state;
        draftIndex.applyZoneDelta(prevState.zones, state.zones);
        draftIndex.attachAsCanonical(state);

        assertIndexMatchesFreshRebuild(`${fixture.label}: canonical cache at depth ${depth + 1}`, state, getTokenStateIndex(state));
        assertIndexMatchesFreshRebuild(`${fixture.label}: depth ${depth + 1}`, state, draftIndex.read());
        depth += 1;
      }

      assert.ok(depth >= fixture.expectedMinDepth, `${fixture.label}: expected depth >= ${fixture.expectedMinDepth}, got ${depth}`);
    }
  });

  it('preserves duplicate-token occurrence semantics across changed zones', () => {
    const state = makeTokenState({
      'hand:0': [{ id: 'shared-token', type: 'card', props: {} }],
      'bench:1': [{ id: 'other-token', type: 'card', props: {} }],
      discard: [{ id: 'shared-token', type: 'card', props: {} }],
    } as unknown as GameState['zones']);
    const nextState = {
      ...state,
      zones: {
        ...state.zones,
        'hand:0': [],
        'bench:1': [
          { id: 'other-token', type: 'card', props: {} },
          { id: 'shared-token', type: 'card', props: {} },
        ],
      },
    } as unknown as GameState;

    const draftIndex = createDraftTokenStateIndex(state);
    draftIndex.applyZoneDelta(state.zones, nextState.zones);

    assertIndexMatchesFreshRebuild('duplicate move', nextState, draftIndex.read());
  });

  it('direct token lookup matches canonical full-index occurrence semantics', () => {
    const state = makeTokenState({
      'zone-a': [{ id: 'shared', type: 'card', props: {} }],
      'zone-b': [{ id: 'other', type: 'card', props: {} }],
      'zone-c': [{ id: 'shared', type: 'card', props: {} }],
    } as unknown as GameState['zones']);
    const direct = __internal_for_tests.findTokenStateIndexEntry(state, 'shared');
    const indexed = getTokenStateIndex(state).get('shared');

    assert.deepEqual(direct, indexed);
    assert.equal(direct?.occurrenceCount, 2);
    assert.deepEqual(direct?.occurrenceZoneIds, ['zone-a', 'zone-c']);
  });

  it('snapshots only states that leave the private preview lifetime', () => {
    const state = makeTokenState({
      source: [{ id: 'unit', type: 'pawn', props: {} }],
      middle: [],
      final: [],
    } as unknown as GameState['zones']);
    const privatePreview = {
      ...state,
      zones: {
        ...state.zones,
        source: [],
        middle: [{ id: asTokenId('unit'), type: 'pawn', props: {} }],
      },
    } as unknown as GameState;
    const returnedPreview = {
      ...privatePreview,
      zones: {
        ...privatePreview.zones,
        middle: [],
        final: [{ id: asTokenId('unit'), type: 'pawn', props: {} }],
      },
    } as unknown as GameState;
    const laterPrivatePreview = {
      ...returnedPreview,
      zones: {
        ...returnedPreview.zones,
        source: [{ id: asTokenId('unit'), type: 'pawn', props: {} }],
        final: [],
      },
    } as unknown as GameState;

    const draftIndex = createDraftTokenStateIndex(state);
    __internal_for_tests.resetBuildTokenStateIndexCount();

    draftIndex.applyZoneDelta(state.zones, privatePreview.zones);
    draftIndex.attachPreviewState(privatePreview);
    assert.equal(__internal_for_tests.getDraftTokenStateIndexSnapshotCount(), 0);
    assertIndexMatchesFreshRebuild('private preview reads use live draft index', privatePreview, getTokenStateIndex(privatePreview));

    draftIndex.applyZoneDelta(privatePreview.zones, returnedPreview.zones);
    draftIndex.attachAsCanonical(returnedPreview);
    assert.equal(__internal_for_tests.getDraftTokenStateIndexSnapshotCount(), 1);
    assertIndexMatchesFreshRebuild('returned preview snapshot before later mutation', returnedPreview, getTokenStateIndex(returnedPreview));

    draftIndex.applyZoneDelta(returnedPreview.zones, laterPrivatePreview.zones);
    draftIndex.attachPreviewState(laterPrivatePreview);
    assert.equal(__internal_for_tests.getDraftTokenStateIndexSnapshotCount(), 1);
    assert.equal(__internal_for_tests.getDraftTokenStateIndexCowCopyCount(), 1);
    assertIndexMatchesFreshRebuild('private preview cache survives copy-on-write detach', privatePreview, getTokenStateIndex(privatePreview));
    assertIndexMatchesFreshRebuild('returned preview snapshot survives later draft mutation', returnedPreview, getTokenStateIndex(returnedPreview));
    assertIndexMatchesFreshRebuild('later private preview uses live draft index', laterPrivatePreview, getTokenStateIndex(laterPrivatePreview));
  });
});

describe('refreshCachedTokenStateIndexEntries scoped scan (Option A)', () => {
  it('matches a fresh rebuild when a token is removed from a non-mutated zone counterpart', () => {
    const before = makeTokenState({
      'zone-a': [{ id: 'shared', type: 'card', props: {} }],
      'zone-b': [{ id: 'shared', type: 'card', props: {} }],
      'zone-c': [{ id: 'other', type: 'card', props: {} }],
    } as unknown as GameState['zones']);
    primeCache(before);

    // Mutate zone-b to remove `shared`. zone-a is untouched, but the cached
    // entry's occurrenceZoneIds must let us know to keep scanning it.
    (before.zones as Record<string, Token[]>)['zone-b'] = [];
    const ok = refreshCachedTokenStateIndexEntries(
      before,
      new Set(['shared']),
      new Set(['zone-b']),
    );
    assert.equal(ok, true);
    assertIndexMatchesFreshRebuild('shared remains in non-mutated zone-a', before, getTokenStateIndex(before));
  });

  it('matches a fresh rebuild when a multi-occurrence token gains a new zone', () => {
    const state = makeTokenState({
      'zone-a': [{ id: 'shared', type: 'card', props: {} }],
      'zone-b': [{ id: 'other', type: 'card', props: {} }],
      'zone-c': [{ id: 'shared', type: 'card', props: {} }],
    } as unknown as GameState['zones']);
    primeCache(state);

    // Add `shared` into zone-b — a zone the token was NOT previously in.
    (state.zones as Record<string, readonly Token[]>)['zone-b'] = [
      { id: asTokenId('other'), type: 'card', props: {} },
      { id: asTokenId('shared'), type: 'card', props: {} },
    ];
    const ok = refreshCachedTokenStateIndexEntries(
      state,
      new Set(['shared']),
      new Set(['zone-b']),
    );
    assert.equal(ok, true);
    assertIndexMatchesFreshRebuild('shared now in zone-a, zone-b, zone-c', state, getTokenStateIndex(state));
  });

  it('matches a fresh rebuild when the primary zone changes due to mutation', () => {
    // Prior: shared in zone-b (primary, since we omit zone-a from initial state).
    const state = makeTokenState({
      'zone-a': [{ id: 'unrelated', type: 'card', props: {} }],
      'zone-b': [{ id: 'shared', type: 'card', props: {} }],
      'zone-c': [{ id: 'shared', type: 'card', props: {} }],
    } as unknown as GameState['zones']);
    primeCache(state);

    // Remove from zone-b (its prior primary). zone-c becomes the sole occurrence.
    (state.zones as Record<string, Token[]>)['zone-b'] = [];
    const ok = refreshCachedTokenStateIndexEntries(
      state,
      new Set(['shared']),
      new Set(['zone-b']),
    );
    assert.equal(ok, true);
    assertIndexMatchesFreshRebuild('primary collapses from zone-b → zone-c', state, getTokenStateIndex(state));
  });

  it('matches a fresh rebuild when the same zone holds multiple occurrences and one is removed', () => {
    const state = makeTokenState({
      'zone-a': [
        { id: 'shared', type: 'card', props: {} },
        { id: 'shared', type: 'card', props: {} },
      ],
      'zone-b': [{ id: 'other', type: 'card', props: {} }],
    } as unknown as GameState['zones']);
    primeCache(state);

    (state.zones as Record<string, readonly Token[]>)['zone-a'] = [
      { id: asTokenId('shared'), type: 'card', props: {} },
    ];
    const ok = refreshCachedTokenStateIndexEntries(
      state,
      new Set(['shared']),
      new Set(['zone-a']),
    );
    assert.equal(ok, true);
    assertIndexMatchesFreshRebuild('multi-occurrence in same zone collapses to one', state, getTokenStateIndex(state));
  });

  it('matches a fresh rebuild when a token is fully removed from every zone', () => {
    const state = makeTokenState({
      'zone-a': [{ id: 'doomed', type: 'card', props: {} }],
      'zone-b': [{ id: 'doomed', type: 'card', props: {} }],
    } as unknown as GameState['zones']);
    primeCache(state);

    (state.zones as Record<string, Token[]>)['zone-a'] = [];
    (state.zones as Record<string, Token[]>)['zone-b'] = [];
    const ok = refreshCachedTokenStateIndexEntries(
      state,
      new Set(['doomed']),
      new Set(['zone-a', 'zone-b']),
    );
    assert.equal(ok, true);
    assertIndexMatchesFreshRebuild('doomed token deleted', state, getTokenStateIndex(state));
    assert.equal(getTokenStateIndex(state).get('doomed'), undefined);
  });

  it('matches a fresh rebuild when one refresh covers multiple changed tokens in shared zones', () => {
    const state = makeTokenState({
      'zone-a': [
        { id: 'alpha', type: 'card', props: { status: 'ready' } },
        { id: 'beta', type: 'card', props: { status: 'ready' } },
        { id: 'shared', type: 'card', props: { status: 'ready' } },
      ],
      'zone-b': [
        { id: 'shared', type: 'card', props: { status: 'ready' } },
        { id: 'gamma', type: 'card', props: { status: 'ready' } },
      ],
      'zone-c': [],
    } as unknown as GameState['zones']);
    primeCache(state);

    (state.zones as Record<string, readonly Token[]>)['zone-a'] = [
      { id: asTokenId('alpha'), type: 'card', props: { status: 'spent' } },
      { id: asTokenId('shared'), type: 'card', props: { status: 'ready' } },
    ];
    (state.zones as Record<string, readonly Token[]>)['zone-b'] = [
      { id: asTokenId('gamma'), type: 'card', props: { status: 'spent' } },
    ];
    (state.zones as Record<string, readonly Token[]>)['zone-c'] = [
      { id: asTokenId('beta'), type: 'card', props: { status: 'ready' } },
    ];

    const ok = refreshCachedTokenStateIndexEntries(
      state,
      new Set(['alpha', 'beta', 'shared', 'gamma']),
      new Set(['zone-a', 'zone-b', 'zone-c']),
    );

    assert.equal(ok, true);
    assertIndexMatchesFreshRebuild('shared-zone multi-token refresh', state, getTokenStateIndex(state));
  });

  it('returns false when no cache entry exists yet', () => {
    const state = makeTokenState({ 'zone-a': [] } as unknown as GameState['zones']);
    const ok = refreshCachedTokenStateIndexEntries(state, new Set(['x']), new Set(['zone-a']));
    assert.equal(ok, false);
  });
});

describe('POLPREVDRIVE-007 residual token-state index cache', () => {
  it('preserves a cached index across prop-only token mutations', () => {
    const ctx = makeEffectScopedIndexContext();
    assertIndexMatchesFreshRebuild('initial cached state', ctx.state, getTokenStateIndex(ctx.state));
    __internal_for_tests.resetBuildTokenStateIndexCount();

    const result = applyEffects([
      bindActiveCount('$before'),
      eff({ setTokenProp: { token: '$unit', prop: 'status', value: 'inactive' } }),
      eff({ setTokenProp: { token: '$unit', prop: 'status', value: 'inactive' } }),
      bindActiveCount('$after'),
    ], ctx);

    assert.equal(result.bindings.$before, 2);
    assert.equal(result.bindings.$after, 1);
    assert.equal(result.state.zones['battlefield:none']?.[0]?.props.status, 'inactive');
    assert.equal(
      __internal_for_tests.getBuildTokenStateIndexCount(),
      0,
      'outer mutable effect scopes should inherit and preserve the cached token-state index',
    );
    assertIndexMatchesFreshRebuild('effect-scoped final state', result.state, getTokenStateIndex(result.state));
  });

  it('shares copied indexes until mutable-zone refresh detaches them', () => {
    const canonical = makeTokenState({
      source: [{ id: asTokenId('unit'), type: 'pawn', props: {} }],
      target: [],
    } as unknown as GameState['zones']);
    const canonicalIndex = getTokenStateIndex(canonical);
    const preview = {
      ...canonical,
      zones: { ...canonical.zones },
    } as GameState;

    copyCachedTokenStateIndex(canonical, preview);
    assert.equal(getTokenStateIndex(preview), canonicalIndex);

    (preview.zones as Record<string, Token[]>)['source'] = [];
    (preview.zones as Record<string, Token[]>)['target'] = [
      { id: asTokenId('unit'), type: 'pawn', props: {} },
    ];
    const ok = refreshCachedTokenStateIndexEntries(preview, new Set(['unit']), new Set(['source', 'target']));
    assert.equal(ok, true);

    assertIndexMatchesFreshRebuild('canonical cache remains unchanged after preview refresh', canonical, getTokenStateIndex(canonical));
    assertIndexMatchesFreshRebuild('preview cache detaches after zone refresh', preview, getTokenStateIndex(preview));
    assert.equal(getTokenStateIndex(canonical), canonicalIndex);
    assert.notEqual(getTokenStateIndex(preview), canonicalIndex);
  });

  it('preserves token-state index across mutable top-level zone clones', () => {
    const canonical = makeTokenState({
      source: [{ id: asTokenId('unit'), type: 'pawn', props: {} }],
      target: [],
    } as unknown as GameState['zones']);
    const canonicalIndex = getTokenStateIndex(canonical);
    __internal_for_tests.resetBuildTokenStateIndexCount();

    const mutableClone = freezeState(createMutableState(canonical));
    const clonedIndex = getTokenStateIndex(mutableClone);

    assert.equal(clonedIndex, canonicalIndex);
    assert.equal(
      __internal_for_tests.getBuildTokenStateIndexCount(),
      0,
      'top-level zones clones should inherit the cached token-state index instead of rebuilding',
    );
    assertIndexMatchesFreshRebuild('mutable top-level zone clone', mutableClone, clonedIndex);
  });

  it('refreshes large zone mutations without forcing a full token-state rebuild', () => {
    const ctx = makeLargeZoneMoveContext();
    assertIndexMatchesFreshRebuild('initial large-zone cached state', ctx.state, getTokenStateIndex(ctx.state));
    __internal_for_tests.resetBuildTokenStateIndexCount();

    const result = applyEffects([
      eff({ moveToken: { token: '$unit', from: 'source:none', to: 'target:none', position: 'bottom' } }),
      eff({
        bindValue: {
          bind: '$probeStatus',
          value: { _t: 2 as const, ref: 'tokenProp', token: '$probe', prop: 'status' },
        },
      }),
    ], ctx);

    assert.equal(result.bindings.$probeStatus, 'active');
    assert.equal(result.state.zones['source:none']?.length, 23);
    assert.equal(result.state.zones['target:none']?.length, 4);
    assert.equal(
      __internal_for_tests.getBuildTokenStateIndexCount(),
      0,
      'large mutable zone updates should refresh the copied index instead of invalidating and rebuilding',
    );
    assertIndexMatchesFreshRebuild('large-zone move final state', result.state, getTokenStateIndex(result.state));
  });
});

function assertIndexMatchesFreshRebuild(
  label: string,
  state: GameState,
  actual: ReadonlyMap<string, TokenStateIndexEntry>,
): void {
  const expected = __internal_for_tests.buildTokenStateIndex(state);
  assert.deepEqual(toSortedEntries(actual), toSortedEntries(expected), label);
}

function primeCache(state: GameState): void {
  // Force the WeakMap entry to exist so refreshCachedTokenStateIndexEntries
  // has a baseline to update.
  getTokenStateIndex(state);
}

function toSortedEntries(index: ReadonlyMap<string, TokenStateIndexEntry>): readonly (readonly [string, TokenStateIndexEntry])[] {
  return [...index.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function makeTokenState(zones: GameState['zones']): GameState {
  return {
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones,
    nextTokenOrdinal: 0,
    currentPhase: 'main',
    activePlayer: 0,
    turnCount: 1,
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
  } as unknown as GameState;
}

function bindActiveCount(bind: string): EffectAST {
  return eff({
    bindValue: {
      bind,
      value: {
        _t: 5 as const,
        aggregate: {
          op: 'count',
          query: {
            query: 'tokensInZone',
            zone: 'battlefield:none',
            filter: { op: 'and', args: [{ prop: 'status', op: 'eq', value: 'active' }] },
          },
        },
      },
    },
  });
}

function makeEffectScopedIndexContext(): EffectContext {
  const def: GameDef = {
    metadata: { id: 'effect-scoped-token-state-index-test', players: { min: 1, max: 1 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('battlefield:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'unit', props: { status: 'string' } }],
    setup: [],
    turnStructure: { phases: [] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  };
  const tokens: readonly Token[] = [
    { id: asTokenId('u1'), type: 'unit', props: { status: 'active' } },
    { id: asTokenId('u2'), type: 'unit', props: { status: 'active' } },
  ];
  const state = makeTokenState({ 'battlefield:none': tokens });

  return makeExecutionEffectContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    rng: createRng(7n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: { $unit: 'u1' },
    moveParams: {},
    collector: createCollector(),
  });
}

function makeLargeZoneMoveContext(): EffectContext {
  const def: GameDef = {
    metadata: { id: 'large-zone-token-state-index-refresh-test', players: { min: 1, max: 1 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('source:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: asZoneId('target:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'unit', props: { status: 'string' } }],
    setup: [],
    turnStructure: { phases: [] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  };
  const sourceTokens = Array.from({ length: 24 }, (_, index): Token => ({
    id: asTokenId(`u${index}`),
    type: 'unit',
    props: { status: 'active' },
  }));
  const targetTokens = Array.from({ length: 3 }, (_, index): Token => ({
    id: asTokenId(`t${index}`),
    type: 'unit',
    props: { status: 'active' },
  }));
  const state = makeTokenState({
    'source:none': sourceTokens,
    'target:none': targetTokens,
  });

  return makeExecutionEffectContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    rng: createRng(11n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: { $unit: 'u0', $probe: 'u10' },
    moveParams: {},
    collector: createCollector(),
  });
}
