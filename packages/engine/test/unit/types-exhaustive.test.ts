import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  appendActionPipelineConditionSurfacePath,
  appendEffectConditionSurfacePath,
  appendQueryConditionSurfacePath,
  appendValueExprConditionSurfacePath,
  CONDITION_SURFACE_SUFFIX,
} from '../../src/contracts/index.js';
import type {
  ActionPipelineConditionSurfaceSuffix,
  EffectConditionSurfaceSuffix,
  QueryConditionSurfaceSuffix,
  ValueExprConditionSurfaceSuffix,
} from '../../src/contracts/index.js';
import type {
  AssetRowPredicate,
  ConditionAST,
  ExecutionOptions,
  EffectAST,
  MoveLog,
  OptionsQuery,
  PlayerSel,
  ScenarioDeckComposition,
  ScenarioPayload,
  ScenarioPiecePlacement,
  TokenFilterPredicate,
} from '../../src/kernel/index.js';
import type { PredicateOp } from '../../src/contracts/index.js';
import { LEAF_OPTIONS_QUERY_TRANSFORM_CONTRACT_MAP, OPTIONS_QUERY_KIND_CONTRACT_MAP } from '../../src/kernel/query-kind-map.js';
import type {
  LeafOptionsQueryKindFromContractMap,
  LeafOptionsQueryTransformKind,
  QueryTransformBooleanOptionPolicy,
} from '../../src/kernel/query-kind-map.js';
import type {
  LeafOptionsQuery,
  LeafOptionsQueryKind,
  OptionsQueryKindPartitionCoverage,
  RecursiveOptionsQuery,
  RecursiveOptionsQueryKind,
  RecursiveOptionsQueryKindCoverage,
} from '../../src/kernel/query-partition-types.js';
import type { RecursiveOptionsQueryDispatchCoverage } from '../../src/kernel/query-walk.js';
import type { SimulationOptions } from '../../src/sim/index.js';
import { eff } from '../helpers/effect-tag-helper.js';

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
  if ('setActivePlayer' in effect) return 'setActivePlayer';
  if ('addVar' in effect) return 'addVar';
  if ('transferVar' in effect) return 'transferVar';
  if ('moveToken' in effect) return 'moveToken';
  if ('moveAll' in effect) return 'moveAll';
  if ('moveTokenAdjacent' in effect) return 'moveTokenAdjacent';
  if ('draw' in effect) return 'draw';
  if ('reveal' in effect) return 'reveal';
  if ('conceal' in effect) return 'conceal';
  if ('shuffle' in effect) return 'shuffle';
  if ('createToken' in effect) return 'createToken';
  if ('destroyToken' in effect) return 'destroyToken';
  if ('setTokenProp' in effect) return 'setTokenProp';
  if ('if' in effect) return 'if';
  if ('forEach' in effect) return 'forEach';
  if ('reduce' in effect) return 'reduce';
  if ('removeByPriority' in effect) return 'removeByPriority';
  if ('let' in effect) return 'let';
  if ('bindValue' in effect) return 'bindValue';
  if ('evaluateSubset' in effect) return 'evaluateSubset';
  if ('chooseOne' in effect) return 'chooseOne';
  if ('chooseN' in effect) return 'chooseN';
  if ('rollRandom' in effect) return 'rollRandom';
  if ('setMarker' in effect) return 'setMarker';
  if ('shiftMarker' in effect) return 'shiftMarker';
  if ('setGlobalMarker' in effect) return 'setGlobalMarker';
  if ('flipGlobalMarker' in effect) return 'flipGlobalMarker';
  if ('shiftGlobalMarker' in effect) return 'shiftGlobalMarker';
  if ('grantFreeOperation' in effect) return 'grantFreeOperation';
  if ('gotoPhaseExact' in effect) return 'gotoPhaseExact';
  if ('advancePhase' in effect) return 'advancePhase';
  if ('pushInterruptPhase' in effect) return 'pushInterruptPhase';
  if ('popInterruptPhase' in effect) return 'popInterruptPhase';

  return assertNever(effect);
};

