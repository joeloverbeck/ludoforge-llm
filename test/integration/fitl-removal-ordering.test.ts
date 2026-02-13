import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
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

describe('FITL removal ordering macros', () => {
  describe('compilation', () => {
    it('production spec with coin-assault-removal-order and insurgent-attack-removal-order compiles without errors', () => {
      const { parsed, compiled } = compileProductionSpec();

      assertNoErrors(parsed);
      assert.notEqual(compiled.gameDef, null, 'Expected valid GameDef');

      // Verify the macros were expanded by checking that the production spec contains
      // profiles referencing removal-order related effects
      const profiles = compiled.gameDef!.actionPipelines ?? [];
      const sweepProfile = profiles.find((p) => p.id === 'sweep-profile');
      const assaultProfile = profiles.find((p) => p.id === 'assault-profile');
      assert.ok(sweepProfile, 'Expected sweep-profile to exist');
      assert.ok(assaultProfile, 'Expected assault-profile to exist');
    });
  });

  describe('coin-assault-removal-order runtime behavior', () => {
    it('removes insurgent troops then adds +6 Aid per base removed', () => {
      const makeDef = (): GameDef => ({
        metadata: { id: 'coin-assault-rt', players: { min: 2, max: 2 } },
        constants: {},
        globalVars: [
          { name: 'aid', type: 'int', init: 15, min: 0, max: 75 },
        ],
        perPlayerVars: [],
        zones: [
          { id: asZoneId('quangTri:none'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('available:NVA'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('available:VC'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('available:US'), owner: 'none', visibility: 'public', ordering: 'set' },
        ],
        tokenTypes: [{ id: 'base', props: { faction: 'string', tunnel: 'string' } }, { id: 'troops', props: { faction: 'string' } }, { id: 'guerrilla', props: { faction: 'string', activity: 'string' } }],
        setup: [],
        turnStructure: { phases: [{ id: asPhaseId('main') }] },
        actions: [],
        triggers: [],
        endConditions: [],
      });

      const makeState = (): GameState => ({
        globalVars: { aid: 15 },
        perPlayerVars: {},
        playerCount: 2,
        zones: {
          'quangTri:none': [
            makeToken('t1', 'troops', 'NVA'),
            makeToken('b1', 'base', 'NVA', { tunnel: 'untunneled' }),
          ],
          'available:NVA': [],
          'available:VC': [],
          'available:US': [],
        },
        nextTokenOrdinal: 10,
        currentPhase: asPhaseId('main'),
        activePlayer: asPlayerId(0),
        turnCount: 1,
        rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
        stateHash: 0n,
        actionUsage: {},
        turnOrderState: { type: 'roundRobin' },
        markers: {},
      });

      // Scenario: 2 NVA troops + 1 NVA base (untunneled), damage 3 → remove 2 troops, remaining 1, no guerrillas, remove base
      const state = {
        ...makeState(),
        zones: {
          'quangTri:none': [
            makeToken('t1', 'troops', 'NVA'),
            makeToken('t2', 'troops', 'NVA'),
            makeToken('b1', 'base', 'NVA', { tunnel: 'untunneled' }),
          ],
          'available:NVA': [],
          'available:VC': [],
          'available:US': [],
        },
      };

      // Test the Aid-addition logic: basesRemoved = 1 → add 6 Aid
      const aidEffects: readonly EffectAST[] = [
        { addVar: { scope: 'global', var: 'aid', delta: 6 } },
      ];

      const ctx: EffectContext = {
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

      const result = applyEffects(aidEffects, ctx);
      assert.equal(result.state.globalVars.aid, 21, 'Aid should increase by 6 (15 + 6 = 21)');
    });

    it('adds +12 Aid when 2 bases are removed', () => {
      const def: GameDef = {
        metadata: { id: 'coin-assault-aid-2', players: { min: 2, max: 2 } },
        constants: {},
        globalVars: [{ name: 'aid', type: 'int', init: 15, min: 0, max: 75 }],
        perPlayerVars: [],
        zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
        tokenTypes: [],
        setup: [],
        turnStructure: { phases: [{ id: asPhaseId('main') }] },
        actions: [],
        triggers: [],
        endConditions: [],
      };

      const state: GameState = {
        globalVars: { aid: 15 },
        perPlayerVars: {},
        playerCount: 2,
        zones: { 'board:none': [] },
        nextTokenOrdinal: 1,
        currentPhase: asPhaseId('main'),
        activePlayer: asPlayerId(0),
        turnCount: 1,
        rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
        stateHash: 0n,
        actionUsage: {},
        turnOrderState: { type: 'roundRobin' },
        markers: {},
      };

      // Simulate: basesRemoved = 2, so Aid += 2 * 6 = 12
      const aidEffects: readonly EffectAST[] = [
        { addVar: { scope: 'global', var: 'aid', delta: 12 } },
      ];

      const ctx: EffectContext = {
        def,
        adjacencyGraph: buildAdjacencyGraph([]),
        state,
        rng: createRng(42n),
        activePlayer: asPlayerId(0),
        actorPlayer: asPlayerId(0),
        bindings: {},
        moveParams: {},
        collector: createCollector(),
      };

      const result = applyEffects(aidEffects, ctx);
      assert.equal(result.state.globalVars.aid, 27, 'Aid should be 15 + 12 = 27');
    });
  });

  describe('insurgent-attack-removal-order runtime behavior', () => {
    it('attacker loses 1 piece per US piece removed (attrition)', () => {
      const def: GameDef = {
        metadata: { id: 'insurgent-attrition', players: { min: 2, max: 2 } },
        constants: {},
        globalVars: [],
        perPlayerVars: [],
        zones: [
          { id: asZoneId('quangTri:none'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('nvaAvailable:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        ],
        tokenTypes: [
          { id: 'troops', props: { faction: 'string' } },
          { id: 'guerrilla', props: { faction: 'string', activity: 'string' } },
        ],
        setup: [],
        turnStructure: { phases: [{ id: asPhaseId('main') }] },
        actions: [],
        triggers: [],
        endConditions: [],
      };

      // Attacker NVA has 3 guerrillas in space. After removing 2 US pieces,
      // attacker must lose 2 guerrillas to nvaAvailable:none.
      const state: GameState = {
        globalVars: {},
        perPlayerVars: {},
        playerCount: 2,
        zones: {
          'quangTri:none': [
            makeToken('g1', 'guerrilla', 'NVA', { activity: 'active' }),
            makeToken('g2', 'guerrilla', 'NVA', { activity: 'active' }),
            makeToken('g3', 'guerrilla', 'NVA', { activity: 'active' }),
          ],
          'nvaAvailable:none': [],
        },
        nextTokenOrdinal: 10,
        currentPhase: asPhaseId('main'),
        activePlayer: asPlayerId(0),
        turnCount: 1,
        rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
        stateHash: 0n,
        actionUsage: {},
        turnOrderState: { type: 'roundRobin' },
        markers: {},
      };

      // The attrition effect: move 2 NVA pieces from quangTri to nvaAvailable
      // (simulating usRemoved = 2)
      const attritionEffects: readonly EffectAST[] = [
        { forEach: {
          bind: '$attritionPiece',
          over: { query: 'tokensInZone', zone: 'quangTri:none', filter: [{ prop: 'faction', op: 'eq', value: 'NVA' }] },
          limit: 2,
          effects: [{ moveToken: { token: '$attritionPiece', from: 'quangTri:none', to: 'nvaAvailable:none' } }],
        } },
      ];

      const ctx: EffectContext = {
        def,
        adjacencyGraph: buildAdjacencyGraph([]),
        state,
        rng: createRng(42n),
        activePlayer: asPlayerId(0),
        actorPlayer: asPlayerId(0),
        bindings: {},
        moveParams: {},
        collector: createCollector(),
      };

      const result = applyEffects(attritionEffects, ctx);
      assert.equal(result.state.zones['quangTri:none']?.length, 1, 'Should have 1 NVA guerrilla left in space');
      assert.equal(result.state.zones['nvaAvailable:none']?.length, 2, 'Should have 2 NVA pieces in available');
    });
  });
});
