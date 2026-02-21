import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  EFFECT_RUNTIME_REASONS,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
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
}) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
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
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => {
  const def = makeDef();
  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: makeState(),
    rng: createRng(9n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams: {},
    collector: createCollector(),
    ...overrides,
  };
};

describe('effects reveal', () => {
  it('appends a zone grant for a specific player selector', () => {
    const effect: EffectAST = { reveal: { zone: 'hand:0', to: { id: asPlayerId(1) } } };
    const result = applyEffect(effect, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [{ observers: [asPlayerId(1)] }],
    });
  });

  it('stores public grant when to is all', () => {
    const effect: EffectAST = { reveal: { zone: 'hand:0', to: 'all' } };
    const result = applyEffect(effect, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [{ observers: 'all' }],
    });
  });

  it('accumulates multiple reveal grants for the same zone', () => {
    const effects: readonly EffectAST[] = [
      { reveal: { zone: 'hand:0', to: { id: asPlayerId(0) } } },
      { reveal: { zone: 'hand:0', to: { id: asPlayerId(1) } } },
    ];

    const result = applyEffects(effects, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(0)] },
        { observers: [asPlayerId(1)] },
      ],
    });
  });

  it('preserves filter metadata in reveal grants', () => {
    const effect: EffectAST = {
      reveal: {
        zone: 'hand:0',
        to: { id: asPlayerId(1) },
        filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
      },
    };

    const result = applyEffect(effect, makeCtx());
    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(1)], filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      ],
    });
  });

  it('deduplicates semantically equivalent reveal filters regardless of predicate order', () => {
    const effects: readonly EffectAST[] = [
      {
        reveal: {
          zone: 'hand:0',
          to: { id: asPlayerId(1) },
          filter: [
            { prop: 'faction', op: 'eq', value: 'US' },
            { prop: 'rank', op: 'eq', value: 1 },
          ],
        },
      },
      {
        reveal: {
          zone: 'hand:0',
          to: { id: asPlayerId(1) },
          filter: [
            { prop: 'rank', op: 'eq', value: 1 },
            { prop: 'faction', op: 'eq', value: 'US' },
          ],
        },
      },
    ];

    const result = applyEffects(effects, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        {
          observers: [asPlayerId(1)],
          filter: [
            { prop: 'faction', op: 'eq', value: 'US' },
            { prop: 'rank', op: 'eq', value: 1 },
          ],
        },
      ],
    });
  });

  it('emits reveal trace entry on successful grant addition', () => {
    const ctx = makeCtx({ collector: createCollector({ trace: true }) });
    const effect: EffectAST = {
      reveal: {
        zone: 'hand:0',
        to: { id: asPlayerId(1) },
        filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
      },
    };

    applyEffect(effect, ctx);

    assert.deepEqual(ctx.collector.trace, [
      {
        kind: 'reveal',
        zone: 'hand:0',
        observers: [asPlayerId(1)],
        filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
        provenance: {
          phase: 'main',
          eventContext: 'actionEffect',
          effectPath: 'effects',
        },
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

    applyEffect({ reveal: { zone: 'hand:0', to: { id: asPlayerId(1) } } }, ctx);

    assert.deepEqual(ctx.collector.trace, []);
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
      () => applyEffect({ reveal: { zone: 'hand:0', to: 'all' } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Zone state not found'),
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

    const effect: EffectAST = { conceal: { zone: 'hand:0' } };
    const result = applyEffect(effect, ctx);

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

    const effect: EffectAST = { conceal: { zone: 'hand:0' } };
    const result = applyEffect(effect, ctx);

    assert.notEqual(result.state, state);
    assert.equal(result.state.reveals, undefined);
    assert.deepEqual(state.reveals, {
      'hand:0': [{ observers: 'all' }],
    });
  });

  it('is a no-op when zone has no existing grants', () => {
    const ctx = makeCtx();
    const effect: EffectAST = { conceal: { zone: 'hand:0' } };
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

    const effect: EffectAST = { conceal: { zone: 'hand:0' } };
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

    const effect: EffectAST = { conceal: { zone: 'hand:0', from: { id: asPlayerId(1) } } };
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
            { observers: [asPlayerId(0)], filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
            { observers: [asPlayerId(1)], filter: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] },
            { observers: [asPlayerId(1)] },
          ],
        },
      },
    });

    const effect: EffectAST = {
      conceal: {
        zone: 'hand:0',
        filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
      },
    };
    const result = applyEffect(effect, ctx);

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(1)], filter: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] },
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
            { observers: [asPlayerId(1)], filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
            { observers: [asPlayerId(1)], filter: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] },
            { observers: [asPlayerId(0)], filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
          ],
        },
      },
    });

    const effect: EffectAST = {
      conceal: {
        zone: 'hand:0',
        from: { id: asPlayerId(1) },
        filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
      },
    };
    const result = applyEffect(effect, ctx);

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(1)], filter: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] },
        { observers: [asPlayerId(0)], filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
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

    const effect: EffectAST = { conceal: { zone: 'hand:0', from: 'all' } };
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
    const effect: EffectAST = { conceal: { zone: 'hand:0', from: { id: asPlayerId(1) } } };
    const result = applyEffect(effect, ctx);

    assert.equal(result.state, state);
  });

  it('emits conceal trace entry with removal metadata', () => {
    const ctx = makeCtx({
      collector: createCollector({ trace: true }),
      state: {
        ...makeState(),
        reveals: {
          'hand:0': [
            { observers: [asPlayerId(1)], filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
            { observers: [asPlayerId(1)], filter: [{ prop: 'faction', op: 'eq', value: 'ARVN' }] },
            { observers: [asPlayerId(0)], filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
          ],
        },
      },
    });

    applyEffect(
      {
        conceal: {
          zone: 'hand:0',
          from: { id: asPlayerId(1) },
          filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
        },
      },
      ctx,
    );

    assert.deepEqual(ctx.collector.trace, [
      {
        kind: 'conceal',
        zone: 'hand:0',
        from: [asPlayerId(1)],
        filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
        grantsRemoved: 1,
        provenance: {
          phase: 'main',
          eventContext: 'actionEffect',
          effectPath: 'effects',
        },
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

    applyEffect({ conceal: { zone: 'hand:0', from: { id: asPlayerId(1) } } }, ctx);

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
              filter: [
                { prop: 'faction', op: 'eq', value: 'US' },
                { prop: 'rank', op: 'eq', value: 1 },
              ],
            },
          ],
        },
      },
    });

    const effect: EffectAST = {
      conceal: {
        zone: 'hand:0',
        filter: [
          { prop: 'rank', op: 'eq', value: 1 },
          { prop: 'faction', op: 'eq', value: 'US' },
        ],
      },
    };
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
      { conceal: { zone: 'hand:0' } },
      { conceal: { zone: 'hand:0' } },
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
      () => applyEffect({ conceal: { zone: 'hand:0' } }, ctx),
      (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED);
        return String(error).includes('Zone state not found');
      },
    );
  });

  it('works in sequence with reveal', () => {
    const effects: readonly EffectAST[] = [
      { reveal: { zone: 'hand:0', to: 'all' } },
      { conceal: { zone: 'hand:0' } },
    ];

    const result = applyEffects(effects, makeCtx());

    assert.equal(result.state.reveals, undefined);
  });
});
