import type { SupportedEffectKind } from './effect-kind-registry.js';

export type BinderPathSegment = string | '*';
export type BinderPath = readonly BinderPathSegment[];

export interface SequentialBindingScopeDefinition {
  readonly nestedEffectsPath: BinderPath;
  readonly excludedBinderPaths: readonly BinderPath[];
}

export interface BinderSurfacePaths {
  readonly declaredBinderPaths: readonly BinderPath[];
  readonly bindingNameReferencerPaths: readonly BinderPath[];
  readonly bindingTemplateReferencerPaths: readonly BinderPath[];
  readonly zoneSelectorReferencerPaths: readonly BinderPath[];
}

export interface EffectBinderSurfaceDefinition extends BinderSurfacePaths {
  readonly sequentiallyVisibleBinderPaths: readonly BinderPath[];
  readonly nestedSequentialBindingScopes?: readonly SequentialBindingScopeDefinition[];
}

export type NonEffectBinderSurfaceMatchCondition =
  | { readonly kind: 'equals'; readonly key: string; readonly value: string }
  | { readonly kind: 'oneOf'; readonly key: string; readonly values: readonly string[] }
  | { readonly kind: 'record'; readonly key: string };

export interface NonEffectBinderSurfaceDefinition extends BinderSurfacePaths {
  readonly id: string;
  readonly matchAll: readonly NonEffectBinderSurfaceMatchCondition[];
}

const NO_BINDER_PATHS: readonly BinderPath[] = [];
const NO_REFERENCER_PATHS: readonly BinderPath[] = [];
const BINDING_NAME_PATH: readonly BinderPath[] = [['name']];
const AGGREGATE_BIND_PATH: readonly BinderPath[] = [['aggregate', 'bind']];
const PLAYER_CHOSEN_PATH: readonly BinderPath[] = [['player', 'chosen']];
const FILTER_OWNER_CHOSEN_PATH: readonly BinderPath[] = [['filter', 'owner', 'chosen']];
const SPACE_FILTER_OWNER_CHOSEN_PATH: readonly BinderPath[] = [['spaceFilter', 'owner', 'chosen']];
const ZONE_PATH: readonly BinderPath[] = [['zone']];
const SPACE_PATH: readonly BinderPath[] = [['space']];
const TOKEN_PATH: readonly BinderPath[] = [['token']];
const LEFT_RIGHT_PATHS: readonly BinderPath[] = [['left'], ['right']];
const FROM_TO_PATHS: readonly BinderPath[] = [['from'], ['to']];

