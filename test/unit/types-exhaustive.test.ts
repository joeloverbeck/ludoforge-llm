import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { EffectAST, MoveLog, OptionsQuery, PlayerSel } from '../../src/kernel/index.js';

type UnionToIntersection<T> = (
  T extends unknown ? (arg: T) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

type LastOfUnion<T> = UnionToIntersection<T extends unknown ? (value: T) => void : never> extends (
  value: infer L,
) => void
  ? L
  : never;

type UnionToTuple<T, Last = LastOfUnion<T>> = [T] extends [never]
  ? []
  : [...UnionToTuple<Exclude<T, Last>>, Last];

type UnionSize<T> = UnionToTuple<T>['length'];

const assertNever = (_value: never): never => {
  throw new Error('Unexpected variant');
};

const exhaustPlayerSel = (sel: PlayerSel): string => {
  if (typeof sel === 'string') {
    switch (sel) {
      case 'actor':
      case 'active':
      case 'all':
      case 'allOther':
        return sel;
      default:
        return assertNever(sel);
    }
  }

  if ('id' in sel) {
    return 'id';
  }
  if ('chosen' in sel) {
    return 'chosen';
  }
  if ('relative' in sel) {
    return 'relative';
  }

  return assertNever(sel);
};

const exhaustEffectAST = (effect: EffectAST): string => {
  if ('setVar' in effect) return 'setVar';
  if ('addVar' in effect) return 'addVar';
  if ('moveToken' in effect) return 'moveToken';
  if ('moveAll' in effect) return 'moveAll';
  if ('moveTokenAdjacent' in effect) return 'moveTokenAdjacent';
  if ('draw' in effect) return 'draw';
  if ('shuffle' in effect) return 'shuffle';
  if ('createToken' in effect) return 'createToken';
  if ('destroyToken' in effect) return 'destroyToken';
  if ('if' in effect) return 'if';
  if ('forEach' in effect) return 'forEach';
  if ('let' in effect) return 'let';
  if ('chooseOne' in effect) return 'chooseOne';
  if ('chooseN' in effect) return 'chooseN';

  return assertNever(effect);
};

const exhaustOptionsQuery = (query: OptionsQuery): string => {
  switch (query.query) {
    case 'tokensInZone':
    case 'intsInRange':
    case 'enums':
    case 'players':
    case 'zones':
    case 'adjacentZones':
    case 'tokensInAdjacentZones':
    case 'connectedZones':
      return query.query;
    default:
      return assertNever(query);
  }
};

describe('exhaustive kernel unions', () => {
  it('keeps the exact variant counts for key unions', () => {
    const playerSelVariants: UnionSize<PlayerSel> = 7;
    const effectVariants: UnionSize<EffectAST> = 14;
    const queryVariants: UnionSize<OptionsQuery> = 8;

    assert.equal(playerSelVariants, 7);
    assert.equal(effectVariants, 14);
    assert.equal(queryVariants, 8);
  });

  it('ensures MoveLog includes legalMoveCount', () => {
    type HasLegalMoveCount = MoveLog extends { readonly legalMoveCount: number } ? true : false;
    const hasLegalMoveCount: HasLegalMoveCount = true;
    assert.equal(hasLegalMoveCount, true);
  });

  it('keeps exhaustive checks type-safe', () => {
    void exhaustPlayerSel('actor');
    void exhaustEffectAST({
      setVar: { scope: 'global', var: 'x', value: 1 },
    });
    void exhaustOptionsQuery({ query: 'players' });
  });
});
