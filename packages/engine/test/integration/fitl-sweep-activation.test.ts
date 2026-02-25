import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, ...extra },
});

function makeDef(): GameDef {
  return {
    metadata: { id: 'sweep-activation-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('quangTri:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [
      { id: 'troops', props: { faction: 'string' } },
      { id: 'police', props: { faction: 'string' } },
      { id: 'irregulars', props: { faction: 'string' } },
      { id: 'guerrilla', props: { faction: 'string', activity: 'string' } },
    ],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  };
}

function makeState(zones: Record<string, Token[]>): GameState {
  return {
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones,
    nextTokenOrdinal: 50,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  };
}

/** Build the expanded sweep-activation effects for a given zone with concrete values. */
function buildSweepActivationEffects(zone: string, cubeCount: number, sfCount: number, isJungle: boolean): readonly EffectAST[] {
  const totalSweepers = cubeCount + sfCount;
  const activationLimit = isJungle ? Math.floor(totalSweepers / 2) : totalSweepers;

  // The sweep-activation macro expands to: count cubes, count SF, compute total,
  // halve for jungle, then forEach underground guerrillas up to limit → set active.
  // We test the runtime effect directly: activate up to `activationLimit` underground guerrillas.
  // Note: filtering only by activity='underground' suffices since troops/police/SF tokens
  // don't have an 'activity' prop and will be excluded by the predicate.
  if (activationLimit <= 0) {
    return []; // No activations when limit is 0 (kernel rejects forEach.limit=0)
  }
  return [
    {
      forEach: {
        bind: '$guerrilla',
        over: {
          query: 'tokensInZone',
          zone,
          filter: [
            { prop: 'activity', op: 'eq', value: 'underground' },
          ],
        },
        limit: activationLimit,
        effects: [
          { setTokenProp: { token: '$guerrilla', prop: 'activity', value: 'active' } },
        ],
      },
    },
  ];
}

function makeCtx(state: GameState): EffectContext {
  return {
    def: makeDef(),
    adjacencyGraph: buildAdjacencyGraph([]),
    state,
    rng: createRng(42n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams: {},
    collector: createCollector(),
  };
}

describe('FITL sweep-activation macro', () => {
  describe('non-jungle terrain (1:1 activation ratio)', () => {
    it('activates guerrillas up to sweeper count', () => {
      // 3 US troops + 1 SF = 4 sweepers, non-jungle → activate up to 4
      // 5 underground guerrillas → 4 activated, 1 stays underground
      const state = makeState({
        'quangTri:none': [
          makeToken('t1', 'troops', 'US'),
          makeToken('t2', 'troops', 'US'),
          makeToken('t3', 'troops', 'US'),
          makeToken('sf1', 'irregulars', 'US'),
          makeToken('g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('g2', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('g3', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('g4', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('g5', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
      });

      const effects = buildSweepActivationEffects('quangTri:none', 3, 1, false);
      const ctx = makeCtx(state);
      const result = applyEffects(effects, ctx);

      const guerrillas = result.state.zones['quangTri:none']?.filter(
        (t) => t.type === 'guerrilla',
      ) ?? [];
      const activeCount = guerrillas.filter((g) => g.props.activity === 'active').length;
      const undergroundCount = guerrillas.filter((g) => g.props.activity === 'underground').length;

      assert.equal(activeCount, 4, 'Should activate 4 guerrillas (3 cubes + 1 SF)');
      assert.equal(undergroundCount, 1, 'Should leave 1 guerrilla underground');
    });

    it('does not activate more than available underground guerrillas', () => {
      // 4 sweepers but only 2 underground guerrillas → activate 2
      const state = makeState({
        'quangTri:none': [
          makeToken('t1', 'troops', 'US'),
          makeToken('t2', 'troops', 'US'),
          makeToken('t3', 'troops', 'US'),
          makeToken('sf1', 'irregulars', 'US'),
          makeToken('g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('g2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      });

      const effects = buildSweepActivationEffects('quangTri:none', 3, 1, false);
      const ctx = makeCtx(state);
      const result = applyEffects(effects, ctx);

      const guerrillas = result.state.zones['quangTri:none']?.filter(
        (t) => t.type === 'guerrilla',
      ) ?? [];
      const activeCount = guerrillas.filter((g) => g.props.activity === 'active').length;

      assert.equal(activeCount, 2, 'Should activate all 2 guerrillas (limit > available)');
    });

    it('skips already-active guerrillas', () => {
      // 2 sweepers, 1 already active + 2 underground → activate 2 underground
      const state = makeState({
        'quangTri:none': [
          makeToken('t1', 'troops', 'US'),
          makeToken('t2', 'troops', 'US'),
          makeToken('g1', 'guerrilla', 'NVA', { activity: 'active' }),
          makeToken('g2', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('g3', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      });

      const effects = buildSweepActivationEffects('quangTri:none', 2, 0, false);
      const ctx = makeCtx(state);
      const result = applyEffects(effects, ctx);

      const guerrillas = result.state.zones['quangTri:none']?.filter(
        (t) => t.type === 'guerrilla',
      ) ?? [];
      const activeCount = guerrillas.filter((g) => g.props.activity === 'active').length;
      const undergroundCount = guerrillas.filter((g) => g.props.activity === 'underground').length;

      assert.equal(activeCount, 3, 'Should have 3 active (1 was already active + 2 newly activated)');
      assert.equal(undergroundCount, 0, 'Should have 0 underground');
    });
  });

  describe('jungle terrain (1:2 activation ratio)', () => {
    it('halves activation limit (round down) for jungle', () => {
      // 5 sweepers in jungle → floor(5/2) = 2 activations
      // 4 underground guerrillas → activate 2
      const state = makeState({
        'quangTri:none': [
          makeToken('t1', 'troops', 'US'),
          makeToken('t2', 'troops', 'US'),
          makeToken('t3', 'troops', 'US'),
          makeToken('t4', 'police', 'US'),
          makeToken('sf1', 'irregulars', 'US'),
          makeToken('g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('g2', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('g3', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('g4', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      });

      const effects = buildSweepActivationEffects('quangTri:none', 4, 1, true);
      const ctx = makeCtx(state);
      const result = applyEffects(effects, ctx);

      const guerrillas = result.state.zones['quangTri:none']?.filter(
        (t) => t.type === 'guerrilla',
      ) ?? [];
      const activeCount = guerrillas.filter((g) => g.props.activity === 'active').length;
      const undergroundCount = guerrillas.filter((g) => g.props.activity === 'underground').length;

      assert.equal(activeCount, 2, 'Jungle: should activate floor(5/2)=2 guerrillas');
      assert.equal(undergroundCount, 2, 'Jungle: should leave 2 underground');
    });

    it('activates 0 with only 1 sweeper in jungle', () => {
      // 1 sweeper in jungle → floor(1/2) = 0 activations
      const state = makeState({
        'quangTri:none': [
          makeToken('t1', 'troops', 'US'),
          makeToken('g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('g2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      });

      const effects = buildSweepActivationEffects('quangTri:none', 1, 0, true);
      const ctx = makeCtx(state);
      const result = applyEffects(effects, ctx);

      const guerrillas = result.state.zones['quangTri:none']?.filter(
        (t) => t.type === 'guerrilla',
      ) ?? [];
      const activeCount = guerrillas.filter((g) => g.props.activity === 'active').length;
      const undergroundCount = guerrillas.filter((g) => g.props.activity === 'underground').length;

      assert.equal(activeCount, 0, 'Jungle with 1 sweeper: activate floor(1/2)=0');
      assert.equal(undergroundCount, 2, 'Jungle with 1 sweeper: all remain underground');
    });
  });
});
