import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeEffectContext } from '../helpers/effect-context-test-helpers.js';
import {
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { isNormalizedEffectRuntimeFailure } from '../helpers/effect-error-assertions.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'transfer-var-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'pot', type: 'int', init: 0, min: 0, max: 50 },
    { name: 'globalFlag', type: 'boolean', init: false },
  ],
  perPlayerVars: [
    { name: 'coins', type: 'int', init: 0, min: 0, max: 50 },
    { name: 'committed', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'locked', type: 'boolean', init: false },
  ],
  zoneVars: [{ name: 'supply', type: 'int', init: 0, min: 0, max: 50 }],
  zones: [
    { id: 'zone-a:none' as never, owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: 'zone-b:none' as never, owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { pot: 4, globalFlag: false },
  perPlayerVars: {
    '0': { coins: 10, committed: 1, locked: false },
    '1': { coins: 7, committed: 2, locked: false },
  },
  zoneVars: {
    'zone-a:none': { supply: 9 },
    'zone-b:none': { supply: 1 },
  },
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => makeEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(9n),
  activePlayer: asPlayerId(1),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
mode: 'execution',
...overrides,
});

describe('transferVar effect', () => {
  it('transfers exact amount when source and destination both have capacity', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      transferVar: {
        from: { scope: 'pvar', player: 'actor', var: 'coins' },
        to: { scope: 'global', var: 'pot' },
        amount: 3,
      },
    };

    const result = applyEffect(effect, ctx);

    assert.equal(result.state.perPlayerVars['0']?.coins, 7);
    assert.equal(result.state.globalVars.pot, 7);
    assert.deepEqual(result.emittedEvents, [
      { type: 'varChanged', scope: 'perPlayer', player: asPlayerId(0), var: 'coins', oldValue: 10, newValue: 7 },
      { type: 'varChanged', scope: 'global', var: 'pot', oldValue: 4, newValue: 7 },
    ]);
  });

  it('clamps over-requested amount to available source balance (all-in)', () => {
    const ctx = makeCtx();

    const result = applyEffect(
      {
        transferVar: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pot' },
          amount: 999,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 0);
    assert.equal(result.state.globalVars.pot, 14);
  });

  it('applies min all-in trigger when regular transfer would be below min', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        perPlayerVars: {
          ...makeState().perPlayerVars,
          '0': { coins: 3, committed: 1, locked: false },
        },
      },
    });

    const result = applyEffect(
      {
        transferVar: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pot' },
          amount: 2,
          min: 4,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 0);
    assert.equal(result.state.globalVars.pot, 7);
  });

  it('caps transfer using max after all-in calculation', () => {
    const ctx = makeCtx();

    const result = applyEffect(
      {
        transferVar: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pot' },
          amount: 9,
          max: 4,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 6);
    assert.equal(result.state.globalVars.pot, 8);
  });

  it('binds actual transferred amount, not requested amount', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          transferVar: {
            from: { scope: 'pvar', player: 'actor', var: 'coins' },
            to: { scope: 'global', var: 'pot' },
            amount: 999,
            actualBind: '$actual',
          },
        },
        { addVar: { scope: 'global', var: 'pot', delta: { ref: 'binding', name: '$actual' } } },
      ],
      ctx,
    );

    assert.equal(result.state.globalVars.pot, 24);
  });

  it('is a no-op for zero transfer and still exports actualBind=0', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          transferVar: {
            from: { scope: 'pvar', player: 'actor', var: 'coins' },
            to: { scope: 'global', var: 'pot' },
            amount: 0,
            actualBind: '$actual',
          },
        },
        { addVar: { scope: 'global', var: 'pot', delta: { ref: 'binding', name: '$actual' } } },
      ],
      ctx,
    );

    assert.equal(result.state, ctx.state);
    assert.deepEqual(result.emittedEvents, []);
  });

  it('preserves total resources for source/destination pair over a transfer matrix', () => {
    for (const amount of [0, 1, 5, 9, 10, 50]) {
      for (const min of [undefined, 0, 3, 20] as const) {
        for (const max of [undefined, 2, 7, 30] as const) {
          const ctx = makeCtx();
          const beforeTotal = Number(ctx.state.perPlayerVars['0']?.coins ?? 0) + Number(ctx.state.globalVars.pot ?? 0);
          const effect: EffectAST = {
            transferVar: {
              from: { scope: 'pvar', player: 'actor', var: 'coins' },
              to: { scope: 'global', var: 'pot' },
              amount,
              ...(min === undefined ? {} : { min }),
              ...(max === undefined ? {} : { max }),
            },
          };
          const result = applyEffect(effect, ctx);
          const afterTotal = Number(result.state.perPlayerVars['0']?.coins ?? 0) + Number(result.state.globalVars.pot ?? 0);
          assert.equal(afterTotal, beforeTotal);
        }
      }
    }
  });

  it('transfers to another player per-player variable', () => {
    const ctx = makeCtx();
    const result = applyEffect(
      {
        transferVar: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'pvar', player: 'active', var: 'committed' },
          amount: 5,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 5);
    assert.equal(result.state.perPlayerVars['1']?.committed, 7);
  });

  it('supports global->pvar transfers', () => {
    const ctx = makeCtx();
    const result = applyEffect(
      {
        transferVar: {
          from: { scope: 'global', var: 'pot' },
          to: { scope: 'pvar', player: 'actor', var: 'coins' },
          amount: 3,
        },
      },
      ctx,
    );

    assert.equal(result.state.globalVars.pot, 1);
    assert.equal(result.state.perPlayerVars['0']?.coins, 13);
  });

  it('supports global->global transfers', () => {
    const ctx = makeCtx({
      def: {
        ...makeDef(),
        globalVars: [
          { name: 'pot', type: 'int', init: 0, min: 0, max: 50 },
          { name: 'bank', type: 'int', init: 0, min: 0, max: 50 },
          { name: 'globalFlag', type: 'boolean', init: false },
        ],
      },
      state: {
        ...makeState(),
        globalVars: { pot: 4, bank: 0, globalFlag: false },
      },
    });

    const result = applyEffect(
      {
        transferVar: {
          from: { scope: 'global', var: 'pot' },
          to: { scope: 'global', var: 'bank' },
          amount: 2,
        },
      },
      ctx,
    );

    assert.equal(result.state.globalVars.pot, 2);
    assert.equal(result.state.globalVars.bank, 2);
  });

  it('supports zoneVar->zoneVar transfers', () => {
    const ctx = makeCtx();
    const result = applyEffect(
      {
        transferVar: {
          from: { scope: 'zoneVar', zone: 'zone-a:none', var: 'supply' },
          to: { scope: 'zoneVar', zone: 'zone-b:none', var: 'supply' },
          amount: 4,
        },
      },
      ctx,
    );

    assert.equal(result.state.zoneVars['zone-a:none']?.supply, 5);
    assert.equal(result.state.zoneVars['zone-b:none']?.supply, 5);
    assert.deepEqual(result.emittedEvents, [
      {
        type: 'varChanged',
        scope: 'zone',
        zone: 'zone-a:none',
        var: 'supply',
        oldValue: 9,
        newValue: 5,
      },
      {
        type: 'varChanged',
        scope: 'zone',
        zone: 'zone-b:none',
        var: 'supply',
        oldValue: 1,
        newValue: 5,
      },
    ]);
  });

  it('zoneVar->zoneVar transfer preserves unrelated global/per-player branch references', () => {
    const ctx = makeCtx();
    const result = applyEffect(
      {
        transferVar: {
          from: { scope: 'zoneVar', zone: 'zone-a:none', var: 'supply' },
          to: { scope: 'zoneVar', zone: 'zone-b:none', var: 'supply' },
          amount: 2,
        },
      },
      ctx,
    );

    assert.equal(result.state.globalVars, ctx.state.globalVars);
    assert.equal(result.state.perPlayerVars, ctx.state.perPlayerVars);
    assert.notEqual(result.state.zoneVars, ctx.state.zoneVars);
  });

  it('caps transfer by destination max headroom while preserving conservation', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        perPlayerVars: {
          ...makeState().perPlayerVars,
          '1': { coins: 7, committed: 19, locked: false },
        },
      },
    });

    const result = applyEffect(
      {
        transferVar: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'pvar', player: 'active', var: 'committed' },
          amount: 6,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 9);
    assert.equal(result.state.perPlayerVars['1']?.committed, 20);
    const beforeTotal =
      Number(ctx.state.perPlayerVars['0']?.coins ?? 0) + Number(ctx.state.perPlayerVars['1']?.committed ?? 0);
    const afterTotal =
      Number(result.state.perPlayerVars['0']?.coins ?? 0) + Number(result.state.perPlayerVars['1']?.committed ?? 0);
    assert.equal(afterTotal, beforeTotal);
  });

  it('throws EFFECT_RUNTIME for boolean variable source or destination', () => {
    const ctx = makeCtx();
    assert.throws(
      () =>
        applyEffect(
          {
            transferVar: {
              from: { scope: 'pvar', player: 'actor', var: 'locked' },
              to: { scope: 'global', var: 'pot' },
              amount: 1,
            },
          },
          ctx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-int variable'),
    );

    assert.throws(
      () =>
        applyEffect(
          {
            transferVar: {
              from: { scope: 'pvar', player: 'actor', var: 'coins' },
              to: { scope: 'global', var: 'globalFlag' },
              amount: 1,
            },
          },
          ctx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-int variable'),
    );
  });

  it('throws canonical transferVar runtime diagnostics when int-targeted runtime state is corrupted to boolean', () => {
    const corruptedState = makeState();
    const ctx = makeCtx({
      state: {
        ...corruptedState,
        perPlayerVars: {
          ...corruptedState.perPlayerVars,
          '0': {
            ...corruptedState.perPlayerVars['0'],
            coins: false as unknown as number,
          },
        },
      },
    });

    assert.throws(
      () =>
        applyEffect(
          {
            transferVar: {
              from: { scope: 'pvar', player: 'actor', var: 'coins' },
              to: { scope: 'global', var: 'pot' },
              amount: 1,
            },
          },
          ctx,
        ),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
        String(error).includes('Per-player variable state must be a finite safe integer: coins'),
    );
  });

  it('throws EFFECT_RUNTIME when pvar endpoint payload omits player selector', () => {
    const ctx = makeCtx();
    const malformed = {
      transferVar: {
        from: { scope: 'pvar', var: 'coins' },
        to: { scope: 'global', var: 'pot' },
        amount: 1,
      },
    } as unknown as EffectAST;

    assert.throws(
      () => applyEffect(malformed, ctx),
      (error: unknown) =>
        isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('requires player selector'),
    );
  });

  it('throws EFFECT_RUNTIME when zoneVar endpoint payload omits zone selector', () => {
    const ctx = makeCtx();
    const malformed = {
      transferVar: {
        from: { scope: 'zoneVar', var: 'supply' },
        to: { scope: 'global', var: 'pot' },
        amount: 1,
      },
    } as unknown as EffectAST;

    assert.throws(
      () => applyEffect(malformed, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('requires zone selector'),
    );
  });

  it('wraps pvar endpoint selector resolution failures into EFFECT_RUNTIME', () => {
    const ctx = makeCtx();
    const unresolvedSelectorEffect = {
      transferVar: {
        from: { scope: 'pvar', player: { chosen: '$missingPlayer' }, var: 'coins' },
        to: { scope: 'global', var: 'pot' },
        amount: 1,
      },
    } as unknown as EffectAST;

    assert.throws(
      () => applyEffect(unresolvedSelectorEffect, ctx),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'transferVar pvar endpoint resolution failed'),
    );
  });

  it('wraps source zoneVar endpoint selector resolution failures into EFFECT_RUNTIME', () => {
    const ctx = makeCtx();
    const unresolvedSourceZone = {
      transferVar: {
        from: { scope: 'zoneVar', zone: { zoneExpr: { ref: 'binding', name: '$missingSourceZone' } }, var: 'supply' },
        to: { scope: 'global', var: 'pot' },
        amount: 1,
      },
    } as unknown as EffectAST;

    assert.throws(
      () => applyEffect(unresolvedSourceZone, ctx),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'transferVar zoneVar endpoint resolution failed'),
    );
  });

  it('wraps destination zoneVar endpoint selector resolution failures into EFFECT_RUNTIME', () => {
    const ctx = makeCtx();
    const unresolvedDestinationZone = {
      transferVar: {
        from: { scope: 'global', var: 'pot' },
        to: { scope: 'zoneVar', zone: { zoneExpr: { ref: 'binding', name: '$missingDestinationZone' } }, var: 'supply' },
        amount: 1,
      },
    } as unknown as EffectAST;

    assert.throws(
      () => applyEffect(unresolvedDestinationZone, ctx),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'transferVar zoneVar endpoint resolution failed'),
    );
  });

  it('keeps emitted varChanged events in scope-payload parity with varChange trace entries', () => {
    const cases: readonly { readonly name: string; readonly effect: EffectAST }[] = [
      {
        name: 'pvar->global',
        effect: {
          transferVar: {
            from: { scope: 'pvar', player: 'actor', var: 'coins' },
            to: { scope: 'global', var: 'pot' },
            amount: 2,
          },
        },
      },
      {
        name: 'global->pvar',
        effect: {
          transferVar: {
            from: { scope: 'global', var: 'pot' },
            to: { scope: 'pvar', player: 'actor', var: 'coins' },
            amount: 2,
          },
        },
      },
      {
        name: 'zoneVar->zoneVar',
        effect: {
          transferVar: {
            from: { scope: 'zoneVar', zone: 'zone-a:none', var: 'supply' },
            to: { scope: 'zoneVar', zone: 'zone-b:none', var: 'supply' },
            amount: 2,
          },
        },
      },
    ];

    for (const testCase of cases) {
      const collector = createCollector({ trace: true });
      const ctx = makeCtx({ collector });
      const result = applyEffect(testCase.effect, ctx);
      const traceChanges = (collector.trace ?? []).filter((entry) => entry.kind === 'varChange');
      const emittedVarChanged = (result.emittedEvents ?? []).filter((entry) => entry.type === 'varChanged');

      assert.equal(emittedVarChanged.length, traceChanges.length, `${testCase.name}: change count mismatch`);
      assert.equal(traceChanges.length, 2, `${testCase.name}: expected source + destination changes`);

      const normalizedTrace = traceChanges.map((entry) =>
        entry.scope === 'global'
          ? {
              scope: entry.scope,
              var: entry.varName,
              oldValue: entry.oldValue,
              newValue: entry.newValue,
            }
          : entry.scope === 'perPlayer'
            ? {
                scope: entry.scope,
                player: entry.player,
                var: entry.varName,
                oldValue: entry.oldValue,
                newValue: entry.newValue,
              }
            : {
                scope: entry.scope,
                zone: entry.zone,
                var: entry.varName,
                oldValue: entry.oldValue,
                newValue: entry.newValue,
              },
      );

      const normalizedEvents = emittedVarChanged.map((entry) =>
        entry.scope === 'global'
          ? {
              scope: entry.scope,
              var: entry.var,
              oldValue: entry.oldValue,
              newValue: entry.newValue,
            }
          : entry.scope === 'perPlayer'
            ? {
                scope: entry.scope,
                player: entry.player,
                var: entry.var,
                oldValue: entry.oldValue,
                newValue: entry.newValue,
              }
            : {
                scope: entry.scope,
                zone: entry.zone,
                var: entry.var,
                oldValue: entry.oldValue,
                newValue: entry.newValue,
              },
      );

      assert.deepEqual(normalizedEvents, normalizedTrace, `${testCase.name}: trace/event scope mapping drift`);
    }
  });
});
