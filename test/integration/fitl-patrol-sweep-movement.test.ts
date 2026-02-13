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
  type MapSpaceDef,
  type Token,
  type ZoneDef,
  createCollector,
} from '../../src/kernel/index.js';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { type, faction, ...extra },
});

/**
 * Minimal GameDef with LoC + adjacent provinces and the available zones
 * needed for patrol movement and activation tests.
 */
function makeDef(zones: readonly ZoneDef[]): GameDef {
  return {
    metadata: { id: 'patrol-movement-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones,
    tokenTypes: [
      { id: 'troops', props: { faction: 'string' } },
      { id: 'police', props: { faction: 'string' } },
      { id: 'guerrilla', props: { faction: 'string', activity: 'string' } },
      { id: 'base', props: { faction: 'string' } },
    ],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    actions: [],
    triggers: [],
    endConditions: [],
  };
}

function makeState(zones: Record<string, Token[]>): GameState {
  return {
    globalVars: {},
    perPlayerVars: {},
    playerCount: 2,
    zones,
    nextTokenOrdinal: 100,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    actionUsage: {},
    markers: {},
  };
}

// Zone definitions: one LoC adjacent to two provinces
const locId = asZoneId('route1:none');
const adjProvince1Id = asZoneId('quangTri:none');
const adjProvince2Id = asZoneId('thua:none');
const availableUS = asZoneId('available-US:none');

const zoneDefs: readonly ZoneDef[] = [
  { id: locId, owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [adjProvince1Id, adjProvince2Id] },
  { id: adjProvince1Id, owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [locId] },
  { id: adjProvince2Id, owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [locId] },
  { id: availableUS, owner: 'none', visibility: 'public', ordering: 'set' },
];

const mapSpaces: readonly MapSpaceDef[] = [
  { id: locId, spaceType: 'loc', population: 0, econ: 1, terrainTags: ['highway'], country: 'southVietnam', coastal: false, adjacentTo: [adjProvince1Id, adjProvince2Id] },
  { id: adjProvince1Id, spaceType: 'province', population: 2, econ: 0, terrainTags: ['lowland'], country: 'southVietnam', coastal: false, adjacentTo: [locId] },
  { id: adjProvince2Id, spaceType: 'province', population: 1, econ: 0, terrainTags: ['lowland'], country: 'southVietnam', coastal: false, adjacentTo: [locId] },
];

function makeCtx(state: GameState, bindings?: Record<string, unknown>): EffectContext {
  const def = makeDef(zoneDefs);
  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(zoneDefs),
    state,
    rng: createRng(42n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: bindings ?? {},
    moveParams: {},
    collector: createCollector(),
    mapSpaces,
  };
}

/**
 * Simulates the patrol "move-cubes" stage at the kernel level.
 *
 * For each cube binding, the patrol profile issues:
 *   moveToken { token: $cube, from: { zoneExpr: { ref: tokenZone, token: $cube } }, to: $loc }
 *
 * Since forEach with tokensInAdjacentZones requires the full compilation pipeline,
 * we test the underlying moveToken-with-dynamic-from mechanics directly.
 */
function buildMoveCubeEffects(cubeIds: readonly string[], targetZone: string): readonly EffectAST[] {
  return cubeIds.map((cubeId) => ({
    moveToken: {
      token: cubeId,
      from: { zoneExpr: { ref: 'tokenZone' as const, token: cubeId } },
      to: targetZone,
    },
  }));
}

/**
 * Simulates the patrol "activate-guerrillas" stage at the kernel level.
 *
 * For each LoC, activate up to `usCubeCount` underground guerrillas (1:1 ratio).
 */
function buildActivateGuerrillaEffects(zone: string, activationLimit: number): readonly EffectAST[] {
  if (activationLimit <= 0) return [];
  return [
    {
      forEach: {
        bind: '$guerrilla',
        over: {
          query: 'tokensInZone' as const,
          zone,
          filter: [
            { prop: 'type', op: 'eq' as const, value: 'guerrilla' },
            { prop: 'activity', op: 'eq' as const, value: 'underground' },
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

describe('FITL patrol movement and activation', () => {
  describe('cube movement from adjacent spaces into target LoC', () => {
    it('moves US cubes from two adjacent provinces into the LoC', () => {
      const cube1 = makeToken('us-t1', 'troops', 'US');
      const cube2 = makeToken('us-t2', 'troops', 'US');
      const cube3 = makeToken('us-p1', 'police', 'US');

      const state = makeState({
        [locId]: [],
        [adjProvince1Id]: [cube1, cube2],
        [adjProvince2Id]: [cube3],
        [availableUS]: [],
      });

      const effects = buildMoveCubeEffects(['$c1', '$c2', '$c3'], locId);
      const ctx = makeCtx(state, {
        $c1: cube1,
        $c2: cube2,
        $c3: cube3,
      });

      const result = applyEffects(effects, ctx);

      assert.equal(result.state.zones[locId]!.length, 3, 'LoC should have 3 cubes after movement');
      assert.equal(result.state.zones[adjProvince1Id]!.length, 0, 'Province 1 should be empty');
      assert.equal(result.state.zones[adjProvince2Id]!.length, 0, 'Province 2 should be empty');
    });

    it('only moves specified cubes, leaving other tokens in adjacent spaces', () => {
      const usCube = makeToken('us-t1', 'troops', 'US');
      const nvaTroop = makeToken('nva-t1', 'troops', 'NVA');

      const state = makeState({
        [locId]: [],
        [adjProvince1Id]: [usCube, nvaTroop],
        [adjProvince2Id]: [],
        [availableUS]: [],
      });

      const effects = buildMoveCubeEffects(['$cube'], locId);
      const ctx = makeCtx(state, { $cube: usCube });

      const result = applyEffects(effects, ctx);

      assert.equal(result.state.zones[locId]!.length, 1, 'LoC should have the moved US cube');
      assert.equal(result.state.zones[adjProvince1Id]!.length, 1, 'Province should still have NVA troop');
      assert.equal(result.state.zones[adjProvince1Id]![0]!.id, 'nva-t1');
    });

    it('handles no cubes to move (empty adjacent spaces)', () => {
      const state = makeState({
        [locId]: [makeToken('nva-g1', 'guerrilla', 'NVA', { activity: 'underground' })],
        [adjProvince1Id]: [],
        [adjProvince2Id]: [],
        [availableUS]: [],
      });

      const effects: readonly EffectAST[] = [];
      const ctx = makeCtx(state);

      const result = applyEffects(effects, ctx);

      assert.equal(result.state.zones[locId]!.length, 1, 'LoC should still have original guerrilla');
    });
  });

  describe('guerrilla activation (1:1 ratio per US cube)', () => {
    it('activates underground guerrillas up to the US cube count', () => {
      // 2 US cubes in LoC → activate up to 2 guerrillas
      const state = makeState({
        [locId]: [
          makeToken('us-t1', 'troops', 'US'),
          makeToken('us-t2', 'troops', 'US'),
          makeToken('nva-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('nva-g2', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        [adjProvince1Id]: [],
        [adjProvince2Id]: [],
        [availableUS]: [],
      });

      const effects = buildActivateGuerrillaEffects(locId, 2);
      const ctx = makeCtx(state);

      const result = applyEffects(effects, ctx);

      const guerrillasInLoC = result.state.zones[locId]!.filter((token) => token.type === 'guerrilla');
      const activatedCount = guerrillasInLoC.filter((token) => token.props.activity === 'active').length;
      const undergroundCount = guerrillasInLoC.filter((token) => token.props.activity === 'underground').length;

      assert.equal(activatedCount, 2, 'Exactly 2 guerrillas should be activated (1:1 with US cubes)');
      assert.equal(undergroundCount, 1, 'Remaining guerrilla should stay underground');
    });

    it('activates all guerrillas when US cubes exceed guerrilla count', () => {
      // 5 US cubes but only 2 underground guerrillas → activate all 2
      const state = makeState({
        [locId]: [
          makeToken('us-t1', 'troops', 'US'),
          makeToken('us-t2', 'troops', 'US'),
          makeToken('us-t3', 'troops', 'US'),
          makeToken('us-p1', 'police', 'US'),
          makeToken('us-p2', 'police', 'US'),
          makeToken('nva-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        [adjProvince1Id]: [],
        [adjProvince2Id]: [],
        [availableUS]: [],
      });

      const effects = buildActivateGuerrillaEffects(locId, 5);
      const ctx = makeCtx(state);

      const result = applyEffects(effects, ctx);

      const guerrillasInLoC = result.state.zones[locId]!.filter((token) => token.type === 'guerrilla');
      const activatedCount = guerrillasInLoC.filter((token) => token.props.activity === 'active').length;

      assert.equal(activatedCount, 2, 'All underground guerrillas activated');
    });

    it('does not activate already-active guerrillas', () => {
      // 3 US cubes, 1 already-active + 1 underground → only 1 activation
      const state = makeState({
        [locId]: [
          makeToken('us-t1', 'troops', 'US'),
          makeToken('us-t2', 'troops', 'US'),
          makeToken('us-t3', 'troops', 'US'),
          makeToken('nva-g1', 'guerrilla', 'NVA', { activity: 'active' }),
          makeToken('nva-g2', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
        [adjProvince1Id]: [],
        [adjProvince2Id]: [],
        [availableUS]: [],
      });

      const effects = buildActivateGuerrillaEffects(locId, 3);
      const ctx = makeCtx(state);

      const result = applyEffects(effects, ctx);

      const guerrillasInLoC = result.state.zones[locId]!.filter((token) => token.type === 'guerrilla');
      const activatedCount = guerrillasInLoC.filter((token) => token.props.activity === 'active').length;
      const undergroundCount = guerrillasInLoC.filter((token) => token.props.activity === 'underground').length;

      assert.equal(activatedCount, 2, 'Both the already-active and newly-activated should be active');
      assert.equal(undergroundCount, 0, 'No guerrillas should remain underground');
    });

    it('no activation when no US cubes in LoC (limit = 0)', () => {
      const state = makeState({
        [locId]: [
          makeToken('nva-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        [adjProvince1Id]: [],
        [adjProvince2Id]: [],
        [availableUS]: [],
      });

      // 0 US cubes → limit = 0 → no effects generated
      const effects = buildActivateGuerrillaEffects(locId, 0);
      const ctx = makeCtx(state);

      const result = applyEffects(effects, ctx);

      const guerrillasInLoC = result.state.zones[locId]!.filter((token) => token.type === 'guerrilla');
      const undergroundCount = guerrillasInLoC.filter((token) => token.props.activity === 'underground').length;

      assert.equal(undergroundCount, 2, 'All guerrillas should remain underground');
    });
  });

  describe('movement + activation combined', () => {
    it('moves cubes then activates guerrillas in combined patrol sequence', () => {
      const usCube1 = makeToken('us-t1', 'troops', 'US');
      const usCube2 = makeToken('us-p1', 'police', 'US');

      const state = makeState({
        [locId]: [
          makeToken('nva-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-g2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        [adjProvince1Id]: [usCube1],
        [adjProvince2Id]: [usCube2],
        [availableUS]: [],
      });

      // Step 1: Move cubes into LoC
      const moveEffects = buildMoveCubeEffects(['$c1', '$c2'], locId);
      const moveCtx = makeCtx(state, { $c1: usCube1, $c2: usCube2 });
      const afterMove = applyEffects(moveEffects, moveCtx);

      assert.equal(afterMove.state.zones[locId]!.length, 5, 'LoC should have 3 guerrillas + 2 cubes after movement');
      assert.equal(afterMove.state.zones[adjProvince1Id]!.length, 0);
      assert.equal(afterMove.state.zones[adjProvince2Id]!.length, 0);

      // Step 2: Activate guerrillas (2 US cubes → activate up to 2)
      const activateEffects = buildActivateGuerrillaEffects(locId, 2);
      const activateCtx = makeCtx(afterMove.state);
      const afterActivation = applyEffects(activateEffects, activateCtx);

      const guerrillas = afterActivation.state.zones[locId]!.filter((token) => token.type === 'guerrilla');
      const activatedCount = guerrillas.filter((token) => token.props.activity === 'active').length;
      const undergroundCount = guerrillas.filter((token) => token.props.activity === 'underground').length;

      assert.equal(activatedCount, 2, '2 guerrillas activated (1:1 with US cubes)');
      assert.equal(undergroundCount, 1, '1 guerrilla remains underground');
    });
  });
});
