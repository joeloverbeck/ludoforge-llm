import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
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
  type ZoneDef,
} from '../../src/kernel/index.js';

const minimalDef: GameDef = {
  metadata: { id: 'warn-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('z1:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('z2:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [{ id: 'piece', props: { faction: 'string' } }],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
} as unknown as GameDef;

const z1 = asZoneId('z1:none');
const z2 = asZoneId('z2:none');

function makeCtx(zones: Record<string, Token[]>, bindings?: Record<string, unknown>, trace?: boolean): EffectContext {
  const state: GameState = {
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
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  };
  const zoneDefs: readonly ZoneDef[] = minimalDef.zones;
  return {
    def: minimalDef,
    adjacencyGraph: buildAdjacencyGraph(zoneDefs),
    state,
    rng: createRng(42n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: bindings ?? {},
    moveParams: {},
    collector: createCollector(trace !== undefined ? { trace } : undefined),
  };
}

describe('Runtime warnings', () => {
  it('emits ZERO_EFFECT_ITERATIONS when forEach matches 0 tokens', () => {
    const ctx = makeCtx({ [z1]: [], [z2]: [] });
    const effects: readonly EffectAST[] = [{
      forEach: {
        bind: '$item',
        over: { query: 'tokensInZone' as const, zone: z1, filter: [] },
        effects: [],
      },
    }];
    applyEffects(effects, ctx);
    assert.ok(ctx.collector!.warnings.length > 0);
    assert.equal(ctx.collector!.warnings[0]!.code, 'ZERO_EFFECT_ITERATIONS');
  });

  it('emits EMPTY_QUERY_RESULT when filter reduces all tokens to 0', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] });
    const effects: readonly EffectAST[] = [{
      forEach: {
        bind: '$item',
        over: {
          query: 'tokensInZone' as const,
          zone: z1,
          filter: [{ prop: 'faction', op: 'eq' as const, value: 'NVA' }],
        },
        effects: [],
      },
    }];
    applyEffects(effects, ctx);
    const warnings = ctx.collector!.warnings;
    assert.ok(warnings.some((w) => w.code === 'EMPTY_QUERY_RESULT'));
  });

  it('emits no warnings when forEach matches tokens normally', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] });
    const effects: readonly EffectAST[] = [{
      forEach: {
        bind: '$item',
        over: {
          query: 'tokensInZone' as const,
          zone: z1,
          filter: [{ prop: 'faction', op: 'eq' as const, value: 'US' }],
        },
        effects: [],
      },
    }];
    applyEffects(effects, ctx);
    assert.equal(ctx.collector!.warnings.length, 0);
  });
});
