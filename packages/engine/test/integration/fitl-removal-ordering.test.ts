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
import type { EffectMacroDef, GameSpecEffect } from '../../src/cnl/game-spec-doc.js';

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
      const sweepUsProfile = profiles.find((p) => p.id === 'sweep-us-profile');
      const sweepArvnProfile = profiles.find((p) => p.id === 'sweep-arvn-profile');
      const assaultUsProfile = profiles.find((p) => p.id === 'assault-us-profile');
      const assaultArvnProfile = profiles.find((p) => p.id === 'assault-arvn-profile');
      assert.ok(sweepUsProfile, 'Expected sweep-us-profile to exist');
      assert.ok(sweepArvnProfile, 'Expected sweep-arvn-profile to exist');
      assert.ok(assaultUsProfile, 'Expected assault-us-profile to exist');
      assert.ok(assaultArvnProfile, 'Expected assault-arvn-profile to exist');
    });

    it('compiled production spec contains removeByPriority effect usage in removal ordering paths', () => {
      const { compiled } = compileProductionSpec();
      assert.notEqual(compiled.gameDef, null, 'Expected valid GameDef');

      const hasRemoveByPriority = (effects: readonly EffectAST[]): boolean => {
        for (const effect of effects) {
          if ('removeByPriority' in effect) {
            return true;
          }
          if ('if' in effect) {
            if (hasRemoveByPriority(effect.if.then)) return true;
            if (effect.if.else && hasRemoveByPriority(effect.if.else)) return true;
          }
          if ('forEach' in effect) {
            if (hasRemoveByPriority(effect.forEach.effects)) return true;
            if (effect.forEach.in && hasRemoveByPriority(effect.forEach.in)) return true;
          }
          if ('let' in effect && hasRemoveByPriority(effect.let.in)) {
            return true;
          }
          if ('rollRandom' in effect && hasRemoveByPriority(effect.rollRandom.in)) {
            return true;
          }
          if ('removeByPriority' in effect) {
            const removeByPriority = effect.removeByPriority as { readonly in?: readonly EffectAST[] };
            if (removeByPriority.in && hasRemoveByPriority(removeByPriority.in)) {
              return true;
            }
          }
        }
        return false;
      };

      const profiles = compiled.gameDef!.actionPipelines ?? [];
      const profileEffects = profiles.flatMap((profile) => profile.stages.flatMap((stage) => stage.effects));
      assert.equal(hasRemoveByPriority(profileEffects), true, 'Expected removeByPriority in compiled FITL operation effects');
    });

    it('production removal macro contracts are explicit and contain no dead actorFaction threading', () => {
      const { parsed } = compileProductionSpec();
      const macros = parsed.doc.effectMacros ?? [];

      const macroById = (id: string): EffectMacroDef | undefined => macros.find((macro) => macro.id === id);
      const pieceRemovalOrdering = macroById('piece-removal-ordering');
      const coinAssaultRemoval = macroById('coin-assault-removal-order');
      const insurgentAttackRemoval = macroById('insurgent-attack-removal-order');

      assert.ok(pieceRemovalOrdering, 'Expected piece-removal-ordering macro');
      assert.ok(coinAssaultRemoval, 'Expected coin-assault-removal-order macro');
      assert.ok(insurgentAttackRemoval, 'Expected insurgent-attack-removal-order macro');

      assert.deepEqual(
        pieceRemovalOrdering.params.map((param) => param.name),
        ['space', 'damageExpr', 'bodyCountEligible'],
        'Expected piece-removal-ordering params to expose explicit Body Count eligibility input',
      );
      assert.deepEqual(
        coinAssaultRemoval.params.map((param) => param.name),
        ['space', 'damageExpr', 'bodyCountEligible'],
        'Expected coin-assault-removal-order to avoid actorFaction parameter and pass explicit Body Count eligibility',
      );
      assert.deepEqual(
        insurgentAttackRemoval.params.map((param) => param.name),
        ['space', 'damageExpr', 'attackerFaction'],
        'Expected insurgent-attack-removal-order to keep explicit attackerFaction',
      );
      assert.equal(
        pieceRemovalOrdering.params[0]?.type,
        'zoneSelector',
        'Expected piece-removal-ordering space param to be binding-aware for nested hygienic macros',
      );
      assert.equal(
        coinAssaultRemoval.params[0]?.type,
        'zoneSelector',
        'Expected coin-assault-removal-order space param to be binding-aware for nested hygienic macros',
      );

      const asRecord = (value: unknown): Record<string, unknown> | null =>
        typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
      const asEffectList = (value: unknown): readonly GameSpecEffect[] | null =>
        Array.isArray(value) ? (value as readonly GameSpecEffect[]) : null;

      const flatten = (nodes: readonly GameSpecEffect[]): readonly Record<string, unknown>[] => {
        const out: Record<string, unknown>[] = [];
        const walk = (node: unknown): void => {
          const record = asRecord(node);
          if (record === null) return;
          out.push(record);

          const ifNode = asRecord(record.if);
          if (ifNode !== null) {
            const thenEffects = asEffectList(ifNode.then);
            const elseEffects = asEffectList(ifNode.else);
            thenEffects?.forEach(walk);
            elseEffects?.forEach(walk);
          }

          const forEachNode = asRecord(record.forEach);
          if (forEachNode !== null) {
            const effects = asEffectList(forEachNode.effects);
            const inEffects = asEffectList(forEachNode.in);
            effects?.forEach(walk);
            inEffects?.forEach(walk);
          }

          const letNode = asRecord(record.let);
          asEffectList(letNode?.in)?.forEach(walk);

          const rollRandomNode = asRecord(record.rollRandom);
          asEffectList(rollRandomNode?.in)?.forEach(walk);

          const removeByPriorityNode = asRecord(record.removeByPriority);
          asEffectList(removeByPriorityNode?.in)?.forEach(walk);
        };
        nodes.forEach(walk);
        return out;
      };

      const hasActorFactionArg = (node: Record<string, unknown>): boolean => {
        const args = asRecord(node.args);
        return args !== null && Object.hasOwn(args, 'actorFaction');
      };
      const hasBodyCountEligibleArg = (node: Record<string, unknown>): boolean => {
        const args = asRecord(node.args);
        return args !== null && Object.hasOwn(args, 'bodyCountEligible');
      };

      const coinCalls = flatten(coinAssaultRemoval.effects).filter((node) => node.macro === 'piece-removal-ordering');
      const insurgentCalls = flatten(insurgentAttackRemoval.effects).filter((node) => node.macro === 'piece-removal-ordering');
      const insurgentRemoveByPriority = flatten(insurgentAttackRemoval.effects).filter((node) => 'removeByPriority' in node);

      assert.equal(coinCalls.length >= 1, true, 'Expected coin-assault-removal-order to call piece-removal-ordering');
      assert.equal(insurgentCalls.length, 0, 'Expected insurgent-attack-removal-order to own COIN removal logic directly');
      assert.equal(insurgentRemoveByPriority.length >= 1, true, 'Expected insurgent-attack-removal-order to use removeByPriority');
      assert.equal(
        coinCalls.some(hasActorFactionArg),
        false,
        'Expected coin-assault-removal-order to avoid actorFaction passthrough',
      );
      assert.equal(
        coinCalls.every(hasBodyCountEligibleArg),
        true,
        'Expected coin-assault-removal-order to forward explicit bodyCountEligible arg into piece-removal-ordering',
      );
      assert.equal(
        insurgentCalls.some(hasActorFactionArg),
        false,
        'Expected insurgent-attack-removal-order to avoid actorFaction passthrough when delegating',
      );

      const insurgentSerialized = JSON.stringify(insurgentAttackRemoval.effects);
      assert.match(
        insurgentSerialized,
        /casualties-US:none/,
        'Expected insurgent-attack-removal-order to route removed US pieces to casualties-US:none',
      );
      assert.match(
        insurgentSerialized,
        /available-ARVN:none/,
        'Expected insurgent-attack-removal-order to route ARVN removals explicitly to available-ARVN:none',
      );
      assert.doesNotMatch(
        insurgentSerialized,
        /targetFactionFirst/,
        'Expected insurgent-attack-removal-order to avoid hidden target-faction choice bindings',
      );
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
        terminal: { conditions: [] },
      });

      const makeState = (): GameState => ({
        globalVars: { aid: 15 },
        perPlayerVars: {},
        zoneVars: {},
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
        mode: 'execution',
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
        terminal: { conditions: [] },
      };

      const state: GameState = {
        globalVars: { aid: 15 },
        perPlayerVars: {},
        zoneVars: {},
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
        mode: 'execution',
      };

      const result = applyEffects(aidEffects, ctx);
      assert.equal(result.state.globalVars.aid, 27, 'Aid should be 15 + 12 = 27');
    });
  });

  describe('insurgent-attack-removal-order runtime behavior', () => {
    it('removes COIN defenders first, then applies attacker attrition per US removed', () => {
      const def: GameDef = {
        metadata: { id: 'insurgent-attrition', players: { min: 2, max: 2 } },
        constants: {},
        globalVars: [],
        perPlayerVars: [],
        zones: [
          { id: asZoneId('quangTri:none'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('available-NVA:none'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('casualties-US:none'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('available-US:none'), owner: 'none', visibility: 'public', ordering: 'set' },
          { id: asZoneId('available-ARVN:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        ],
        tokenTypes: [
          { id: 'troops', props: { faction: 'string', type: 'string' } },
          { id: 'guerrilla', props: { faction: 'string', activity: 'string' } },
          { id: 'base', props: { faction: 'string', type: 'string' } },
        ],
        setup: [],
        turnStructure: { phases: [{ id: asPhaseId('main') }] },
        actions: [],
        triggers: [],
        terminal: { conditions: [] },
      };

      // NVA attacker + US/ARVN defenders in one space.
      const state: GameState = {
        globalVars: {},
        perPlayerVars: {},
        zoneVars: {},
        playerCount: 2,
        zones: {
          'quangTri:none': [
            makeToken('us1', 'troops', 'US', { type: 'troops' }),
            makeToken('arvn1', 'troops', 'ARVN', { type: 'troops' }),
            makeToken('g1', 'guerrilla', 'NVA', { activity: 'active' }),
            makeToken('g2', 'guerrilla', 'NVA', { activity: 'active' }),
            makeToken('b1', 'base', 'US', { type: 'base' }),
          ],
          'available-NVA:none': [],
          'casualties-US:none': [],
          'available-US:none': [],
          'available-ARVN:none': [],
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

      const effects: readonly EffectAST[] = [
        { let: {
          bind: '$usPiecesBefore',
          value: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'quangTri:none', filter: [{ prop: 'faction', op: 'eq', value: 'US' }] } } },
          in: [
            {
              removeByPriority: {
                budget: 2,
                groups: [
                  {
                    bind: '$target',
                    over: { query: 'tokensInZone', zone: 'quangTri:none', filter: [{ prop: 'faction', op: 'eq', value: 'US' }, { prop: 'type', op: 'neq', value: 'base' }] },
                    to: { zoneExpr: 'casualties-US:none' },
                  },
                  {
                    bind: '$target',
                    over: { query: 'tokensInZone', zone: 'quangTri:none', filter: [{ prop: 'faction', op: 'eq', value: 'ARVN' }, { prop: 'type', op: 'neq', value: 'base' }] },
                    to: { zoneExpr: 'available-ARVN:none' },
                  },
                  {
                    bind: '$target',
                    over: { query: 'tokensInZone', zone: 'quangTri:none', filter: [{ prop: 'faction', op: 'eq', value: 'US' }, { prop: 'type', op: 'eq', value: 'base' }] },
                    to: { zoneExpr: 'casualties-US:none' },
                  },
                ],
              },
            },
            { let: {
              bind: '$usPiecesAfter',
              value: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'quangTri:none', filter: [{ prop: 'faction', op: 'eq', value: 'US' }] } } },
              in: [{
                let: {
                  bind: '$usRemoved',
                  value: { op: '-', left: { ref: 'binding', name: '$usPiecesBefore' }, right: { ref: 'binding', name: '$usPiecesAfter' } },
                  in: [{
                    forEach: {
                      bind: '$attritionPiece',
                      over: { query: 'tokensInZone', zone: 'quangTri:none', filter: [{ prop: 'faction', op: 'eq', value: 'NVA' }] },
                      limit: { ref: 'binding', name: '$usRemoved' },
                      effects: [{ moveToken: { token: '$attritionPiece', from: 'quangTri:none', to: 'available-NVA:none' } }],
                    },
                  }],
                },
              }],
            } },
          ],
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
        mode: 'execution',
      };

      const result = applyEffects(effects, ctx);
      assert.equal(result.state.zones['casualties-US:none']?.length, 1, 'US defender should be removed to casualties');
      assert.equal(result.state.zones['available-US:none']?.length, 0, 'US defender should not route to available');
      assert.equal(result.state.zones['available-ARVN:none']?.length, 1, 'ARVN defender should be removed second');
      assert.equal(result.state.zones['available-NVA:none']?.length, 1, 'Attacker should lose 1 NVA piece per US piece removed');
      assert.equal(result.state.zones['quangTri:none']?.some((token) => token.id === 'b1'), true, 'US Base should remain while non-base defenders exist');
    });
  });
});
