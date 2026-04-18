// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
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
// Helpers — minimal fixtures
// ---------------------------------------------------------------------------

const pid = (n: number): PlayerId => n as PlayerId;
const zid = (s: string): ZoneId => s as ZoneId;
const tid = (s: string): TokenId => s as TokenId;

const mkToken = (id: string, type = 'piece', props: Record<string, string | number | boolean> = {}): Token => ({
  id: tid(id),
  type,
  props,
});

const mkZoneDef = (opts: {
  readonly id: string;
  readonly visibility?: 'public' | 'owner' | 'hidden';
  readonly owner?: 'none' | 'player';
  readonly ownerPlayerIndex?: number;
  readonly ordering?: 'stack' | 'queue' | 'set';
}): ZoneDef => ({
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
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
    ...(reveals !== undefined ? { reveals } : {}),
  }) as unknown as GameState;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('derivePlayerObservation', () => {
  // AC 1: Public zone — all tokens visible to any observer
  it('returns all tokens in a public zone for any observer', () => {
    const zone = mkZoneDef({ id: 'pub', visibility: 'public' });
    const tokens = [mkToken('t1'), mkToken('t2')];
    const def = mkDef([zone]);
    const state = mkState({ 'pub': tokens });

    const obs = derivePlayerObservation(def, state, pid(0));

    assert.deepStrictEqual(obs.visibleTokenIdsByZone['pub'], ['t1', 't2']);
    assert.strictEqual(obs.observer, pid(0));
  });

  // AC 2: Owner zone — tokens visible only to owner
  it('shows owner-zone tokens to zone owner only', () => {
    const zone = mkZoneDef({ id: 'hand:0', visibility: 'owner', owner: 'player', ownerPlayerIndex: 0 });
    const tokens = [mkToken('c1'), mkToken('c2')];
    const def = mkDef([zone]);
    const state = mkState({ 'hand:0': tokens });

    const ownerObs = derivePlayerObservation(def, state, pid(0));
    assert.deepStrictEqual(ownerObs.visibleTokenIdsByZone['hand:0'], ['c1', 'c2']);

    const otherObs = derivePlayerObservation(def, state, pid(1));
    assert.deepStrictEqual(otherObs.visibleTokenIdsByZone['hand:0'], []);
  });

  // AC 3: Hidden zone — no tokens visible without grants
  it('hides all tokens in a hidden zone without grants', () => {
    const zone = mkZoneDef({ id: 'deck', visibility: 'hidden', ordering: 'stack' });
    const tokens = [mkToken('d1'), mkToken('d2'), mkToken('d3')];
    const def = mkDef([zone]);
    const state = mkState({ 'deck': tokens });

    const obs = derivePlayerObservation(def, state, pid(0));
    assert.deepStrictEqual(obs.visibleTokenIdsByZone['deck'], []);
  });

  // AC 4: Reveal grant — hidden zone becomes visible to granted observer
  it('reveals hidden-zone tokens via a reveal grant', () => {
    const zone = mkZoneDef({ id: 'secret', visibility: 'hidden' });
    const tokens = [mkToken('s1'), mkToken('s2')];
    const def = mkDef([zone]);
    const grant: RevealGrant = { observers: [pid(0)] };
    const state = mkState({ 'secret': tokens }, { 'secret': [grant] });

    const grantedObs = derivePlayerObservation(def, state, pid(0));
    assert.deepStrictEqual(grantedObs.visibleTokenIdsByZone['secret'], ['s1', 's2']);

    const ungrantedObs = derivePlayerObservation(def, state, pid(1));
    assert.deepStrictEqual(ungrantedObs.visibleTokenIdsByZone['secret'], []);
  });

  // AC 5: Filtered reveal — only matching tokens visible
  it('filters tokens through filtered reveal grants', () => {
    const zone = mkZoneDef({ id: 'hidden', visibility: 'hidden' });
    const tokens = [
      mkToken('red1', 'piece', { color: 'red' }),
      mkToken('blue1', 'piece', { color: 'blue' }),
      mkToken('red2', 'piece', { color: 'red' }),
    ];
    const def = mkDef([zone]);
    const grant: RevealGrant = {
      observers: [pid(0)],
      filter: { prop: 'color', op: 'eq', value: 'red' },
    };
    const state = mkState({ 'hidden': tokens }, { 'hidden': [grant] });

    const obs = derivePlayerObservation(def, state, pid(0));
    assert.deepStrictEqual(obs.visibleTokenIdsByZone['hidden'], ['red1', 'red2']);
  });

  // AC 6: hiddenSamplingZones is empty for fully public state
  it('sets hiddenSamplingZones to [] for fully public state', () => {
    const zones = [
      mkZoneDef({ id: 'a', visibility: 'public' }),
      mkZoneDef({ id: 'b', visibility: 'public' }),
    ];
    const def = mkDef(zones);
    const state = mkState({ 'a': [mkToken('t1')], 'b': [mkToken('t2')] });

    const obs = derivePlayerObservation(def, state, pid(0));
    assert.deepStrictEqual(obs.hiddenSamplingZones, []);
  });

  // AC 7: hiddenSamplingZones is sorted when hidden/owner zones with tokens exist
  it('sets hiddenSamplingZones to the sorted hidden zone ids when hidden tokens exist', () => {
    const zones = [
      mkZoneDef({ id: 'deck', visibility: 'hidden' }),
      mkZoneDef({ id: 'hand', visibility: 'hidden' }),
      mkZoneDef({ id: 'pub', visibility: 'public' }),
    ];
    const def = mkDef(zones);
    const state = mkState({ 'pub': [mkToken('t1')], 'deck': [mkToken('d1')], 'hand': [mkToken('h1')] });

    const obs = derivePlayerObservation(def, state, pid(0));
    assert.deepStrictEqual(obs.hiddenSamplingZones, ['deck', 'hand']);
  });

  // AC 8: Ordering info preserved for stack/queue zones
  it('preserves ordering for stack/queue zones', () => {
    const stackZone = mkZoneDef({ id: 'stack', visibility: 'public', ordering: 'stack' });
    const queueZone = mkZoneDef({ id: 'queue', visibility: 'public', ordering: 'queue' });
    const setZone = mkZoneDef({ id: 'set', visibility: 'public', ordering: 'set' });
    const def = mkDef([stackZone, queueZone, setZone]);
    const state = mkState({
      'stack': [mkToken('s1'), mkToken('s2')],
      'queue': [mkToken('q1'), mkToken('q2')],
      'set': [mkToken('x1'), mkToken('x2')],
    });

    const obs = derivePlayerObservation(def, state, pid(0));

    // Stack and queue zones have ordering info
    assert.deepStrictEqual(obs.visibleTokenOrderByZone['stack'], ['s1', 's2']);
    assert.deepStrictEqual(obs.visibleTokenOrderByZone['queue'], ['q1', 'q2']);
    // Set zones have no ordering info
    assert.strictEqual(obs.visibleTokenOrderByZone['set'], undefined);
  });

  // Additional: visibleRevealsByZone records active grants for observer
  it('records active reveal grants per zone for the observer', () => {
    const zone = mkZoneDef({ id: 'sec', visibility: 'hidden' });
    const grant: RevealGrant = { observers: [pid(0)] };
    const otherGrant: RevealGrant = { observers: [pid(1)] };
    const def = mkDef([zone]);
    const state = mkState({ 'sec': [mkToken('s1')] }, { 'sec': [grant, otherGrant] });

    const obs0 = derivePlayerObservation(def, state, pid(0));
    assert.deepStrictEqual(obs0.visibleRevealsByZone['sec'], [grant]);

    const obs1 = derivePlayerObservation(def, state, pid(1));
    assert.deepStrictEqual(obs1.visibleRevealsByZone['sec'], [otherGrant]);
  });

  // Additional: 'all' observer grants
  it('handles reveal grants with observers set to all', () => {
    const zone = mkZoneDef({ id: 'deck', visibility: 'hidden' });
    const tokens = [mkToken('d1')];
    const grant: RevealGrant = { observers: 'all' };
    const def = mkDef([zone]);
    const state = mkState({ 'deck': tokens }, { 'deck': [grant] });

    const obs = derivePlayerObservation(def, state, pid(0));
    assert.deepStrictEqual(obs.visibleTokenIdsByZone['deck'], ['d1']);
    const obs1 = derivePlayerObservation(def, state, pid(1));
    assert.deepStrictEqual(obs1.visibleTokenIdsByZone['deck'], ['d1']);
  });

  // Edge: empty zone
  it('handles empty zones gracefully', () => {
    const zone = mkZoneDef({ id: 'empty', visibility: 'hidden' });
    const def = mkDef([zone]);
    const state = mkState({ 'empty': [] });

    const obs = derivePlayerObservation(def, state, pid(0));
    assert.deepStrictEqual(obs.visibleTokenIdsByZone['empty'], []);
    assert.deepStrictEqual(obs.hiddenSamplingZones, []);
  });

  // Owner zone with grant for non-owner
  it('applies grants to owner zones for non-owners', () => {
    const zone = mkZoneDef({ id: 'hand:0', visibility: 'owner', owner: 'player', ownerPlayerIndex: 0 });
    const tokens = [mkToken('c1'), mkToken('c2')];
    const grant: RevealGrant = { observers: [pid(1)] };
    const def = mkDef([zone]);
    const state = mkState({ 'hand:0': tokens }, { 'hand:0': [grant] });

    // Non-owner with grant should see all tokens
    const obs = derivePlayerObservation(def, state, pid(1));
    assert.deepStrictEqual(obs.visibleTokenIdsByZone['hand:0'], ['c1', 'c2']);
  });
});
