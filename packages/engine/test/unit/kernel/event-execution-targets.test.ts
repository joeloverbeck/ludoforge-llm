import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  resolveEventEffectList,
  resolveEventTargetDefs,
  synthesizeEventTargetEffects,
  type EventCardDef,
  type EventTargetDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';

const makeBaseDef = (card: EventCardDef): GameDef =>
  ({
    metadata: { id: 'event-target-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('draw:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [
      {
        id: 'deck',
        drawZone: 'draw:none',
        discardZone: 'discard:none',
        cards: [card],
      },
    ],
  }) as unknown as GameDef;

const makeBaseState = (cardId: string): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  markers: {},
  playerCount: 2,
  zones: {
    'draw:none': [],
    'discard:none': [{ id: asTokenId(cardId), type: 'card', props: {} }],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
});

describe('event target synthesis', () => {
  it('maps exact n=1 to chooseOne', () => {
    const targets: readonly EventTargetDef[] = [
      {
        id: '$targetCity',
        selector: { query: 'enums', values: ['saigon:none', 'hue:none'] },
        cardinality: { n: 1 },
      },
    ];

    const effects = synthesizeEventTargetEffects(targets);
    assert.equal(effects.length, 1);
    assert.ok('chooseOne' in effects[0]!);
    if (!('chooseOne' in effects[0]!)) {
      return;
    }
    assert.equal(effects[0].chooseOne.bind, '$targetCity');
    assert.deepEqual(effects[0].chooseOne.options, { query: 'enums', values: ['saigon:none', 'hue:none'] });
  });

  it('maps exact n>1 to chooseN with exact n', () => {
    const targets: readonly EventTargetDef[] = [
      {
        id: '$targets',
        selector: { query: 'enums', values: ['a', 'b', 'c'] },
        cardinality: { n: 2 },
      },
    ];

    const effects = synthesizeEventTargetEffects(targets);
    assert.equal(effects.length, 1);
    assert.ok('chooseN' in effects[0]!);
    if (!('chooseN' in effects[0]!)) {
      return;
    }
    assert.equal(effects[0].chooseN.bind, '$targets');
    assert.equal(effects[0].chooseN.n, 2);
  });

  it('maps range min/max to choice effects, using chooseOne for max=1', () => {
    const targets: readonly EventTargetDef[] = [
      {
        id: '$optionalSingle',
        selector: { query: 'enums', values: ['x'] },
        cardinality: { max: 1 },
      },
      {
        id: '$range',
        selector: { query: 'enums', values: ['x', 'y', 'z'] },
        cardinality: { min: 1, max: 2 },
      },
    ];

    const effects = synthesizeEventTargetEffects(targets);
    assert.equal(effects.length, 2);

    assert.ok('chooseOne' in effects[0]!);
    if (!('chooseOne' in effects[0]!)) {
      return;
    }
    assert.equal(effects[0].chooseOne.bind, '$optionalSingle');

    assert.ok('chooseN' in effects[1]!);
    if (!('chooseN' in effects[1]!)) {
      return;
    }
    assert.equal(effects[1].chooseN.bind, '$range');
    assert.equal(effects[1].chooseN.min, 1);
    assert.equal(effects[1].chooseN.max, 2);
  });

  it('returns an empty list when no targets are provided', () => {
    assert.deepEqual(synthesizeEventTargetEffects([]), []);
  });
});

describe('event target resolution and effect ordering', () => {
  it('collects side targets before branch targets', () => {
    const side: NonNullable<EventCardDef['unshaded']> = {
      targets: [
        { id: '$sideA', selector: { query: 'enums', values: ['a'] }, cardinality: { n: 1 } },
        { id: '$sideB', selector: { query: 'enums', values: ['b'] }, cardinality: { n: 1 } },
      ],
      effects: [],
      branches: [
        {
          id: 'branch',
          targets: [{ id: '$branchA', selector: { query: 'enums', values: ['c'] }, cardinality: { n: 1 } }],
        },
      ],
    };

    const branch = side.branches?.[0] ?? null;
    const ids = resolveEventTargetDefs(side, branch).map((target) => target.id);
    assert.deepEqual(ids, ['$sideA', '$sideB', '$branchA']);
  });

  it('prepends synthetic target effects before side and branch effects', () => {
    const card: EventCardDef = {
      id: 'card-1',
      title: 'Targeted event',
      sideMode: 'single',
      unshaded: {
        targets: [{ id: '$sideTarget', selector: { query: 'enums', values: ['saigon:none'] }, cardinality: { n: 1 } }],
        effects: [{ addVar: { scope: 'global', var: 'sideCounter', delta: 1 } }],
        branches: [
          {
            id: 'branch-a',
            targets: [{ id: '$branchTarget', selector: { query: 'enums', values: ['hue:none'] }, cardinality: { max: 1 } }],
            effects: [{ addVar: { scope: 'global', var: 'branchCounter', delta: 1 } }],
          },
        ],
      },
    };

    const def = makeBaseDef(card);
    const state = makeBaseState(card.id);
    const move: Move = {
      actionId: 'event' as Move['actionId'],
      params: {
        eventCardId: card.id,
        side: 'unshaded',
        branch: 'branch-a',
      },
    };

    const effects = resolveEventEffectList(def, state, move);
    assert.deepEqual(
      effects.map((effect) => Object.keys(effect)[0]),
      ['chooseOne', 'chooseOne', 'addVar', 'addVar'],
    );

    assert.ok('chooseOne' in effects[0]!);
    assert.ok('chooseOne' in effects[1]!);
    if (!('chooseOne' in effects[0]!) || !('chooseOne' in effects[1]!)) {
      return;
    }

    assert.equal(effects[0].chooseOne.bind, '$sideTarget');
    assert.equal(effects[1].chooseOne.bind, '$branchTarget');
  });
});
