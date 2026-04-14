import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  applyEffects,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  createCollector,
  EFFECT_RUNTIME_REASONS,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { isEvalErrorCode } from '../../src/kernel/eval-error.js';
import { createDraftTracker, createMutableState } from '../../src/kernel/state-draft.js';
import { tokenFilterPathSuffix } from '../../src/kernel/token-filter-expr-utils.js';
import type { TokenFilterExpr } from '../../src/kernel/types.js';
import { isNormalizedEffectRuntimeFailure } from '../helpers/effect-error-assertions.js';
import { makeDiscoveryEffectContext, makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';

const makeDef = (): GameDef => asTaggedGameDef({
  metadata: { id: 'effects-reveal-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'set' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'set' },
    { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [{ id: 'piece', props: { faction: 'string' } }],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'hand:0': [],
    'hand:1': [],
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
  def: makeDef(),
  state: makeState(),
  ...overrides,
});

const makeDiscoveryCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeDiscoveryEffectContext({
  def: makeDef(),
  state: makeState(),
  ...overrides,
});

describe('effects reveal', () => {
  it('appends a zone grant for a specific player selector', () => {
    const effect: EffectAST = eff({ reveal: { zone: 'hand:0', to: { id: asPlayerId(1) } } });
    const result = applyEffect(effect, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [{ observers: [asPlayerId(1)] }],
    });
  });

  it('stores public grant when to is all', () => {
    const effect: EffectAST = eff({ reveal: { zone: 'hand:0', to: 'all' } });
    const result = applyEffect(effect, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [{ observers: 'all' }],
    });
  });

  it('resolves reveal.zone bindings from moveParams via eval context merging', () => {
    const effect: EffectAST = eff({
      reveal: {
        zone: { zoneExpr: { _t: 2 as const, ref: 'binding', name: '$targetZone' } },
        to: 'all',
      },
    });

    const result = applyEffect(effect, makeCtx({ moveParams: { $targetZone: 'hand:0' } }));

    assert.deepEqual(result.state.reveals, {
      'hand:0': [{ observers: 'all' }],
    });
  });

  it('accumulates multiple reveal grants for the same zone', () => {
    const effects: readonly EffectAST[] = [
      eff({ reveal: { zone: 'hand:0', to: { id: asPlayerId(0) } } }),
      eff({ reveal: { zone: 'hand:0', to: { id: asPlayerId(1) } } }),
    ];

    const result = applyEffects(effects, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(0)] },
        { observers: [asPlayerId(1)] },
      ],
    });
  });

  it('tracker-backed reveal clones the reveals map before mutation and preserves the original state', () => {
    const original = {
      ...makeState(),
      reveals: {
        'hand:0': [{ observers: [asPlayerId(0)] }],
      },
    };
    const mutable = createMutableState(original);
    const tracker = createDraftTracker();
    const preMutationReveals = mutable.reveals;

    const result = applyEffect(
      eff({ reveal: { zone: 'hand:0', to: { id: asPlayerId(1) } } }),
      makeCtx({ state: mutable, tracker }),
    );

    assert.equal(tracker.reveals, true);
    assert.notEqual(result.state.reveals, preMutationReveals);
    assert.deepEqual(original.reveals, {
      'hand:0': [{ observers: [asPlayerId(0)] }],
    });
    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(0)] },
        { observers: [asPlayerId(1)] },
      ],
    });
  });

  it('tracker-backed conceal can clear reveals without mutating the original state', () => {
    const original = {
      ...makeState(),
      reveals: {
        'hand:0': [{ observers: [asPlayerId(1)] }],
      },
    };
    const mutable = createMutableState(original);
    const tracker = createDraftTracker();

    const result = applyEffect(
      eff({ conceal: { zone: 'hand:0', from: { id: asPlayerId(1) } } }),
      makeCtx({ state: mutable, tracker }),
    );

    assert.equal(tracker.reveals, true);
    assert.equal(result.state.reveals, undefined);
    assert.deepEqual(original.reveals, {
      'hand:0': [{ observers: [asPlayerId(1)] }],
    });
  });

  it('preserves filter metadata in reveal grants', () => {
    const effect: EffectAST = eff({
      reveal: {
        zone: 'hand:0',
        to: { id: asPlayerId(1) },
        filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      },
    });

    const result = applyEffect(effect, makeCtx());
    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(1)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] } },
      ],
    });
  });

  it('deduplicates semantically equivalent reveal filters regardless of predicate order', () => {
    const effects: readonly EffectAST[] = [
      eff({
        reveal: {
          zone: 'hand:0',
          to: { id: asPlayerId(1) },
          filter: { op: 'and', args: [
            { prop: 'faction', op: 'eq', value: 'US' },
            { prop: 'rank', op: 'eq', value: 1 },
          ] },
        },
      }),
      eff({
        reveal: {
          zone: 'hand:0',
          to: { id: asPlayerId(1) },
          filter: { op: 'and', args: [
            { prop: 'rank', op: 'eq', value: 1 },
            { prop: 'faction', op: 'eq', value: 'US' },
          ] },
        },
      }),
    ];

    const result = applyEffects(effects, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        {
          observers: [asPlayerId(1)],
          filter: { op: 'and', args: [
            { prop: 'faction', op: 'eq', value: 'US' },
            { prop: 'rank', op: 'eq', value: 1 },
          ] },
        },
      ],
    });
  });

  it('emits reveal trace entry on successful grant addition', () => {
    const ctx = makeCtx({
      collector: createCollector({ trace: true }),
      traceContext: {
        eventContext: 'triggerEffect',
        actionId: asActionId('triggeredReveal'),
        effectPathRoot: 'triggers[0].effects',
      },
      effectPath: '.then[0]',
    });
    const effect: EffectAST = eff({
      reveal: {
        zone: 'hand:0',
        to: { id: asPlayerId(1) },
        filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      },
    });

    applyEffect(effect, ctx);

    assert.deepEqual(ctx.collector.trace, [
      {
        kind: 'reveal',
        zone: 'hand:0',
        observers: [asPlayerId(1)],
        filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] },
        provenance: {
          phase: 'main',
          eventContext: 'triggerEffect',
          actionId: 'triggeredReveal',
          effectPath: 'triggers[0].effects.then[0]',
        },
        seq: 0,
      },
    ]);
  });

  it('does not emit reveal trace entry on duplicate grant no-op', () => {
    const ctx = makeCtx({
      collector: createCollector({ trace: true }),
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: [asPlayerId(1)] }],
        },
      },
    });

    applyEffect(eff({ reveal: { zone: 'hand:0', to: { id: asPlayerId(1) } } }), ctx);

    assert.deepEqual(ctx.collector.trace, []);
  });

  it('rejects reveal.filter with deterministic TYPE_MISMATCH context for malformed token-filter nodes', () => {
    const ctx = makeCtx();
    const malformedFilter = {
      op: 'and',
      args: [
        { prop: 'faction', op: 'eq', value: 'US' },
        { prop: 'rank' },
      ],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () =>
        applyEffect(
          eff({ reveal: { zone: 'hand:0', to: 'all', filter: malformedFilter } } as never),
          ctx,
        ),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'unsupported_operator'
          && error.context.op === undefined
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '.args[1]';
      },
    );
  });

  it('rejects reveal.filter with deterministic TYPE_MISMATCH context for unsupported token-filter operators', () => {
    const ctx = makeCtx();
    const unsupportedOperatorFilter = {
      op: 'xor',
      args: [
        { prop: 'faction', op: 'eq', value: 'US' },
        { prop: 'rank', op: 'eq', value: 1 },
      ],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () =>
        applyEffect(
          eff({ reveal: { zone: 'hand:0', to: 'all', filter: unsupportedOperatorFilter } } as never),
          ctx,
        ),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'unsupported_operator'
          && error.context.op === 'xor'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '';
      },
    );
  });

  it('throws runtime error when state is missing resolved zone entry', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        zones: {
          'hand:1': [],
          'board:none': [],
        },
      },
    });

    assert.throws(
      () => applyEffect(eff({ reveal: { zone: 'hand:0', to: 'all' } }), ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Zone state not found'),
    );
  });

  it('normalizes unresolved reveal.zone bindings to effect runtime errors', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        applyEffect(
          eff({ reveal: { zone: { zoneExpr: { _t: 2 as const, ref: 'binding', name: '$missingZone' } }, to: { id: asPlayerId(1) } } }),
          ctx,
        ),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'reveal.zone resolution failed'),
    );
  });

  it('normalizes unresolved reveal.to selectors to effect runtime errors', () => {
    const ctx = makeCtx();

    assert.throws(
      () => applyEffect(eff({ reveal: { zone: 'hand:0', to: { chosen: '$missingPlayer' } } }), ctx),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'reveal.to selector resolution failed'),
    );
  });

  it('passes through unresolved reveal.to selectors in discovery mode', () => {
    const ctx = makeDiscoveryCtx();

    assert.throws(
      () => applyEffect(eff({ reveal: { zone: 'hand:0', to: { chosen: '$missingPlayer' } } }), ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );
  });
});

