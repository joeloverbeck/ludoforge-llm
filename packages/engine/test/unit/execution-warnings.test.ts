import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createCollector,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type OptionsQuery,
  type Token,
} from '../../src/kernel/index.js';
import { makeExecutionEffectContext } from '../helpers/effect-context-test-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';

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
    zoneVars: {},
    playerCount: 2,
    zones,
    nextTokenOrdinal: 100,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  };
  return makeExecutionEffectContext({
    def: minimalDef,
    state,
    bindings: bindings ?? {},
    collector: createCollector(trace !== undefined ? { trace } : undefined),
  });
}

describe('Runtime warnings', () => {
  it('does not emit runtime warnings when forEach matches 0 tokens', () => {
    const ctx = makeCtx({ [z1]: [], [z2]: [] });
    const effects: readonly EffectAST[] = [eff({
      forEach: {
        bind: '$item',
        over: { query: 'tokensInZone' as const, zone: z1, filter: { op: 'and', args: [] } } as unknown as OptionsQuery,
        effects: [],
      },
    })];
    applyEffects(effects, ctx);
    assert.deepEqual(ctx.collector!.warnings, []);
  });

  it('does not emit runtime warnings when a token filter reduces matches to 0', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] });
    const effects: readonly EffectAST[] = [eff({
      forEach: {
        bind: '$item',
        over: {
          query: 'tokensInZone' as const,
          zone: z1,
          filter: { op: 'and', args: [{ prop: 'faction', op: 'eq' as const, value: 'NVA' }] },
        },
        effects: [],
      },
    })];
    applyEffects(effects, ctx);
    assert.deepEqual(ctx.collector!.warnings, []);
  });

  it('emits no warnings when forEach matches tokens normally', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] });
    const effects: readonly EffectAST[] = [eff({
      forEach: {
        bind: '$item',
        over: {
          query: 'tokensInZone' as const,
          zone: z1,
          filter: { op: 'and', args: [{ prop: 'faction', op: 'eq' as const, value: 'US' }] },
        },
        effects: [],
      },
    })];
    applyEffects(effects, ctx);
    assert.equal(ctx.collector!.warnings.length, 0);
  });
});
