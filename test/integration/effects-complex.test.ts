import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  nextInt,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';

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
  endConditions: [],
});

const makeState = (): GameState => ({
  globalVars: { score: 0, count: 0 },
  perPlayerVars: {},
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
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
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
        $zoneChoice: 'discard:none',
        $tags: ['alpha', 'beta'],
        $label: 'spawned',
      },
      bindings: {
        $move: asTokenId('d1'),
        $destroy: asTokenId('h1'),
      },
    });

    const effects: readonly EffectAST[] = [
      { chooseOne: { bind: '$zoneChoice', options: { query: 'enums', values: ['deck:none', 'discard:none'] } } },
      { chooseN: { bind: '$tags', options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] }, n: 2 } },
      {
        let: {
          bind: '$base',
          value: 2,
          in: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: '$base' } } }],
        },
      },
      {
        forEach: {
          bind: '$n',
          over: { query: 'intsInRange', min: 1, max: 3 },
          limit: 2,
          effects: [
            {
              if: {
                when: { op: '>', left: { ref: 'binding', name: '$n' }, right: 1 },
                then: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: '$n' } } }],
                else: [{ addVar: { scope: 'global', var: 'score', delta: 5 } }],
              },
            },
          ],
        },
      },
      { moveToken: { token: '$move', from: 'deck:none', to: 'discard:none', position: 'bottom' } },
      { shuffle: { zone: 'discard:none' } },
      { createToken: { type: 'card', zone: 'hand:0', props: { rank: 9, label: { ref: 'binding', name: '$label' } } } },
      { destroyToken: { token: '$destroy' } },
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
      {
        let: {
          bind: '$bonus',
          value: 3,
          in: [
            {
              forEach: {
                bind: '$n',
                over: { query: 'intsInRange', min: 1, max: 4 },
                effects: [
                  {
                    if: {
                      when: { op: '>', left: { ref: 'binding', name: '$n' }, right: 2 },
                      then: [
                        {
                          addVar: {
                            scope: 'global',
                            var: 'count',
                            delta: { op: '+', left: { ref: 'binding', name: '$n' }, right: { ref: 'binding', name: '$bonus' } },
                          },
                        },
                      ],
                      else: [{ addVar: { scope: 'global', var: 'count', delta: 1 } }],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ];

    const result = applyEffects(effects, ctx);

    assert.equal(result.state.globalVars.count, 15);
    assert.deepEqual(result.state.zones, ctx.state.zones);
    assert.equal(result.rng, ctx.rng);
  });
});