const exhaustOptionsQuery = (query: OptionsQuery): string => {
  switch (query.query) {
    case 'concat':
    case 'prioritized':
    case 'tokenZones':
    case 'tokensInZone':
    case 'assetRows':
    case 'tokensInMapSpaces':
    case 'nextInOrderByCondition':
    case 'intsInRange':
    case 'intsInVarRange':
    case 'enums':
    case 'globalMarkers':
    case 'players':
    case 'zones':
    case 'mapSpaces':
    case 'adjacentZones':
    case 'tokensInAdjacentZones':
    case 'connectedZones':
    case 'binding':
    case 'grantContext':
    case 'capturedSequenceZones':
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
    case 'markerStateAllowed':
    case 'markerShiftAllowed':
      return cond.op;
    default:
      return assertNever(cond);
  }
};

describe('exhaustive kernel unions', () => {
  it('keeps the exact variant counts for key unions', () => {
    const playerSelVariants: UnionSize<PlayerSel> = 7;
    const conditionVariants: UnionSize<ConditionAST> = 12;
    const effectVariants: UnionSize<EffectAST> = 34;
    const queryVariants: UnionSize<OptionsQuery> = 20;
    const recursiveQueryVariants: UnionSize<RecursiveOptionsQuery> = 3;
    const leafQueryVariants: UnionSize<LeafOptionsQuery> = 17;

    assert.equal(playerSelVariants, 7);
    assert.equal(conditionVariants, 12);
    assert.equal(effectVariants, 34);
    assert.equal(queryVariants, 20);
    assert.equal(recursiveQueryVariants, 3);
    assert.equal(leafQueryVariants, 17);
  });

  it('keeps recursive and leaf OptionsQuery kind partitions aligned', () => {
    type ContractMapCoverage = [
      Exclude<keyof typeof OPTIONS_QUERY_KIND_CONTRACT_MAP, OptionsQuery['query']>,
      Exclude<OptionsQuery['query'], keyof typeof OPTIONS_QUERY_KIND_CONTRACT_MAP>,
    ] extends [never, never]
      ? true
      : false;
    type LeafContractViewCoverage = [
      Exclude<LeafOptionsQueryKindFromContractMap, LeafOptionsQueryKind>,
      Exclude<LeafOptionsQueryKind, LeafOptionsQueryKindFromContractMap>,
    ] extends [never, never]
      ? true
      : false;
    type TransformContractCoverage = [
      Exclude<keyof typeof LEAF_OPTIONS_QUERY_TRANSFORM_CONTRACT_MAP, LeafOptionsQueryTransformKind>,
      Exclude<LeafOptionsQueryTransformKind, keyof typeof LEAF_OPTIONS_QUERY_TRANSFORM_CONTRACT_MAP>,
    ] extends [never, never]
      ? true
      : false;
    type TransformKindsAreLeafKinds = Exclude<LeafOptionsQueryTransformKind, LeafOptionsQueryKind> extends never
      ? true
      : false;
    type TransformBooleanOptionFieldCoverage = {
      readonly [Kind in LeafOptionsQueryTransformKind]: (
        typeof LEAF_OPTIONS_QUERY_TRANSFORM_CONTRACT_MAP
      )[Kind]['optionalBooleanOptions'] extends readonly QueryTransformBooleanOptionPolicy<Kind>[]
        ? true
        : false;
    }[LeafOptionsQueryTransformKind] extends true
      ? true
      : false;
    const recursiveKinds: UnionSize<RecursiveOptionsQueryKind> = 3;
    const leafKinds: UnionSize<LeafOptionsQueryKind> = 17;
    const leafContractKinds: UnionSize<LeafOptionsQueryKindFromContractMap> = 17;
    const transformKinds: UnionSize<LeafOptionsQueryTransformKind> = 1;
    const contractMapCoverage: ContractMapCoverage = true;
    const leafContractViewCoverage: LeafContractViewCoverage = true;
    const transformContractCoverage: TransformContractCoverage = true;
    const transformKindsAreLeafKinds: TransformKindsAreLeafKinds = true;
    const transformBooleanOptionFieldCoverage: TransformBooleanOptionFieldCoverage = true;
    const partitionCoverage: OptionsQueryKindPartitionCoverage = true;
    const recursiveCoverage: RecursiveOptionsQueryKindCoverage = true;
    const recursiveDispatchCoverage: RecursiveOptionsQueryDispatchCoverage = true;
    type Overlap = Extract<LeafOptionsQuery, RecursiveOptionsQuery>;
    const overlapVariants: UnionSize<Overlap> = 0;

    assert.equal(recursiveKinds, 3);
    assert.equal(leafKinds, 17);
    assert.equal(leafContractKinds, 17);
    assert.equal(transformKinds, 1);
    assert.equal(contractMapCoverage, true);
    assert.equal(leafContractViewCoverage, true);
    assert.equal(transformContractCoverage, true);
    assert.equal(transformKindsAreLeafKinds, true);
    assert.equal(transformBooleanOptionFieldCoverage, true);
    assert.equal(partitionCoverage, true);
    assert.equal(recursiveCoverage, true);
    assert.equal(recursiveDispatchCoverage, true);
    assert.equal(overlapVariants, 0);
  });

  it('keeps predicate operator contracts aligned across AST surfaces', () => {
    type TokenFilterOpCoverage = [Exclude<TokenFilterPredicate['op'], PredicateOp>, Exclude<PredicateOp, TokenFilterPredicate['op']>] extends
      [never, never]
      ? true
      : false;
    type AssetRowOpCoverage = [Exclude<AssetRowPredicate['op'], PredicateOp>, Exclude<PredicateOp, AssetRowPredicate['op']>] extends
      [never, never]
      ? true
      : false;

    const tokenFilterOpCoverage: TokenFilterOpCoverage = true;
    const assetRowOpCoverage: AssetRowOpCoverage = true;

    assert.equal(tokenFilterOpCoverage, true);
    assert.equal(assetRowOpCoverage, true);
  });

  it('ensures MoveLog includes legalMoveCount', () => {
    type HasLegalMoveCount = MoveLog extends { readonly legalMoveCount: number } ? true : false;
    const hasLegalMoveCount: HasLegalMoveCount = true;
    assert.equal(hasLegalMoveCount, true);
  });

  it('keeps snapshot trace contracts wired into shared types', () => {
    // snapshotDepth must NOT be on ExecutionOptions (sim-only concern moved to SimulationOptions)
    type KernelLacksSnapshotDepth = ExecutionOptions extends { readonly snapshotDepth?: unknown } ? false : true;
    type SimHasSnapshotDepth = SimulationOptions extends { readonly snapshotDepth?: 'none' | 'minimal' | 'standard' | 'verbose' } ? true : false;
    type HasSnapshot = MoveLog extends { readonly snapshot?: { readonly turnCount: number } } ? true : false;

    const kernelLacksSnapshotDepth: KernelLacksSnapshotDepth = true;
    const simHasSnapshotDepth: SimHasSnapshotDepth = true;
    const hasSnapshot: HasSnapshot = true;

    assert.equal(kernelLacksSnapshotDepth, true);
    assert.equal(simHasSnapshotDepth, true);
    assert.equal(hasSnapshot, true);
  });

  it('exports scenario payload interfaces with expected shape constraints', () => {
    const placement: ScenarioPiecePlacement = {
      spaceId: 'space:a',
      pieceTypeId: 'troops',
      seat: 'us',
      count: 2,
      status: { activity: 'active' },
    };

    const deckComposition: ScenarioDeckComposition = {
      materializationStrategy: 'pile-coup-mix-v1',
      pileCount: 4,
      eventsPerPile: 13,
      coupsPerPile: 3,
      includedCardIds: ['card-001'],
      excludedCardIds: ['card-130'],
      includedCardTags: ['pivotal'],
      excludedCardTags: ['coup'],
      pileFilters: [{ piles: [1, 2], metadataEquals: { period: '1965' } }],
    };

    const payload: ScenarioPayload = {
      mapAssetId: 'fitl-map-v1',
      pieceCatalogAssetId: 'fitl-piece-catalog-v1',
      eventDeckAssetId: 'fitl-event-cards-v1',
      scenarioName: 'Foundation',
      yearRange: '1964-1967',
      initialPlacements: [placement],
      initializations: [
        { trackId: 'patronage', value: 15 },
        { var: 'leaderBoxCardCount', value: 2 },
        { markerId: 'activeLeader', state: 'youngTurks' },
        { spaceId: 'saigon', markerId: 'support', state: 'activeSupport' },
      ],
      outOfPlay: [{ pieceTypeId: 'base', seat: 'us', count: 1 }],
      deckComposition,
    };

    assert.equal(payload.deckComposition?.pileCount, 4);

    const readonlyGuard = (scenario: ScenarioPayload): void => {
      // @ts-expect-error ScenarioPayload fields are readonly.
      scenario.mapAssetId = 'another-map';
    };
    void readonlyGuard;

    const deckShapeGuard = (deck: ScenarioDeckComposition): void => {
      // @ts-expect-error initializations belongs on ScenarioPayload, not ScenarioDeckComposition.
      void deck.initializations;
    };
    void deckShapeGuard;
  });

  it('keeps exhaustive checks type-safe', () => {
    void exhaustPlayerSel('actor');
    void exhaustEffectAST(eff({
      setVar: { scope: 'global', var: 'x', value: 1 },
    }));
    void exhaustConditionAST({ op: 'adjacent', left: 'zone:a', right: 'zone:b' });
    void exhaustOptionsQuery({ query: 'players' });
  });

  it('keeps condition-surface helper families type-isolated', () => {
    const valueExprPath = appendValueExprConditionSurfacePath('actions[0].effects[0]', CONDITION_SURFACE_SUFFIX.valueExpr.ifWhen);
    const queryPath = appendQueryConditionSurfacePath('actions[0].params[0].domain', CONDITION_SURFACE_SUFFIX.query.where);
    const effectPath = appendEffectConditionSurfacePath('actions[0].effects[0]', CONDITION_SURFACE_SUFFIX.effect.moveAllFilter);
    const actionPipelinePath = appendActionPipelineConditionSurfacePath(
      'actionPipelines[0]',
      CONDITION_SURFACE_SUFFIX.actionPipeline.targetingFilter,
    );
    assert.equal(valueExprPath, 'actions[0].effects[0].if.when');
    assert.equal(queryPath, 'actions[0].params[0].domain.where');
    assert.equal(effectPath, 'actions[0].effects[0].moveAll.filter');
    assert.equal(actionPipelinePath, 'actionPipelines[0].targeting.filter');

    const valueExprSuffix: ValueExprConditionSurfaceSuffix = CONDITION_SURFACE_SUFFIX.valueExpr.ifWhen;
    const querySuffix: QueryConditionSurfaceSuffix = CONDITION_SURFACE_SUFFIX.query.via;
    const effectSuffix: EffectConditionSurfaceSuffix = CONDITION_SURFACE_SUFFIX.effect.ifWhen;
    const actionPipelineSuffix: ActionPipelineConditionSurfaceSuffix =
      CONDITION_SURFACE_SUFFIX.actionPipeline.legality;

    void valueExprSuffix;
    void querySuffix;
    void effectSuffix;
    void actionPipelineSuffix;

    // @ts-expect-error query suffix must not be accepted by valueExpr helper.
    void appendValueExprConditionSurfacePath('actions[0].params[0].domain', CONDITION_SURFACE_SUFFIX.query.where);
    // @ts-expect-error effect suffix must not be accepted by query helper.
    void appendQueryConditionSurfacePath('actions[0].effects[0]', CONDITION_SURFACE_SUFFIX.effect.moveAllFilter);
    // @ts-expect-error actionPipeline suffix must not be accepted by effect helper.
    void appendEffectConditionSurfacePath('actions[0].effects[0]', CONDITION_SURFACE_SUFFIX.actionPipeline.applicability);
    // @ts-expect-error valueExpr suffix must not be accepted by actionPipeline helper.
    void appendActionPipelineConditionSurfacePath('actionPipelines[0]', CONDITION_SURFACE_SUFFIX.valueExpr.ifWhen);
  });
});
