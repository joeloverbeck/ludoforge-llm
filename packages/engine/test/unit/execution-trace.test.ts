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
  metadata: { id: 'trace-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
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
    globalVars: { score: 0 },
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
    traceContext: { eventContext: 'actionEffect', actionId: 'test-action', effectPathRoot: 'test.effects' },
    effectPath: '',
  };
}

describe('Effect execution trace', () => {
  it('traces forEach iteration count', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] }, {}, true);
    const effects: readonly EffectAST[] = [{
      forEach: {
        bind: '$item',
        over: { query: 'tokensInZone' as const, zone: z1, filter: [] },
        effects: [],
      },
    }];
    applyEffects(effects, ctx);
    const trace = ctx.collector!.trace!;
    const forEachEntry = trace.find((e) => e.kind === 'forEach');
    assert.ok(forEachEntry);
    assert.equal(forEachEntry.matchCount, 1);
    assert.equal(forEachEntry.iteratedCount, 1);
    assert.equal(forEachEntry.provenance.actionId, 'test-action');
    assert.equal(forEachEntry.provenance.eventContext, 'actionEffect');
    assert.equal(forEachEntry.provenance.effectPath, 'test.effects[0]');
  });

  it('traces reduce iteration count and bind roles', () => {
    const ctx = makeCtx({ [z1]: [], [z2]: [] }, {}, true);
    const effects: readonly EffectAST[] = [{
      reduce: {
        itemBind: '$n',
        accBind: '$acc',
        over: { query: 'intsInRange', min: 1, max: 3 },
        initial: 0,
        next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
        resultBind: '$sum',
        in: [],
      },
    }];
    applyEffects(effects, ctx);
    const trace = ctx.collector!.trace!;
    const reduceEntry = trace.find((e) => e.kind === 'reduce');
    assert.ok(reduceEntry);
    assert.equal(reduceEntry.matchCount, 3);
    assert.equal(reduceEntry.iteratedCount, 3);
    assert.equal(reduceEntry.itemBind, '$n');
    assert.equal(reduceEntry.accBind, '$acc');
    assert.equal(reduceEntry.resultBind, '$sum');
    assert.equal(reduceEntry.provenance.effectPath, 'test.effects[0]');
  });

  it('traces moveToken with from and to zones', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] }, { $tok: token }, true);
    const effects: readonly EffectAST[] = [{
      moveToken: { token: '$tok', from: z1, to: z2 },
    }];
    applyEffects(effects, ctx);
    const trace = ctx.collector!.trace!;
    const moveEntry = trace.find((e) => e.kind === 'moveToken');
    assert.ok(moveEntry);
    assert.equal(moveEntry.tokenId, 't1');
    assert.equal(moveEntry.from, z1);
    assert.equal(moveEntry.to, z2);
    assert.equal(moveEntry.provenance.effectPath, 'test.effects[0]');
  });

  it('traces setTokenProp with old and new values', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] }, { $tok: token }, true);
    const effects: readonly EffectAST[] = [{
      setTokenProp: { token: '$tok', prop: 'faction', value: 'NVA' },
    }];
    applyEffects(effects, ctx);
    const trace = ctx.collector!.trace!;
    const propEntry = trace.find((e) => e.kind === 'setTokenProp');
    assert.ok(propEntry);
    assert.equal(propEntry.oldValue, 'US');
    assert.equal(propEntry.newValue, 'NVA');
    assert.equal(propEntry.provenance.effectPath, 'test.effects[0]');
  });

  it('traces addVar with old and new values', () => {
    const ctx = makeCtx({ [z1]: [], [z2]: [] }, {}, true);
    const effects: readonly EffectAST[] = [{
      addVar: { scope: 'global', var: 'score', delta: 5 },
    }];
    applyEffects(effects, ctx);
    const trace = ctx.collector!.trace!;
    const varEntry = trace.find((e) => e.kind === 'varChange');
    assert.ok(varEntry);
    assert.equal(varEntry.scope, 'global');
    assert.equal(varEntry.varName, 'score');
    assert.equal(varEntry.oldValue, 0);
    assert.equal(varEntry.newValue, 5);
    assert.equal(varEntry.provenance.effectPath, 'test.effects[0]');
  });

  it('traces createToken with provenance', () => {
    const ctx = makeCtx({ [z1]: [], [z2]: [] }, {}, true);
    const effects: readonly EffectAST[] = [{
      createToken: { type: 'piece', zone: z1 },
    }];
    applyEffects(effects, ctx);
    const trace = ctx.collector!.trace!;
    const createEntry = trace.find((e) => e.kind === 'createToken');
    assert.ok(createEntry);
    assert.equal(createEntry.zone, z1);
    assert.equal(createEntry.type, 'piece');
    assert.equal(createEntry.provenance.effectPath, 'test.effects[0]');
  });

  it('produces no trace entries when trace is disabled', () => {
    const token: Token = { id: asTokenId('t1'), type: 'piece', props: { faction: 'US' } };
    const ctx = makeCtx({ [z1]: [token], [z2]: [] }, { $tok: token }, false);
    const effects: readonly EffectAST[] = [{
      moveToken: { token: '$tok', from: z1, to: z2 },
    }];
    applyEffects(effects, ctx);
    assert.equal(ctx.collector!.trace, null);
  });
});
