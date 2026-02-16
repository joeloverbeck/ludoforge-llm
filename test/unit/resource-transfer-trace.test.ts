import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type ZoneDef,
} from '../../src/kernel/index.js';

const traceDef: GameDef = {
  metadata: { id: 'resource-transfer-trace-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'pool', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [
    { name: 'coins', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'committed', type: 'int', init: 0, min: 0, max: 20 },
  ],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
} as unknown as GameDef;

const zoneDefs: readonly ZoneDef[] = traceDef.zones;

function makeCtx(args: {
  readonly player0Coins: number;
  readonly player1Committed?: number;
  readonly pool: number;
  readonly bindings?: Readonly<Record<string, unknown>>;
}): EffectContext {
  const state: GameState = {
    globalVars: { pool: args.pool },
    perPlayerVars: {
      '0': { coins: args.player0Coins, committed: 0 },
      '1': { coins: 0, committed: args.player1Committed ?? 0 },
    },
    playerCount: 2,
    zones: {},
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  };

  return {
    def: traceDef,
    adjacencyGraph: buildAdjacencyGraph(zoneDefs),
    state,
    rng: createRng(42n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: args.bindings ?? {},
    moveParams: {},
    collector: createCollector({ trace: true }),
    traceContext: { eventContext: 'actionEffect', actionId: 'transfer', effectPathRoot: 'test.effects' },
    effectPath: '',
  };
}

describe('resourceTransfer effect trace entries', () => {
  it('emits resourceTransfer with endpoints, amounts, provenance, and coherent varChange deltas', () => {
    const ctx = makeCtx({ player0Coins: 7, pool: 2 });
    const effects: readonly EffectAST[] = [{
      commitResource: {
        from: { scope: 'pvar', player: 'actor', var: 'coins' },
        to: { scope: 'global', var: 'pool' },
        amount: 5,
      },
    }];

    applyEffects(effects, ctx);
    const trace = ctx.collector.trace ?? [];

    const transfer = trace.find((entry) => entry.kind === 'resourceTransfer');
    assert.ok(transfer);
    assert.deepEqual(transfer.from, { scope: 'perPlayer', player: 0, varName: 'coins' });
    assert.deepEqual(transfer.to, { scope: 'global', varName: 'pool' });
    assert.equal(transfer.requestedAmount, 5);
    assert.equal(transfer.actualAmount, 5);
    assert.equal(transfer.provenance.actionId, 'transfer');
    assert.equal(transfer.provenance.effectPath, 'test.effects[0]');
    assert.deepEqual(
      trace.map((entry) => entry.kind),
      ['resourceTransfer', 'varChange', 'varChange'],
    );

    const changes = trace.filter((entry) => entry.kind === 'varChange');
    assert.equal(changes.length, 2);
    const sourceChange = changes.find((entry) => entry.scope === 'perPlayer' && entry.varName === 'coins');
    const destinationChange = changes.find((entry) => entry.scope === 'global' && entry.varName === 'pool');
    assert.ok(sourceChange);
    assert.ok(destinationChange);
    const sourceDelta = Number(sourceChange.oldValue) - Number(sourceChange.newValue);
    const destinationDelta = Number(destinationChange.newValue) - Number(destinationChange.oldValue);
    assert.equal(sourceDelta, transfer.actualAmount);
    assert.equal(destinationDelta, transfer.actualAmount);
  });

  it('records clamped transfer context fields', () => {
    const ctx = makeCtx({ player0Coins: 7, pool: 18 });
    const effects: readonly EffectAST[] = [{
      commitResource: {
        from: { scope: 'pvar', player: 'actor', var: 'coins' },
        to: { scope: 'global', var: 'pool' },
        amount: 10,
        min: 2,
        max: 4,
      },
    }];

    applyEffects(effects, ctx);
    const trace = ctx.collector.trace ?? [];
    const transfer = trace.find((entry) => entry.kind === 'resourceTransfer');
    assert.ok(transfer);
    assert.equal(transfer.requestedAmount, 10);
    assert.equal(transfer.sourceAvailable, 7);
    assert.equal(transfer.destinationHeadroom, 2);
    assert.equal(transfer.actualAmount, 2);
    assert.equal(transfer.minAmount, 2);
    assert.equal(transfer.maxAmount, 4);
  });

  it('does not emit resourceTransfer for no-op commitResource', () => {
    const ctx = makeCtx({ player0Coins: 0, pool: 10 });
    const effects: readonly EffectAST[] = [{
      commitResource: {
        from: { scope: 'pvar', player: 'actor', var: 'coins' },
        to: { scope: 'global', var: 'pool' },
        amount: 3,
      },
    }];

    applyEffects(effects, ctx);
    const trace = ctx.collector.trace ?? [];
    assert.equal(trace.some((entry) => entry.kind === 'resourceTransfer'), false);
    assert.equal(trace.some((entry) => entry.kind === 'varChange'), false);
  });

  it('emits per-player destination endpoint with player id', () => {
    const ctx = makeCtx({ player0Coins: 8, player1Committed: 3, pool: 0 });
    const effects: readonly EffectAST[] = [{
      commitResource: {
        from: { scope: 'pvar', player: 'actor', var: 'coins' },
        to: { scope: 'pvar', player: 'active', var: 'committed' },
        amount: 4,
      },
    }];

    applyEffects(effects, ctx);
    const trace = ctx.collector.trace ?? [];
    const transfer = trace.find((entry) => entry.kind === 'resourceTransfer');
    assert.ok(transfer);
    assert.deepEqual(transfer.from, { scope: 'perPlayer', player: 0, varName: 'coins' });
    assert.deepEqual(transfer.to, { scope: 'perPlayer', player: 0, varName: 'committed' });
  });

  it('emits no transfer trace when source and destination resolve to the same cell', () => {
    const ctx = makeCtx({ player0Coins: 8, pool: 0 });
    const effects: readonly EffectAST[] = [{
      commitResource: {
        from: { scope: 'pvar', player: 'actor', var: 'coins' },
        to: { scope: 'pvar', player: 'actor', var: 'coins' },
        amount: 4,
      },
    }];

    applyEffects(effects, ctx);
    const trace = ctx.collector.trace ?? [];
    assert.deepEqual(trace, []);
  });
});
