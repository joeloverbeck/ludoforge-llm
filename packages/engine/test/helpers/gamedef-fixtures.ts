import type { EffectAST, GameDef } from '../../src/kernel/index.js';
import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';
import { readFixtureJson } from './fixture-reader.js';
import { tagValueExprs } from './tag-value-exprs.js';

/**
 * Casts an untyped GameDef-shaped object to GameDef, adding `_t` type-tag
 * discriminants to any inline ValueExpr objects and `_k` kind-tag
 * discriminants to any inline EffectAST objects. Use this instead of bare
 * `as unknown as GameDef` in tests to ensure runtime dispatch works.
 */
export const asTaggedGameDef = (obj: unknown): GameDef => tagEffectAsts(tagValueExprs(obj)) as GameDef;

export const readGameDefFixture = (fixtureName: string): GameDef => tagEffectAsts(readFixtureJson<GameDef>(`gamedef/${fixtureName}`)) as GameDef;

export const createValidGameDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'test-game', players: { min: 2, max: 4 } },
    constants: {},
    globalVars: [{ name: 'money', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 100 }],
    zones: [
      { id: 'market:none', zoneKind: 'aux', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'card', props: {} }],
    markerLattices: [
      {
        id: 'supportOpposition',
        states: ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
        defaultState: 'neutral',
      },
    ],
    setup: [{ shuffle: { zone: 'deck:none' } }],
    turnStructure: {
      phases: [{ id: 'main' }],
    },
    actions: [
      {
        id: 'playCard',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [{ name: '$n', domain: { query: 'intsInRange', min: 0, max: 3 } }],
        pre: null,
        cost: [],
        effects: [{ draw: { from: 'deck:none', to: 'market:none', count: 1 } }],
        limits: [],
      },
    ],
    triggers: [{ id: 'onPlay', event: { type: 'actionResolved', action: 'playCard' }, effects: [] }],
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
  });

export const withSingleActionEffect = (effect: EffectAST | unknown): GameDef => {
  const base = createValidGameDef();
  return {
    ...base,
    actions: [
      {
        ...base.actions[0],
        effects: [tagEffectAsts(effect)],
      },
    ],
  } as unknown as GameDef;
};
