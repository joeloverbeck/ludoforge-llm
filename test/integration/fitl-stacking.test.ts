import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createRng,
  isEffectErrorCode,
  validateInitialPlacementsAgainstStackingConstraints,
  type EffectContext,
  type GameDef,
  type GameState,
  type MapSpaceDef,
  type ScenarioPiecePlacement,
  type StackingConstraint,
  type Token,
} from '../../src/kernel/index.js';

// ─── Shared FITL-style stacking constraints ──────────────────────────────────

const fitlConstraints: readonly StackingConstraint[] = [
  {
    id: 'max-2-bases-province-city',
    description: 'Max 2 Bases per Province or City',
    spaceFilter: { spaceTypes: ['province', 'city'] },
    pieceFilter: { pieceTypeIds: ['base'] },
    rule: 'maxCount',
    maxCount: 2,
  },
  {
    id: 'no-bases-loc',
    description: 'No Bases on LoCs',
    spaceFilter: { spaceTypes: ['loc'] },
    pieceFilter: { pieceTypeIds: ['base'] },
    rule: 'prohibit',
  },
  {
    id: 'nv-restriction',
    description: 'Only NVA/VC in North Vietnam',
    spaceFilter: { country: ['northVietnam'] },
    pieceFilter: { factions: ['US', 'ARVN'] },
    rule: 'prohibit',
  },
];

