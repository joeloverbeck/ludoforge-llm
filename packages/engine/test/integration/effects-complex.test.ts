import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import {
  applyMove,
  buildAdjacencyGraph,
  applyEffects,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  legalChoicesDiscover,
  nextInt,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import { eff } from '../helpers/effect-tag-helper.js';

const token = (id: string, rank: number): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { rank },
});

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-complex-integration', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'score', type: 'int', init: 0, min: 0, max: 999 },
    { name: 'count', type: 'int', init: 0, min: 0, max: 999 },
  ],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: { rank: 'int', label: 'string' } }],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { score: 0, count: 0 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [token('d1', 1), token('d2', 3), token('d3', 2)],
    'discard:none': [token('x1', 7)],
    'hand:0': [token('h1', 4)],
  },
  nextTokenOrdinal: 4,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(2026n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('effects complex integration chains', () => {
  it('applies a realistic effect chain spanning choice assertions, control flow, movement, shuffle, and lifecycle', () => {
    const seedRng = createRng(2026n);
    const expectedDiscardBeforeShuffle = [asTokenId('x1'), asTokenId('d1')];
    const [swapIndex, expectedRng] = nextInt(seedRng, 0, 1);
    const expectedDiscardAfterShuffle =
      swapIndex === 1 ? expectedDiscardBeforeShuffle : [expectedDiscardBeforeShuffle[1]!, expectedDiscardBeforeShuffle[0]!];

    const ctx = makeCtx({
      rng: seedRng,
      moveParams: {
        '$zoneChoice': 'discard:none',
        '$tags': ['alpha', 'beta'],
        $label: 'spawned',
      },
      bindings: {
        $move: asTokenId('d1'),
        $destroy: asTokenId('h1'),
      },
    });

    const effects: readonly EffectAST[] = [
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$zoneChoice',
          bind: '$zoneChoice',
          options: { query: 'enums', values: ['deck:none', 'discard:none'] },
        },
      }),
      eff({
        chooseN: {
          internalDecisionId: 'decision:$tags',
          bind: '$tags',
          options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
          n: 2,
        },
      }),
      eff({
        let: {
          bind: '$base',
          value: 2,
          in: [eff({ addVar: { scope: 'global', var: 'score', delta: { _t: 2 as const, ref: 'binding', name: '$base' } } })],
        },
      }),
      eff({
        forEach: {
          bind: '$n',
          over: { query: 'intsInRange', min: 1, max: 3 },
          limit: 2,
          effects: [
            eff({
              if: {
                when: { op: '>', left: { _t: 2 as const, ref: 'binding', name: '$n' }, right: 1 },
                then: [eff({ addVar: { scope: 'global', var: 'score', delta: { _t: 2 as const, ref: 'binding', name: '$n' } } })],
                else: [eff({ addVar: { scope: 'global', var: 'score', delta: 5 } })],
              },
            }),
          ],
        },
      }),
      eff({ moveToken: { token: '$move', from: 'deck:none', to: 'discard:none', position: 'bottom' } }),
      eff({ shuffle: { zone: 'discard:none' } }),
      eff({ createToken: { type: 'card', zone: 'hand:0', props: { rank: 9, label: { _t: 2 as const, ref: 'binding', name: '$label' } } } }),
      eff({ destroyToken: { token: '$destroy' } }),
    ];

    const result = applyEffects(effects, ctx);

    assert.equal(result.state.globalVars.score, 9);
    assert.deepEqual(
      result.state.zones['deck:none']?.map((entry) => entry.id),
      [asTokenId('d2'), asTokenId('d3')],
    );
    assert.deepEqual(
      result.state.zones['discard:none']?.map((entry) => entry.id),
      expectedDiscardAfterShuffle,
    );
    assert.equal(result.state.zones['hand:0']?.length, 1);
    assert.equal(result.state.zones['hand:0']?.[0]?.id, asTokenId('tok_card_4'));
    assert.deepEqual(result.state.zones['hand:0']?.[0]?.props, { rank: 9, label: 'spawned' });
    assert.equal(result.state.nextTokenOrdinal, 5);
    assert.deepEqual(result.rng.state, expectedRng.state);
  });

  it('threads nested let + forEach + if deterministically and yields expected cumulative result', () => {
    const ctx = makeCtx();
    const effects: readonly EffectAST[] = [
      eff({
        let: {
          bind: '$bonus',
          value: 3,
          in: [
            eff({
              forEach: {
                bind: '$n',
                over: { query: 'intsInRange', min: 1, max: 4 },
                effects: [
                  eff({
                    if: {
                      when: { op: '>', left: { _t: 2 as const, ref: 'binding', name: '$n' }, right: 2 },
                      then: [
                        eff({
                          addVar: {
                            scope: 'global',
                            var: 'count',
                            delta: { _t: 6 as const, op: '+', left: { _t: 2 as const, ref: 'binding', name: '$n' }, right: { _t: 2 as const, ref: 'binding', name: '$bonus' } },
                          },
                        }),
                      ],
                      else: [eff({ addVar: { scope: 'global', var: 'count', delta: 1 } })],
                    },
                  }),
                ],
              },
            }),
          ],
        },
      }),
    ];

    const result = applyEffects(effects, ctx);

    assert.equal(result.state.globalVars.count, 15);
    assert.deepEqual(result.state.zones, ctx.state.zones);
    assert.equal(result.rng, ctx.rng);
  });

  it('compiles and executes dynamic scoped variable names through DSL authoring', () => {
    const compiled = compileGameSpecToGameDef({
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'effects-complex-dynamic-scoped-vars', players: { min: 1, max: 1 } },
      globalVars: [
        { name: 'aid', type: 'int', init: 0, min: 0, max: 10 },
        { name: 'patronage', type: 'int', init: 0, min: 0, max: 10 },
      ],
      zones: [],
      turnStructure: { phases: [{ id: 'main' }] },
      terminal: { conditions: [] },
      setup: [
        {
          chooseN: {
            bind: '$tracks',
            options: { query: 'enums', values: ['aid', 'patronage'] },
            n: 2,
          },
        },
        {
          forEach: {
            bind: '$track',
            over: { query: 'binding', name: '$tracks' },
            effects: [
              {
                addVar: {
                  scope: 'global',
                  var: { ref: 'binding', name: '$track' },
                  delta: 2,
                },
              },
            ],
          },
        },
      ],
      actions: [],
    });

    assert.deepEqual(compiled.diagnostics.filter((diag) => diag.severity === 'error'), []);
    assert.ok(compiled.gameDef !== null);

    const ctx = makeCtx({
      def: compiled.gameDef!,
      state: {
        ...makeState(),
        globalVars: { aid: 0, patronage: 0 },
      },
      moveParams: {
        'decision:doc.setup.0.chooseN::$tracks': ['aid', 'patronage'],
      },
    });

    const result = applyEffects(compiled.gameDef!.setup, ctx);
    assert.equal(result.state.globalVars.aid, 2);
    assert.equal(result.state.globalVars.patronage, 2);
  });

  it('drives compiled distributeTokens through legalChoicesDiscover and applyMove with deterministic movement', () => {
    const compiled = compileGameSpecToGameDef({
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'effects-complex-distribute-flow', players: { min: 1, max: 1 } },
      zones: [
        { id: 'source', owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: 'left', owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: 'right', owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
      tokenTypes: [{ id: 'piece', props: {} }],
      turnStructure: { phases: [{ id: 'main' }] },
      terminal: { conditions: [] },
      actions: [
        {
          id: 'distribute',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [
            {
              distributeTokens: {
                tokens: { query: 'tokensInZone', zone: 'source' },
                destinations: { query: 'zones' },
                n: 2,
              },
            },
          ],
          limits: [],
        },
      ],
    });

    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.ok(compiled.gameDef !== null);
    if (compiled.gameDef === null) {
      return;
    }
    const def = compiled.gameDef;

    const state: GameState = {
      globalVars: {},
      perPlayerVars: {},
      zoneVars: {},
      playerCount: 1,
      zones: {
        'source:none': [
          { id: asTokenId('tok-1'), type: 'piece', props: {} },
          { id: asTokenId('tok-2'), type: 'piece', props: {} },
        ],
        'left:none': [],
        'right:none': [],
      },
      nextTokenOrdinal: 2,
      currentPhase: asPhaseId('main'),
      activePlayer: asPlayerId(0),
      turnCount: 0,
      rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [9n, 11n] },
      stateHash: 0n,
      _runningHash: 0n,
      actionUsage: {},
      turnOrderState: { type: 'roundRobin' },
      markers: {},
    };

    const template = { actionId: asActionId('distribute'), params: {} };
    const first = legalChoicesDiscover(def, state, template);
    assert.equal(first.kind, 'pending');
    if (first.kind !== 'pending') {
      return;
    }
    assert.equal(
      first.decisionKey,
      'decision:doc.actions.0.effects.0.distributeTokens.selectTokens',
    );

    const withSelected = {
      ...template,
      params: {
        'decision:doc.actions.0.effects.0.distributeTokens.selectTokens': ['tok-1', 'tok-2'],
      },
    };
    const second = legalChoicesDiscover(def, state, withSelected);
    assert.equal(second.kind, 'pending');
    if (second.kind !== 'pending') {
      return;
    }
    assert.equal(
      second.decisionKey,
      'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination[0]',
    );

    const withFirstDestination = {
      ...withSelected,
      params: {
        ...withSelected.params,
        'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination[0]':
          'left:none',
      },
    };
    const third = legalChoicesDiscover(def, state, withFirstDestination);
    assert.equal(third.kind, 'pending');
    if (third.kind !== 'pending') {
      return;
    }
    assert.equal(
      third.decisionKey,
      'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination[1]',
    );

    const applied = applyMove(def, state, {
      ...withFirstDestination,
      params: {
        ...withFirstDestination.params,
        'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination[1]':
          'right:none',
      },
    });

    assert.deepEqual(applied.state.zones['source:none'], []);
    assert.deepEqual(applied.state.zones['left:none']?.map((entry) => entry.id), [asTokenId('tok-1')]);
    assert.deepEqual(applied.state.zones['right:none']?.map((entry) => entry.id), [asTokenId('tok-2')]);
  });
});
