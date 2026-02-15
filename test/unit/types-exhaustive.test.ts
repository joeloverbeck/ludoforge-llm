import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  ConditionAST,
  EffectAST,
  MoveLog,
  OptionsQuery,
  PlayerSel,
  ScenarioDeckComposition,
  ScenarioPayload,
  ScenarioPiecePlacement,
} from '../../src/kernel/index.js';

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
  if ('setTokenProp' in effect) return 'setTokenProp';
  if ('if' in effect) return 'if';
  if ('forEach' in effect) return 'forEach';
  if ('removeByPriority' in effect) return 'removeByPriority';
  if ('let' in effect) return 'let';
  if ('chooseOne' in effect) return 'chooseOne';
  if ('chooseN' in effect) return 'chooseN';
  if ('rollRandom' in effect) return 'rollRandom';
  if ('setMarker' in effect) return 'setMarker';
  if ('shiftMarker' in effect) return 'shiftMarker';
  if ('setGlobalMarker' in effect) return 'setGlobalMarker';
  if ('flipGlobalMarker' in effect) return 'flipGlobalMarker';
  if ('shiftGlobalMarker' in effect) return 'shiftGlobalMarker';
  if ('grantFreeOperation' in effect) return 'grantFreeOperation';

  return assertNever(effect);
};

const exhaustOptionsQuery = (query: OptionsQuery): string => {
  switch (query.query) {
    case 'tokensInZone':
    case 'tokensInMapSpaces':
    case 'intsInRange':
    case 'enums':
    case 'globalMarkers':
    case 'players':
    case 'zones':
    case 'mapSpaces':
    case 'adjacentZones':
    case 'tokensInAdjacentZones':
    case 'connectedZones':
    case 'binding':
      return query.query;
    default:
      return assertNever(query);
  }
};

const exhaustConditionAST = (cond: ConditionAST): string => {
  if (typeof cond === 'boolean') return String(cond);
  switch (cond.op) {
    case 'and':
    case 'or':
    case 'not':
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
    case 'in':
    case 'adjacent':
    case 'connected':
    case 'zonePropIncludes':
      return cond.op;
    default:
      return assertNever(cond);
  }
};

describe('exhaustive kernel unions', () => {
  it('keeps the exact variant counts for key unions', () => {
    const playerSelVariants: UnionSize<PlayerSel> = 7;
    const conditionVariants: UnionSize<ConditionAST> = 10;
    const effectVariants: UnionSize<EffectAST> = 23;
    const queryVariants: UnionSize<OptionsQuery> = 12;

    assert.equal(playerSelVariants, 7);
    assert.equal(conditionVariants, 10);
    assert.equal(effectVariants, 23);
    assert.equal(queryVariants, 12);
  });

  it('ensures MoveLog includes legalMoveCount', () => {
    type HasLegalMoveCount = MoveLog extends { readonly legalMoveCount: number } ? true : false;
    const hasLegalMoveCount: HasLegalMoveCount = true;
    assert.equal(hasLegalMoveCount, true);
  });

  it('exports scenario payload interfaces with expected shape constraints', () => {
    const placement: ScenarioPiecePlacement = {
      spaceId: 'space:a',
      pieceTypeId: 'troops',
      faction: 'us',
      count: 2,
      status: { activity: 'active' },
    };

    const deckComposition: ScenarioDeckComposition = {
      pileCount: 4,
      eventsPerPile: 13,
      coupsPerPile: 3,
      includedCardIds: ['card-001'],
      excludedCardIds: ['card-130'],
    };

    const payload: ScenarioPayload = {
      mapAssetId: 'fitl-map-v1',
      pieceCatalogAssetId: 'fitl-piece-catalog-v1',
      eventDeckAssetId: 'fitl-event-cards-v1',
      scenarioName: 'Foundation',
      yearRange: '1964-1967',
      initialPlacements: [placement],
      initialTrackValues: [{ trackId: 'patronage', value: 15 }],
      initialMarkers: [{ spaceId: 'saigon', markerId: 'support', state: 'activeSupport' }],
      outOfPlay: [{ pieceTypeId: 'base', faction: 'us', count: 1 }],
      deckComposition,
      startingLeader: 'duong-van-minh',
      leaderStack: ['duong-van-minh', 'nguyen-cao-ky'],
      startingCapabilities: [{ capabilityId: 'boeing-vertol', side: 'unshaded' }],
      startingEligibility: [{ faction: 'us', eligible: true }],
      usPolicy: 'lbj',
    };

    const policy: NonNullable<ScenarioPayload['usPolicy']> = 'nixon';
    assert.equal(policy, 'nixon');
    assert.equal(payload.deckComposition?.pileCount, 4);

    const readonlyGuard = (scenario: ScenarioPayload): void => {
      // @ts-expect-error ScenarioPayload fields are readonly.
      scenario.mapAssetId = 'another-map';
    };
    void readonlyGuard;

    const deckShapeGuard = (deck: ScenarioDeckComposition): void => {
      // @ts-expect-error leaderStack belongs on ScenarioPayload, not ScenarioDeckComposition.
      void deck.leaderStack;
    };
    void deckShapeGuard;
  });

  it('keeps exhaustive checks type-safe', () => {
    void exhaustPlayerSel('actor');
    void exhaustEffectAST({
      setVar: { scope: 'global', var: 'x', value: 1 },
    });
    void exhaustConditionAST({ op: 'adjacent', left: 'zone:a', right: 'zone:b' });
    void exhaustOptionsQuery({ query: 'players' });
  });
});