const mapSpaces: readonly MapSpaceDef[] = [
  { id: 'quangTri', spaceType: 'province', population: 1, econ: 0, terrainTags: ['highland'], country: 'southVietnam', coastal: true, adjacentTo: ['hue', 'quangNam'] },
  { id: 'hue', spaceType: 'city', population: 2, econ: 0, terrainTags: [], country: 'southVietnam', coastal: true, adjacentTo: ['quangTri'] },
  { id: 'route1', spaceType: 'loc', population: 0, econ: 1, terrainTags: ['highway'], country: 'southVietnam', coastal: false, adjacentTo: ['quangTri', 'hue'] },
  { id: 'hanoi', spaceType: 'city', population: 3, econ: 0, terrainTags: [], country: 'northVietnam', coastal: false, adjacentTo: [] },
];

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction },
});

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('FITL stacking: compile-time and runtime enforcement', () => {
  describe('compile-time validation detects violations', () => {
    it('rejects 3 bases in a province', () => {
      const placements: ScenarioPiecePlacement[] = [
        { spaceId: 'quangTri', pieceTypeId: 'base', faction: 'US', count: 2 },
        { spaceId: 'quangTri', pieceTypeId: 'base', faction: 'ARVN', count: 1 },
      ];

      const diags = validateInitialPlacementsAgainstStackingConstraints(fitlConstraints, placements, [...mapSpaces]);
      assert.ok(diags.length > 0, 'Expected compile-time stacking violation');
      assert.ok(diags.some((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION'));
    });

    it('rejects base on LoC', () => {
      const placements: ScenarioPiecePlacement[] = [
        { spaceId: 'route1', pieceTypeId: 'base', faction: 'NVA', count: 1 },
      ];

      const diags = validateInitialPlacementsAgainstStackingConstraints(fitlConstraints, placements, [...mapSpaces]);
      assert.ok(diags.length > 0);
      assert.ok(diags.some((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION'));
    });

    it('rejects US/ARVN pieces in North Vietnam', () => {
      const placements: ScenarioPiecePlacement[] = [
        { spaceId: 'hanoi', pieceTypeId: 'troops', faction: 'US', count: 1 },
      ];

      const diags = validateInitialPlacementsAgainstStackingConstraints(fitlConstraints, placements, [...mapSpaces]);
      assert.ok(diags.length > 0);
      assert.ok(diags.some((d) => d.code === 'STACKING_CONSTRAINT_VIOLATION'));
    });

    it('accepts valid placements', () => {
      const placements: ScenarioPiecePlacement[] = [
        { spaceId: 'quangTri', pieceTypeId: 'base', faction: 'US', count: 1 },
        { spaceId: 'quangTri', pieceTypeId: 'base', faction: 'ARVN', count: 1 },
        { spaceId: 'quangTri', pieceTypeId: 'troops', faction: 'US', count: 3 },
        { spaceId: 'hanoi', pieceTypeId: 'guerrilla', faction: 'NVA', count: 2 },
      ];

      const diags = validateInitialPlacementsAgainstStackingConstraints(fitlConstraints, placements, [...mapSpaces]);
      assert.equal(diags.length, 0, `Unexpected violations: ${diags.map((d) => d.message).join('; ')}`);
    });
  });

  describe('runtime enforcement detects same violations', () => {
    // Zone IDs must follow base:owner format for the zone selector resolver
    const makeDef = (): GameDef => ({
      metadata: { id: 'fitl-stacking-integration', players: { min: 4, max: 4 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('quangTri:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('route1:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('hanoi:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('available:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      ],
      tokenTypes: [
        { id: 'base', props: { faction: 'string' } },
        { id: 'troops', props: { faction: 'string' } },
        { id: 'guerrilla', props: { faction: 'string' } },
      ],
      setup: [],
      turnStructure: { phases: [], activePlayerOrder: 'roundRobin' },
      actions: [],
      triggers: [],
      endConditions: [],
      stackingConstraints: [...fitlConstraints],
    });

    // Map spaces use the zone IDs (with :none suffix) so stacking checks can resolve them
    const runtimeMapSpaces: readonly MapSpaceDef[] = [
      { id: 'quangTri:none', spaceType: 'province', population: 1, econ: 0, terrainTags: ['highland'], country: 'southVietnam', coastal: true, adjacentTo: [] },
      { id: 'route1:none', spaceType: 'loc', population: 0, econ: 1, terrainTags: ['highway'], country: 'southVietnam', coastal: false, adjacentTo: [] },
      { id: 'hanoi:none', spaceType: 'city', population: 3, econ: 0, terrainTags: [], country: 'northVietnam', coastal: false, adjacentTo: [] },
    ];

    const makeState = (): GameState => ({
      globalVars: {},
      perPlayerVars: {},
      playerCount: 4,
      zones: {
        'quangTri:none': [makeToken('b1', 'base', 'US'), makeToken('b2', 'base', 'ARVN')],
        'route1:none': [],
        'hanoi:none': [],
        'available:none': [makeToken('b3', 'base', 'US'), makeToken('t1', 'troops', 'US')],
      },
      nextTokenOrdinal: 10,
      currentPhase: asPhaseId('main'),
      activePlayer: asPlayerId(0),
      turnCount: 1,
      rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
      stateHash: 0n,
      actionUsage: {},
    });

    const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
      def: makeDef(),
      adjacencyGraph: buildAdjacencyGraph([]),
      state: makeState(),
      rng: createRng(42n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      mapSpaces: [...runtimeMapSpaces],
      ...overrides,
    });

    it('moveToken of 3rd base to province throws STACKING_VIOLATION', () => {
      const ctx = makeCtx();

      assert.throws(
        () =>
          applyEffect(
            { moveToken: { token: '$token', from: 'available:none', to: 'quangTri:none' } },
            { ...ctx, bindings: { $token: 'b3' } },
          ),
        (error: unknown) => isEffectErrorCode(error, 'STACKING_VIOLATION'),
      );
    });

    it('createToken of base on LoC throws STACKING_VIOLATION', () => {
      const ctx = makeCtx();

      assert.throws(
        () =>
          applyEffect(
            { createToken: { type: 'base', zone: 'route1:none', props: { faction: 'NVA' } } },
            ctx,
          ),
        (error: unknown) => isEffectErrorCode(error, 'STACKING_VIOLATION'),
      );
    });

    it('moveToken of US troops to North Vietnam throws STACKING_VIOLATION', () => {
      const ctx = makeCtx();

      assert.throws(
        () =>
          applyEffect(
            { moveToken: { token: '$token', from: 'available:none', to: 'hanoi:none' } },
            { ...ctx, bindings: { $token: 't1' } },
          ),
        (error: unknown) => isEffectErrorCode(error, 'STACKING_VIOLATION'),
      );
    });

    it('same constraint set produces both compile-time and runtime violations', () => {
      // Compile-time: 3 bases in province (uses MapSpaceDef IDs without :none suffix)
      const placements: ScenarioPiecePlacement[] = [
        { spaceId: 'quangTri', pieceTypeId: 'base', faction: 'US', count: 3 },
      ];
      const compileTimeDiags = validateInitialPlacementsAgainstStackingConstraints(fitlConstraints, placements, [...mapSpaces]);
      assert.ok(compileTimeDiags.length > 0, 'Expected compile-time violation');

      // Runtime: same scenario via moveToken (uses zone IDs with :none suffix)
      const ctx = makeCtx();
      const runtimeThrows = (() => {
        try {
          applyEffect(
            { moveToken: { token: '$token', from: 'available:none', to: 'quangTri:none' } },
            { ...ctx, bindings: { $token: 'b3' } },
          );
          return false;
        } catch (error) {
          return isEffectErrorCode(error, 'STACKING_VIOLATION');
        }
      })();
      assert.ok(runtimeThrows, 'Expected runtime STACKING_VIOLATION');
    });

    it('valid moves succeed with constraints active', () => {
      // Moving troops (not base) to province is fine — only 2 bases, not 3
      const ctx = makeCtx();
      const result = applyEffect(
        { moveToken: { token: '$token', from: 'available:none', to: 'quangTri:none' } },
        { ...ctx, bindings: { $token: 't1' } },
      );

      assert.ok(result.state.zones['quangTri:none']!.length === 3);
    });
  });
});
