import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  CompiledObserverProfile,
  CompiledSurfaceCatalog,
  GameDef,
  GameState,
  PlayerId,
  ZoneId,
  TokenId,
  Token,
  RevealGrant,
  ZoneDef,
} from '../../../src/kernel/index.js';
import { derivePlayerObservation } from '../../../src/kernel/observation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pid = (n: number): PlayerId => n as PlayerId;
const zid = (s: string): ZoneId => s as ZoneId;
const tid = (s: string): TokenId => s as TokenId;

const mkToken = (id: string): Token => ({
  id: tid(id),
  type: 'piece',
  props: {},
});

const mkZoneDef = (opts: {
  readonly id: string;
  readonly visibility?: 'public' | 'owner' | 'hidden';
  readonly owner?: 'none' | 'player';
  readonly ownerPlayerIndex?: number;
  readonly ordering?: 'stack' | 'queue' | 'set';
}): ZoneDef =>
  ({
    id: zid(opts.id),
    owner: opts.owner ?? 'none',
    visibility: opts.visibility ?? 'public',
    ordering: opts.ordering ?? 'set',
    ...(opts.ownerPlayerIndex !== undefined ? { ownerPlayerIndex: opts.ownerPlayerIndex } : {}),
  }) as ZoneDef;

const mkDef = (zones: ZoneDef[]): GameDef =>
  ({
    metadata: { id: 'test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones,
    tokenTypes: [{ id: 'piece', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const mkState = (
  zones: Record<string, readonly Token[]>,
  reveals?: Record<string, readonly RevealGrant[]>,
): GameState =>
  ({
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones,
    nextTokenOrdinal: 100,
    currentPhase: 'main',
    activePlayer: pid(0),
    turnCount: 1,
    rng: { s0: 0n, s1: 0n, s2: 0n, s3: 1n },
    actionUsage: {},
    turnOrderState: { type: 'preserve' },
    markers: {},
    ...(reveals !== undefined ? { reveals } : {}),
  }) as unknown as GameState;

const EMPTY_SURFACES: CompiledSurfaceCatalog = {
  globalVars: {},
  globalMarkers: {},
  perPlayerVars: {},
  derivedMetrics: {},
  victory: {
    currentMargin: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    currentRank: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  },
  activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
};

const mkProfile = (zones: CompiledObserverProfile['zones']): CompiledObserverProfile => ({
  fingerprint: 'test-fingerprint',
  surfaces: EMPTY_SURFACES,
  ...(zones !== undefined ? { zones } : {}),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('derivePlayerObservation — observer profile zone overrides', () => {
  // --- AC 1: Without observer profile, output is identical to current behavior ---
  it('without observer profile, hidden zone hides tokens', () => {
    const def = mkDef([mkZoneDef({ id: 'deck:none', visibility: 'hidden' })]);
    const state = mkState({ 'deck:none': [mkToken('t1'), mkToken('t2')] });
    const obs = derivePlayerObservation(def, state, pid(0));
    assert.deepEqual(obs.visibleTokenIdsByZone['deck:none'], []);
  });

  it('without observer profile, public zone shows tokens', () => {
    const def = mkDef([mkZoneDef({ id: 'board:none', visibility: 'public' })]);
    const state = mkState({ 'board:none': [mkToken('t1')] });
    const obs = derivePlayerObservation(def, state, pid(0));
    assert.deepEqual(obs.visibleTokenIdsByZone['board:none'], ['t1']);
  });

  // --- AC 2: Observer profile tokens: public on hidden zone makes all tokens visible ---
  it('observer tokens: public on hidden zone reveals all tokens', () => {
    const def = mkDef([mkZoneDef({ id: 'deck:none', visibility: 'hidden' })]);
    const state = mkState({ 'deck:none': [mkToken('t1'), mkToken('t2')] });
    const profile = mkProfile({
      entries: { deck: { tokens: 'public', order: 'public' } },
    });
    const obs = derivePlayerObservation(def, state, pid(0), profile);
    assert.deepEqual(obs.visibleTokenIdsByZone['deck:none'], ['t1', 't2']);
    assert.deepEqual(obs.hiddenSamplingZones, []);
  });

  // --- AC 3: Observer tokens: hidden on public zone hides all tokens ---
  it('observer tokens: hidden on public zone hides all tokens', () => {
    const def = mkDef([mkZoneDef({ id: 'board:none', visibility: 'public' })]);
    const state = mkState({ 'board:none': [mkToken('t1')] });
    const profile = mkProfile({
      entries: { board: { tokens: 'hidden', order: 'hidden' } },
    });
    const obs = derivePlayerObservation(def, state, pid(0), profile);
    assert.deepEqual(obs.visibleTokenIdsByZone['board:none'], []);
  });

  // --- AC 4: Observer tokens: owner on hidden zone shows tokens to owner only ---
  it('observer tokens: owner shows tokens to owner', () => {
    const def = mkDef([mkZoneDef({ id: 'hand:0', visibility: 'hidden', owner: 'player', ownerPlayerIndex: 0 })]);
    const state = mkState({ 'hand:0': [mkToken('t1')] });
    const profile = mkProfile({
      entries: { hand: { tokens: 'owner', order: 'owner' } },
    });
    const obs = derivePlayerObservation(def, state, pid(0), profile);
    assert.deepEqual(obs.visibleTokenIdsByZone['hand:0'], ['t1']);
  });

  it('observer tokens: owner hides tokens from non-owner', () => {
    const def = mkDef([mkZoneDef({ id: 'hand:0', visibility: 'hidden', owner: 'player', ownerPlayerIndex: 0 })]);
    const state = mkState({ 'hand:0': [mkToken('t1')] });
    const profile = mkProfile({
      entries: { hand: { tokens: 'owner', order: 'owner' } },
    });
    const obs = derivePlayerObservation(def, state, pid(1), profile);
    assert.deepEqual(obs.visibleTokenIdsByZone['hand:0'], []);
  });

  // --- AC 5: _default entry applies to unlisted zones ---
  it('_default entry applies to unlisted zones', () => {
    const def = mkDef([
      mkZoneDef({ id: 'board:none', visibility: 'public' }),
      mkZoneDef({ id: 'deck:none', visibility: 'public' }),
    ]);
    const state = mkState({
      'board:none': [mkToken('t1')],
      'deck:none': [mkToken('t2')],
    });
    const profile = mkProfile({
      entries: { board: { tokens: 'public', order: 'public' } },
      defaultEntry: { tokens: 'hidden', order: 'hidden' },
    });
    const obs = derivePlayerObservation(def, state, pid(0), profile);
    assert.deepEqual(obs.visibleTokenIdsByZone['board:none'], ['t1']);
    assert.deepEqual(obs.visibleTokenIdsByZone['deck:none'], []);
  });

  // --- AC 6: Specific entry overrides _default ---
  it('specific entry overrides _default', () => {
    const def = mkDef([mkZoneDef({ id: 'board:none', visibility: 'hidden' })]);
    const state = mkState({ 'board:none': [mkToken('t1')] });
    const profile = mkProfile({
      entries: { board: { tokens: 'public', order: 'public' } },
      defaultEntry: { tokens: 'hidden', order: 'hidden' },
    });
    const obs = derivePlayerObservation(def, state, pid(0), profile);
    assert.deepEqual(obs.visibleTokenIdsByZone['board:none'], ['t1']);
  });

  // --- AC 7: Reveal grants still work additively when observer overrides visibility ---
  it('reveal grants work when observer says tokens: hidden', () => {
    const def = mkDef([mkZoneDef({ id: 'deck:none', visibility: 'public' })]);
    const grant: RevealGrant = { observers: 'all' } as RevealGrant;
    const state = mkState(
      { 'deck:none': [mkToken('t1'), mkToken('t2')] },
      { 'deck:none': [grant] },
    );
    const profile = mkProfile({
      entries: { deck: { tokens: 'hidden', order: 'hidden' } },
    });
    const obs = derivePlayerObservation(def, state, pid(0), profile);
    // Reveal grant makes all tokens visible despite observer saying hidden
    assert.deepEqual(obs.visibleTokenIdsByZone['deck:none'], ['t1', 't2']);
  });

  // --- AC 8: Order visibility: observer says order: hidden on stack zone ---
  it('observer order: hidden on stack zone suppresses order output', () => {
    const def = mkDef([mkZoneDef({ id: 'deck:none', visibility: 'public', ordering: 'stack' })]);
    const state = mkState({ 'deck:none': [mkToken('t1'), mkToken('t2')] });
    const profile = mkProfile({
      entries: { deck: { tokens: 'public', order: 'hidden' } },
    });
    const obs = derivePlayerObservation(def, state, pid(0), profile);
    // Tokens visible
    assert.deepEqual(obs.visibleTokenIdsByZone['deck:none'], ['t1', 't2']);
    // Order suppressed
    assert.equal(obs.visibleTokenOrderByZone['deck:none'], undefined);
  });

  // --- AC 9: Order visibility: set zone ignores order field entirely ---
  it('set zone never populates order regardless of observer', () => {
    const def = mkDef([mkZoneDef({ id: 'board:none', visibility: 'public', ordering: 'set' })]);
    const state = mkState({ 'board:none': [mkToken('t1')] });
    const profile = mkProfile({
      entries: { board: { tokens: 'public', order: 'public' } },
    });
    const obs = derivePlayerObservation(def, state, pid(0), profile);
    assert.equal(obs.visibleTokenOrderByZone['board:none'], undefined);
  });

  // --- AC 10: omniscient profile makes all zones fully visible ---
  it('omniscient-style profile makes all zones visible', () => {
    const def = mkDef([mkZoneDef({ id: 'deck:none', visibility: 'hidden' })]);
    const state = mkState({ 'deck:none': [mkToken('t1'), mkToken('t2')] });
    const profile = mkProfile({
      entries: {},
      defaultEntry: { tokens: 'public', order: 'public' },
    });
    const obs = derivePlayerObservation(def, state, pid(0), profile);
    assert.deepEqual(obs.visibleTokenIdsByZone['deck:none'], ['t1', 't2']);
  });

  // --- Behavioral equivalence: undefined profile = no profile ---
  it('undefined profile produces same result as no profile', () => {
    const def = mkDef([
      mkZoneDef({ id: 'board:none', visibility: 'public' }),
      mkZoneDef({ id: 'hand:0', visibility: 'owner', owner: 'player', ownerPlayerIndex: 0, ordering: 'stack' }),
    ]);
    const state = mkState({
      'board:none': [mkToken('t1')],
      'hand:0': [mkToken('t2')],
    });
    const without = derivePlayerObservation(def, state, pid(0));
    const withUndefined = derivePlayerObservation(def, state, pid(0), undefined);
    assert.deepEqual(without, withUndefined);
  });
});