describe('effects conceal', () => {
  it('clears all grants for the target zone', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: 'all' }],
        },
      },
    });

    const effect: EffectAST = eff({ conceal: { zone: 'hand:0' } });
    const result = applyEffect(effect, ctx);

    assert.equal(result.state.reveals, undefined);
  });

  it('resolves conceal.zone bindings from moveParams via eval context merging', () => {
    const ctx = makeCtx({
      moveParams: { $targetZone: 'hand:0' },
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: 'all' }],
        },
      },
    });

    const result = applyEffect(
      eff({ conceal: { zone: { zoneExpr: { _t: 2 as const, ref: 'binding', name: '$targetZone' } } } }),
      ctx,
    );

    assert.equal(result.state.reveals, undefined);
  });

  it('removes reveals without mutating the input state object', () => {
    const state: GameState = {
      ...makeState(),
      reveals: {
        'hand:0': [{ observers: 'all' }],
      },
    };
    const ctx = makeCtx({ state });

    const effect: EffectAST = eff({ conceal: { zone: 'hand:0' } });
    const result = applyEffect(effect, ctx);

    assert.notEqual(result.state, state);
    assert.equal(result.state.reveals, undefined);
    assert.deepEqual(state.reveals, {
      'hand:0': [{ observers: 'all' }],
    });
  });

  it('is a no-op when zone has no existing grants', () => {
    const ctx = makeCtx();
    const effect: EffectAST = eff({ conceal: { zone: 'hand:0' } });
    const result = applyEffect(effect, ctx);

    assert.equal(result.state, ctx.state);
    assert.equal(result.state.reveals, undefined);
  });

  it('does not affect other zones', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: 'all' }],
          'hand:1': [{ observers: [asPlayerId(0)] }],
        },
      },
    });

    const effect: EffectAST = eff({ conceal: { zone: 'hand:0' } });
    const result = applyEffect(effect, ctx);

    assert.deepEqual(result.state.reveals, {
      'hand:1': [{ observers: [asPlayerId(0)] }],
    });
  });

  it('removes only grants matching conceal.from selector', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [
            { observers: [asPlayerId(0)] },
            { observers: [asPlayerId(1)] },
            { observers: 'all' },
          ],
        },
      },
    });

    const effect: EffectAST = eff({ conceal: { zone: 'hand:0', from: { id: asPlayerId(1) } } });
    const result = applyEffect(effect, ctx);

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(0)] },
        { observers: 'all' },
      ],
    });
  });

  it('removes only grants matching conceal.filter', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [
            { observers: [asPlayerId(0)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] } },
            { observers: [asPlayerId(1)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] } },
            { observers: [asPlayerId(1)] },
          ],
        },
      },
    });

    const effect: EffectAST = eff({
      conceal: {
        zone: 'hand:0',
        filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      },
    });
    const result = applyEffect(effect, ctx);

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(1)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] } },
        { observers: [asPlayerId(1)] },
      ],
    });
  });

  it('applies AND semantics when conceal.from and conceal.filter are both present', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [
            { observers: [asPlayerId(1)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] } },
            { observers: [asPlayerId(1)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] } },
            { observers: [asPlayerId(0)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] } },
          ],
        },
      },
    });

    const effect: EffectAST = eff({
      conceal: {
        zone: 'hand:0',
        from: { id: asPlayerId(1) },
        filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      },
    });
    const result = applyEffect(effect, ctx);

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(1)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] } },
        { observers: [asPlayerId(0)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] } },
      ],
    });
  });

  it('treats conceal.from=all as matching only public grants', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [
            { observers: 'all' },
            { observers: [asPlayerId(0)] },
            { observers: [asPlayerId(1)] },
          ],
        },
      },
    });

    const effect: EffectAST = eff({ conceal: { zone: 'hand:0', from: 'all' } });
    const result = applyEffect(effect, ctx);

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(0)] },
        { observers: [asPlayerId(1)] },
      ],
    });
  });

  it('is a no-op when selective conceal matches no grants', () => {
    const state = {
      ...makeState(),
      reveals: {
        'hand:0': [{ observers: [asPlayerId(0)] }],
      },
    };
    const ctx = makeCtx({ state });
    const effect: EffectAST = eff({ conceal: { zone: 'hand:0', from: { id: asPlayerId(1) } } });
    const result = applyEffect(effect, ctx);

    assert.equal(result.state, state);
  });

  it('rejects conceal.filter with deterministic TYPE_MISMATCH context for malformed token-filter nodes', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: 'all' }],
        },
      },
    });
    const malformedFilter = {
      op: 'and',
      args: [
        { prop: 'faction', op: 'eq', value: 'US' },
        { prop: 'rank' },
      ],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () =>
        applyEffect(
          eff({ conceal: { zone: 'hand:0', filter: malformedFilter } } as never),
          ctx,
        ),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'unsupported_operator'
          && error.context.op === undefined
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '.args[1]';
      },
    );
  });

  it('rejects conceal.filter with deterministic TYPE_MISMATCH context for unsupported token-filter operators', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: 'all' }],
        },
      },
    });
    const unsupportedOperatorFilter = {
      op: 'xor',
      args: [
        { prop: 'faction', op: 'eq', value: 'US' },
        { prop: 'rank', op: 'eq', value: 1 },
      ],
    } as unknown as TokenFilterExpr;

    assert.throws(
      () =>
        applyEffect(
          eff({ conceal: { zone: 'hand:0', filter: unsupportedOperatorFilter } } as never),
          ctx,
        ),
      (error: unknown) => {
        if (!isEvalErrorCode(error, 'TYPE_MISMATCH')) {
          return false;
        }
        return error.context?.reason === 'unsupported_operator'
          && error.context.op === 'xor'
          && Array.isArray(error.context.path)
          && tokenFilterPathSuffix(error.context.path) === '';
      },
    );
  });

  it('emits conceal trace entry with removal metadata', () => {
    const ctx = makeCtx({
      collector: createCollector({ trace: true }),
      traceContext: {
        eventContext: 'triggerEffect',
        actionId: asActionId('triggeredConceal'),
        effectPathRoot: 'triggers[0].effects',
      },
      effectPath: '.else[1]',
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [
            { observers: [asPlayerId(1)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] } },
            { observers: [asPlayerId(1)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] } },
            { observers: [asPlayerId(0)], filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] } },
          ],
        },
      },
    });

    applyEffect(
      eff({
        conceal: {
          zone: 'hand:0',
          from: { id: asPlayerId(1) },
          filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] },
        },
      }),
      ctx,
    );

    assert.deepEqual(ctx.collector.trace, [
      {
        kind: 'conceal',
        zone: 'hand:0',
        from: [asPlayerId(1)],
        filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] },
        grantsRemoved: 1,
        provenance: {
          phase: 'main',
          eventContext: 'triggerEffect',
          actionId: 'triggeredConceal',
          effectPath: 'triggers[0].effects.else[1]',
        },
        seq: 0,
      },
    ]);
  });

  it('does not emit conceal trace entry when selective conceal matches no grants', () => {
    const ctx = makeCtx({
      collector: createCollector({ trace: true }),
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: [asPlayerId(0)] }],
        },
      },
    });

    applyEffect(eff({ conceal: { zone: 'hand:0', from: { id: asPlayerId(1) } } }), ctx);

    assert.deepEqual(ctx.collector.trace, []);
  });

  it('matches conceal.filter regardless of predicate order', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [
            {
              observers: [asPlayerId(1)],
              filter: { op: 'and', args: [
                { prop: 'faction', op: 'eq', value: 'US' },
                { prop: 'rank', op: 'eq', value: 1 },
              ] },
            },
          ],
        },
      },
    });

    const effect: EffectAST = eff({
      conceal: {
        zone: 'hand:0',
        filter: { op: 'and', args: [
          { prop: 'rank', op: 'eq', value: 1 },
          { prop: 'faction', op: 'eq', value: 'US' },
        ] },
      },
    });
    const result = applyEffect(effect, ctx);

    assert.equal(result.state.reveals, undefined);
  });

  it('is idempotent', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: 'all' }],
        },
      },
    });

    const effects: readonly EffectAST[] = [
      eff({ conceal: { zone: 'hand:0' } }),
      eff({ conceal: { zone: 'hand:0' } }),
    ];
    const result = applyEffects(effects, ctx);

    assert.equal(result.state.reveals, undefined);
  });

  it('throws runtime error on unknown zone', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        zones: {
          'hand:1': [],
          'board:none': [],
        },
      },
    });

    assert.throws(
      () => applyEffect(eff({ conceal: { zone: 'hand:0' } }), ctx),
      (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED);
        return String(error).includes('Zone state not found');
      },
    );
  });

  it('normalizes unresolved conceal.zone bindings to effect runtime errors', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        applyEffect(
          eff({ conceal: { zone: { zoneExpr: { _t: 2 as const, ref: 'binding', name: '$missingZone' } } } }),
          ctx,
        ),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'conceal.zone resolution failed'),
    );
  });

  it('normalizes unresolved conceal.from selectors to effect runtime errors', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: [asPlayerId(0)] }],
        },
      },
    });

    assert.throws(
      () => applyEffect(eff({ conceal: { zone: 'hand:0', from: { chosen: '$missingPlayer' } } }), ctx),
      (error: unknown) => isNormalizedEffectRuntimeFailure(error, 'conceal.from selector resolution failed'),
    );
  });

  it('passes through unresolved conceal.from selectors in discovery mode', () => {
    const ctx = makeDiscoveryCtx({
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [{ observers: [asPlayerId(0)] }],
        },
      },
    });

    assert.throws(
      () => applyEffect(eff({ conceal: { zone: 'hand:0', from: { chosen: '$missingPlayer' } } }), ctx),
      (error: unknown) => isEvalErrorCode(error, 'MISSING_BINDING'),
    );
  });

  it('works in sequence with reveal', () => {
    const effects: readonly EffectAST[] = [
      eff({ reveal: { zone: 'hand:0', to: 'all' } }),
      eff({ conceal: { zone: 'hand:0' } }),
    ];

    const result = applyEffects(effects, makeCtx());

    assert.equal(result.state.reveals, undefined);
  });
});