export const EFFECT_BINDER_SURFACE_CONTRACT: Readonly<Record<SupportedEffectKind, EffectBinderSurfaceDefinition>> = {
  setVar: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['player', 'chosen']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  setActivePlayer: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['player', 'chosen']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  addVar: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['player', 'chosen']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  commitResource: {
    declaredBinderPaths: [['actualBind']],
    sequentiallyVisibleBinderPaths: [['actualBind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['from', 'player', 'chosen'], ['to', 'player', 'chosen']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  moveToken: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['token']],
    zoneSelectorReferencerPaths: [['from'], ['to']],
  },
  moveAll: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['from'], ['to']],
  },
  moveTokenAdjacent: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['token'], ['direction']],
    zoneSelectorReferencerPaths: [['from']],
  },
  draw: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['from'], ['to']],
  },
  reveal: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['to', 'chosen']],
    zoneSelectorReferencerPaths: [['zone']],
  },
  shuffle: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['zone']],
  },
  createToken: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['zone']],
  },
  destroyToken: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['token']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  setTokenProp: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['token']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  if: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  forEach: {
    declaredBinderPaths: [['bind'], ['countBind']],
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  reduce: {
    declaredBinderPaths: [['itemBind'], ['accBind'], ['resultBind']],
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    nestedSequentialBindingScopes: [{ nestedEffectsPath: ['in'], excludedBinderPaths: [['resultBind']] }],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  removeByPriority: {
    declaredBinderPaths: [['groups', '*', 'bind'], ['groups', '*', 'countBind'], ['remainingBind']],
    sequentiallyVisibleBinderPaths: [['groups', '*', 'countBind'], ['remainingBind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['groups', '*', 'to'], ['groups', '*', 'from']],
  },
  let: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    nestedSequentialBindingScopes: [{ nestedEffectsPath: ['in'], excludedBinderPaths: [['bind']] }],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  bindValue: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  evaluateSubset: {
    declaredBinderPaths: [['subsetBind'], ['resultBind'], ['bestSubsetBind']],
    sequentiallyVisibleBinderPaths: [['resultBind'], ['bestSubsetBind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  chooseOne: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  chooseN: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  rollRandom: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  setMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['space']],
  },
  shiftMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['space']],
  },
  setGlobalMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  flipGlobalMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  shiftGlobalMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  grantFreeOperation: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  gotoPhaseExact: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  advancePhase: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  pushInterruptPhase: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  popInterruptPhase: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
};

export const NON_EFFECT_BINDER_SURFACE_CONTRACT: readonly NonEffectBinderSurfaceDefinition[] = [
  {
    id: 'ref.binding',
    matchAll: [{ kind: 'equals', key: 'ref', value: 'binding' }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: BINDING_NAME_PATH,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    id: 'query.binding',
    matchAll: [{ kind: 'equals', key: 'query', value: 'binding' }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: BINDING_NAME_PATH,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    id: 'aggregate.bind',
    matchAll: [{ kind: 'record', key: 'aggregate' }],
    declaredBinderPaths: AGGREGATE_BIND_PATH,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    id: 'ref.tokenProp|tokenZone',
    matchAll: [{ kind: 'oneOf', key: 'ref', values: ['tokenProp', 'tokenZone'] }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: TOKEN_PATH,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    id: 'ref.assetField',
    matchAll: [{ kind: 'equals', key: 'ref', value: 'assetField' }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['row']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    id: 'ref.pvar.player.chosen',
    matchAll: [
      { kind: 'equals', key: 'ref', value: 'pvar' },
      { kind: 'record', key: 'player' },
    ],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: PLAYER_CHOSEN_PATH,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    id: 'ref.zoneCount|zoneProp',
    matchAll: [{ kind: 'oneOf', key: 'ref', values: ['zoneCount', 'zoneProp'] }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: ZONE_PATH,
  },
  {
    id: 'ref.markerState',
    matchAll: [{ kind: 'equals', key: 'ref', value: 'markerState' }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: SPACE_PATH,
  },
  {
    id: 'query.tokensInZone|tokensInAdjacentZones|adjacentZones|connectedZones',
    matchAll: [{ kind: 'oneOf', key: 'query', values: ['tokensInZone', 'tokensInAdjacentZones', 'adjacentZones', 'connectedZones'] }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: ZONE_PATH,
  },
  {
    id: 'query.zones|mapSpaces.filter.owner.chosen',
    matchAll: [{ kind: 'oneOf', key: 'query', values: ['zones', 'mapSpaces'] }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: FILTER_OWNER_CHOSEN_PATH,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    id: 'query.tokensInMapSpaces.spaceFilter.owner.chosen',
    matchAll: [{ kind: 'equals', key: 'query', value: 'tokensInMapSpaces' }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: SPACE_FILTER_OWNER_CHOSEN_PATH,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    id: 'op.adjacent',
    matchAll: [{ kind: 'equals', key: 'op', value: 'adjacent' }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: LEFT_RIGHT_PATHS,
  },
  {
    id: 'op.connected',
    matchAll: [{ kind: 'equals', key: 'op', value: 'connected' }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: FROM_TO_PATHS,
  },
  {
    id: 'op.zonePropIncludes',
    matchAll: [{ kind: 'equals', key: 'op', value: 'zonePropIncludes' }],
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: ZONE_PATH,
  },
];
