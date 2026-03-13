import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sampleBeliefState } from '../../../../src/agents/mcts/belief.js';
import { derivePlayerObservation } from '../../../../src/kernel/observation.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { asPlayerId, asZoneId, asTokenId, asPhaseId, asActionId } from '../../../../src/kernel/branded.js';
import type { GameDef, GameState, Token, ZoneDef } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pid = asPlayerId;
const zid = asZoneId;
const tid = asTokenId;
const phid = asPhaseId;

const mkToken = (id: string, type: string): Token => ({
  id: tid(id),
  type,
  props: {},
});

const mkZone = (
  id: string,
  visibility: 'public' | 'owner' | 'hidden',
  ownerPlayerIndex?: number,
): ZoneDef => ({
  id: zid(id),
  owner: ownerPlayerIndex !== undefined ? 'player' : 'none',
  visibility,
  ordering: 'set' as const,
  ...(ownerPlayerIndex !== undefined ? { ownerPlayerIndex } : {}),
});

/** Minimal GameDef sufficient for belief sampling tests. */
const buildDef = (zones: readonly ZoneDef[]): GameDef => ({
  metadata: { id: 'belief-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones,
  tokenTypes: [{ id: 'unit', props: {} }],
  setup: [],
  turnStructure: {
    phases: [{
      id: phid('main'),
    }],
  },
  actions: [{
    id: asActionId('pass'),
    actor: 'active',
    executor: 'active',
    phase: [phid('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  }],
  triggers: [],
  terminal: { conditions: [] },
});

/** Minimal GameState with the given zones and a fixed RNG seed. */
const buildState = (
  zones: Readonly<Record<string, readonly Token[]>>,
  seed: bigint = 42n,
): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones,
  nextTokenOrdinal: 100,
  currentPhase: phid('main'),
  activePlayer: pid(0),
  turnCount: 1,
  rng: createRng(seed).state,
  stateHash: 12345n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sampleBeliefState', () => {
  // -- Fixture: one public zone, one hidden zone --
  const publicZone = mkZone('board', 'public');
  const hiddenZone = mkZone('deck', 'hidden');
  const def = buildDef([publicZone, hiddenZone]);

  const publicTokens: readonly Token[] = [
    mkToken('pub-1', 'unit'),
    mkToken('pub-2', 'unit'),
  ];
  const hiddenTokens: readonly Token[] = [
    mkToken('hid-1', 'unit'),
    mkToken('hid-2', 'unit'),
    mkToken('hid-3', 'unit'),
    mkToken('hid-4', 'unit'),
  ];

  const rootState = buildState({
    board: publicTokens,
    deck: hiddenTokens,
  });

  const observer = pid(0);
  const searchRng = createRng(99n);

  it('preserves visible tokens in public zones', () => {
    const obs = derivePlayerObservation(def, rootState, observer);
    const { state } = sampleBeliefState(def, rootState, obs, observer, searchRng);

    // Public zone tokens must be identical and in the same order.
    assert.deepEqual(state.zones['board'], publicTokens);
  });

  it('preserves zone token counts', () => {
    const obs = derivePlayerObservation(def, rootState, observer);
    const { state } = sampleBeliefState(def, rootState, obs, observer, searchRng);

    assert.equal(
      (state.zones['board'] ?? []).length,
      publicTokens.length,
      'public zone count mismatch',
    );
    assert.equal(
      (state.zones['deck'] ?? []).length,
      hiddenTokens.length,
      'hidden zone count mismatch',
    );
  });

  it('preserves the set of token IDs per zone (no cross-zone movement)', () => {
    const obs = derivePlayerObservation(def, rootState, observer);
    const { state } = sampleBeliefState(def, rootState, obs, observer, searchRng);

    const originalIds = new Set(hiddenTokens.map((t) => t.id as string));
    const sampledIds = new Set((state.zones['deck'] ?? []).map((t) => t.id as string));
    assert.deepEqual(sampledIds, originalIds);
  });

  it('replaces state RNG (differs from root)', () => {
    const obs = derivePlayerObservation(def, rootState, observer);
    const { state } = sampleBeliefState(def, rootState, obs, observer, searchRng);

    assert.notDeepEqual(state.rng, rootState.rng);
  });

  it('sets stateHash to 0n (search-only marker)', () => {
    const obs = derivePlayerObservation(def, rootState, observer);
    const { state } = sampleBeliefState(def, rootState, obs, observer, searchRng);

    assert.equal(state.stateHash, 0n);
  });

  it('is deterministic: same inputs produce same output', () => {
    const obs = derivePlayerObservation(def, rootState, observer);
    const a = sampleBeliefState(def, rootState, obs, observer, searchRng);
    const b = sampleBeliefState(def, rootState, obs, observer, searchRng);

    assert.deepEqual(a.state.zones, b.state.zones);
    assert.deepEqual(a.state.rng, b.state.rng);
    assert.deepEqual(a.rng.state, b.rng.state);
  });

  it('does not mutate the root state', () => {
    const obs = derivePlayerObservation(def, rootState, observer);

    // Snapshot zone token IDs and RNG state before sampling.
    const zoneIdsBefore = Object.fromEntries(
      Object.entries(rootState.zones).map(([z, ts]) => [z, ts.map((t) => t.id)]),
    );
    const rngStateBefore = [...rootState.rng.state];
    const hashBefore = rootState.stateHash;

    sampleBeliefState(def, rootState, obs, observer, searchRng);

    const zoneIdsAfter = Object.fromEntries(
      Object.entries(rootState.zones).map(([z, ts]) => [z, ts.map((t) => t.id)]),
    );
    assert.deepEqual(zoneIdsAfter, zoneIdsBefore);
    assert.deepEqual([...rootState.rng.state], rngStateBefore);
    assert.equal(rootState.stateHash, hashBefore);
  });

  it('no-op shuffle for perfect-info games (only RNG differs)', () => {
    // All-public game: no hidden sampling needed.
    const allPublicDef = buildDef([mkZone('area', 'public')]);
    const tokens: readonly Token[] = [mkToken('a', 'unit'), mkToken('b', 'unit')];
    const state = buildState({ area: tokens });
    const obs = derivePlayerObservation(allPublicDef, state, observer);

    assert.equal(obs.requiresHiddenSampling, false, 'should not require sampling');

    const { state: sampled } = sampleBeliefState(allPublicDef, state, obs, observer, searchRng);

    // Tokens identical.
    assert.deepEqual(sampled.zones['area'], tokens);
    // RNG replaced.
    assert.notDeepEqual(sampled.rng, state.rng);
  });

  it('observation after sampling matches observation before sampling', () => {
    const obsBefore = derivePlayerObservation(def, rootState, observer);
    const { state } = sampleBeliefState(def, rootState, obsBefore, observer, searchRng);
    const obsAfter = derivePlayerObservation(def, state, observer);

    assert.deepEqual(
      obsAfter.visibleTokenIdsByZone,
      obsBefore.visibleTokenIdsByZone,
    );
  });

  it('preserves visible tokens in owner zones for the owner', () => {
    const ownerZone = mkZone('hand-0', 'owner', 0);
    const otherZone = mkZone('hand-1', 'owner', 1);
    const mixedDef = buildDef([ownerZone, otherZone]);

    const myTokens: readonly Token[] = [mkToken('m1', 'unit'), mkToken('m2', 'unit')];
    const theirTokens: readonly Token[] = [mkToken('t1', 'unit'), mkToken('t2', 'unit'), mkToken('t3', 'unit')];
    const state = buildState({ 'hand-0': myTokens, 'hand-1': theirTokens });

    const obs = derivePlayerObservation(mixedDef, state, pid(0));
    const { state: sampled } = sampleBeliefState(mixedDef, state, obs, pid(0), searchRng);

    // Owner's hand is fully visible — must be unchanged.
    assert.deepEqual(sampled.zones['hand-0'], myTokens);
    // Opponent's hand token count preserved.
    assert.equal((sampled.zones['hand-1'] ?? []).length, theirTokens.length);
    // Opponent's hand token IDs preserved (same set).
    const origIds = new Set(theirTokens.map((t) => t.id as string));
    const sampledIds = new Set((sampled.zones['hand-1'] ?? []).map((t) => t.id as string));
    assert.deepEqual(sampledIds, origIds);
  });

  it('advances the returned search RNG', () => {
    const obs = derivePlayerObservation(def, rootState, observer);
    const { rng: advanced } = sampleBeliefState(def, rootState, obs, observer, searchRng);

    // The continuation RNG should differ from the input.
    assert.notDeepEqual(advanced.state, searchRng.state);
  });
});
