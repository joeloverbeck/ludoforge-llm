import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  createCollector,
  TriggerLogEntrySchema,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { makeExecutionEffectContext } from '../helpers/effect-context-test-helpers.js';

const phaseId = asPhaseId('main');
const actionId = asActionId('commit');

const makeDef = (): GameDef => ({
  metadata: { id: 'trace-contract', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'pool', type: 'int', init: 0, min: 0, max: 20 },
  ],
  perPlayerVars: [{ name: 'coins', type: 'int', init: 0, min: 0, max: 20 }],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [{
    id: actionId,
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params: [],
    pre: null,
    cost: [],
    effects: [
      { addVar: { scope: 'global', var: 'score', delta: 1 } },
      {
        transferVar: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pool' },
          amount: 2,
        },
      },
    ],
    limits: [],
  }],
  triggers: [],
  terminal: { conditions: [] },
} as unknown as GameDef);

const makeState = (): GameState => ({
  globalVars: { score: 3, pool: 2 },
  perPlayerVars: {
    '0': { coins: 7 },
    '1': { coins: 4 },
  },
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: phaseId,
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeEffectCtx = (): EffectContext => makeExecutionEffectContext({
  def: makeDef(),
  state: makeState(),
  collector: createCollector({ trace: true }),
  traceContext: { eventContext: 'actionEffect', actionId: 'contract', effectPathRoot: 'test.effects' },
  effectPath: '',
});

describe('trace semantics contract', () => {
  it('enforces no-op mutation trace parity across setVar, addVar, and transferVar', () => {
    const ctx = makeEffectCtx();
    const effects: readonly EffectAST[] = [
      { setVar: { scope: 'global', var: 'score', value: 3 } },
      { addVar: { scope: 'global', var: 'score', delta: 0 } },
      { addVar: { scope: 'pvar', player: 'actor', var: 'coins', delta: 0 } },
      {
        transferVar: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pool' },
          amount: 0,
        },
      },
    ];

    applyEffects(effects, ctx);
    assert.deepEqual(ctx.collector.trace, []);
  });

  it('keeps resourceTransfer and varChange trace entries coherent with provenance', () => {
    const ctx = makeEffectCtx();
    const effects: readonly EffectAST[] = [{
      transferVar: {
        from: { scope: 'pvar', player: 'actor', var: 'coins' },
        to: { scope: 'global', var: 'pool' },
        amount: 5,
      },
    }];

    applyEffects(effects, ctx);
    const trace = ctx.collector.trace ?? [];
    assert.deepEqual(
      trace.map((entry) => entry.kind),
      ['resourceTransfer', 'varChange', 'varChange'],
    );

    for (const entry of trace) {
      assert.equal(entry.provenance.eventContext, 'actionEffect');
      assert.equal(entry.provenance.actionId, 'contract');
      assert.equal(typeof entry.provenance.effectPath, 'string');
      assert.equal(entry.provenance.effectPath.length > 0, true);
    }

    const transfer = trace.find((entry) => entry.kind === 'resourceTransfer');
    assert.ok(transfer);
    const changes = trace.filter((entry) => entry.kind === 'varChange');
    const sourceChange = changes.find((entry) => entry.scope === 'perPlayer' && entry.varName === 'coins');
    const destinationChange = changes.find((entry) => entry.scope === 'global' && entry.varName === 'pool');
    assert.ok(sourceChange);
    assert.ok(destinationChange);

    const sourceDelta = Number(sourceChange.oldValue) - Number(sourceChange.newValue);
    const destinationDelta = Number(destinationChange.newValue) - Number(destinationChange.oldValue);
    assert.equal(sourceDelta, transfer.actualAmount);
    assert.equal(destinationDelta, transfer.actualAmount);
  });

  it('is deterministic for identical seed and move stream', () => {
    const def = makeDef();
    const first = applyMove(def, makeState(), { actionId, params: {} }, { trace: true });
    const second = applyMove(def, makeState(), { actionId, params: {} }, { trace: true });

    assert.deepEqual(first.effectTrace, second.effectTrace);
  });

  it('accepts deferred lifecycle trigger entry shape in trace contracts', () => {
    const parsed = TriggerLogEntrySchema.safeParse({
      kind: 'turnFlowDeferredEventLifecycle',
      stage: 'released',
      deferredId: 'deferred:1:0:event',
      actionId: 'event',
      requiredGrantBatchIds: ['vc-after'],
    });
    assert.equal(parsed.success, true);
  });
});
