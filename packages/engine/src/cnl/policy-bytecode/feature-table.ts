import type { EncodedStateLayout } from '../../kernel/encoded-state/index.js';
import type {
  AgentPolicyTokenFilter,
  AgentPolicyZoneFilter,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  CompiledPolicyZoneSource,
  GameDef,
} from '../../kernel/types.js';
import type { FeatureRef, FeatureTable } from './types.js';

const DYNAMIC_LAYOUT_INDEX = 0;

type FeatureAggOp = Extract<CompiledPolicyExpr, { readonly kind: 'globalTokenAgg' }>['aggOp'];
type FeatureZoneScope = Extract<CompiledPolicyExpr, { readonly kind: 'globalTokenAgg' }>['zoneScope'];

const AGG_OP_CODE: Readonly<Record<FeatureAggOp, number>> = {
  count: 0,
  sum: 1,
  min: 2,
  max: 3,
};

const ZONE_SCOPE_CODE: Readonly<Record<FeatureZoneScope, number>> = {
  all: 0,
  board: 1,
  aux: 2,
};

const OWNER_CODE: Readonly<Record<string, number>> = {
  none: 0,
  self: 1,
  active: 2,
};

const SURFACE_SCOPE_CODE: Readonly<Record<'currentSurface' | 'previewSurface', number>> = {
  currentSurface: 0,
  previewSurface: 1,
};

const SELECTOR_KIND_CODE: Readonly<Record<'none' | 'player' | 'role', number>> = {
  none: 0,
  player: 1,
  role: 2,
};

const PLAYER_SELECTOR_CODE: Readonly<Record<'self' | 'active', number>> = {
  self: 0,
  active: 1,
};

const ZONE_PROP_SOURCE_CODE: Readonly<Record<'attribute' | 'variable', number>> = {
  attribute: 0,
  variable: 1,
};

const GLOBAL_ZONE_SOURCE_CODE: Readonly<Record<'attribute' | 'variable', number>> = {
  attribute: 0,
  variable: 1,
};

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const indexOf = (ids: readonly string[], id: string): number | undefined => {
  const index = ids.indexOf(id);
  return index < 0 ? undefined : index;
};

const stableStringCode = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 1;
};

const stablePayloadCode = (value: unknown): number =>
  stableStringCode(JSON.stringify(value, sortObjectKeys) ?? 'null');

const aggOpCode = (op: FeatureAggOp): number => AGG_OP_CODE[op];
const zoneScopeCode = (scope: FeatureZoneScope): number => ZONE_SCOPE_CODE[scope];
const surfaceScopeCode = (kind: 'currentSurface' | 'previewSurface'): number => SURFACE_SCOPE_CODE[kind];
const selectorKindCode = (kind: 'none' | 'player' | 'role'): number => SELECTOR_KIND_CODE[kind];
const playerSelectorCode = (selector: 'self' | 'active'): number => PLAYER_SELECTOR_CODE[selector];
const zonePropSourceCode = (source: 'attribute' | 'variable'): number => ZONE_PROP_SOURCE_CODE[source];
const globalZoneSourceCode = (source: 'attribute' | 'variable'): number => GLOBAL_ZONE_SOURCE_CODE[source];

const sortObjectKeys = (_key: string, value: unknown): unknown => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).sort(([left], [right]) => compareStrings(left, right)),
  );
};

export function canonicalKey(ref: FeatureRef): string {
  return `${ref.kind}:${ref.layoutIndex}:${ref.aux.join(',')}`;
}

export function getFeatureId(table: FeatureTable, ref: FeatureRef): number | undefined {
  return table.refToId[canonicalKey(ref)];
}

export function buildFeatureTable(def: GameDef, layout: EncodedStateLayout): FeatureTable {
  const refsByKey = new Map<string, FeatureRef>();
  const add = (ref: FeatureRef | undefined): void => {
    if (ref === undefined) {
      return;
    }
    refsByKey.set(canonicalKey(ref), ref);
  };

  forEachCompiledPolicyExpr(def, (expr) => {
    for (const ref of collectFeatureRefsFromCompiledPolicyExpr(expr, layout)) {
      add(ref);
    }
  });

  const refs = [...refsByKey.values()].sort((left, right) => compareStrings(canonicalKey(left), canonicalKey(right)));
  const refToId = Object.fromEntries(refs.map((ref, index) => [canonicalKey(ref), index]));

  return Object.freeze({
    refs: Object.freeze(refs.map((ref) => Object.freeze({ ...ref, aux: Object.freeze([...ref.aux]) }))),
    refToId: Object.freeze(refToId),
  });
}

export function collectFeatureRefsFromCompiledPolicyExpr(
  expr: CompiledPolicyExpr,
  layout: EncodedStateLayout,
): readonly FeatureRef[] {
  const refs: FeatureRef[] = [];
  const visit = (current: CompiledPolicyExpr | undefined): void => {
    if (current === undefined) {
      return;
    }
    switch (current.kind) {
      case 'literal':
      case 'param':
        return;
      case 'ref':
        refs.push(featureRefForCompiledPolicyRef(current.ref, layout));
        return;
      case 'op':
        for (const arg of current.args) visit(arg);
        return;
      case 'zoneTokenAgg':
        visitZoneSource(current.zone);
        refs.push(zoneTokenAggFeatureRef(current, layout));
        return;
      case 'globalTokenAgg':
        refs.push(globalTokenAggFeatureRef(current, layout));
        return;
      case 'globalZoneAgg':
        refs.push(globalZoneAggFeatureRef(current, layout));
        return;
      case 'adjacentTokenAgg':
        visitZoneSource(current.anchorZone);
        refs.push(adjacentTokenAggFeatureRef(current, layout));
        return;
      case 'seatAgg':
        visit(current.expr);
        refs.push({
          kind: 'seatAgg',
          layoutIndex: DYNAMIC_LAYOUT_INDEX,
          aux: [aggOpCode(current.aggOp), stablePayloadCode(current.over)],
        });
        return;
      case 'zoneProp':
        visitZoneSource(current.zone);
        refs.push(zonePropFeatureRef(current, layout));
        return;
    }
  };
  const visitZoneSource = (source: CompiledPolicyZoneSource): void => {
    if (typeof source !== 'string') {
      visit(source);
    }
  };

  visit(expr);
  return refs;
}

function featureRefForCompiledPolicyRef(ref: CompiledAgentPolicyRef, layout: EncodedStateLayout): FeatureRef {
  if (ref.kind !== 'currentSurface' && ref.kind !== 'previewSurface') {
    return {
      kind: 'dynamicRef',
      layoutIndex: DYNAMIC_LAYOUT_INDEX,
      aux: [stablePayloadCode(ref)],
    };
  }

  if (ref.family === 'globalVar') {
    const index = indexOf(layout.varLayout.globalVariableIds, ref.id);
    return index === undefined
      ? dynamicSurfaceRef(ref)
      : {
          kind: 'globalVar',
          layoutIndex: index,
          aux: [surfaceScopeCode(ref.kind)],
        };
  }

  if (ref.family === 'perPlayerVar') {
    const index = indexOf(layout.varLayout.perPlayerVariableIds, ref.id);
    return index === undefined
      ? dynamicSurfaceRef(ref)
      : {
          kind: 'playerInt',
          layoutIndex: index,
          aux: [surfaceScopeCode(ref.kind), ...selectorAux(ref.selector)],
        };
  }

  if (ref.family === 'globalMarker') {
    const index = indexOf(layout.markerLayout.globalMarkerIds, ref.id);
    return index === undefined
      ? dynamicSurfaceRef(ref)
      : {
          kind: 'globalMarker',
          layoutIndex: index,
          aux: [surfaceScopeCode(ref.kind)],
        };
  }

  return dynamicSurfaceRef(ref);
}

function dynamicSurfaceRef(ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'currentSurface' | 'previewSurface' }>): FeatureRef {
  return {
    kind: 'dynamicSurface',
    layoutIndex: DYNAMIC_LAYOUT_INDEX,
    aux: [surfaceScopeCode(ref.kind), stablePayloadCode({ family: ref.family, id: ref.id, selector: ref.selector })],
  };
}

function selectorAux(selector: Extract<CompiledAgentPolicyRef, { readonly kind: 'currentSurface' | 'previewSurface' }>['selector']): readonly number[] {
  if (selector === undefined) {
    return [selectorKindCode('none')];
  }
  if (selector.kind === 'player') {
    return [selectorKindCode('player'), playerSelectorCode(selector.player)];
  }
  return [selectorKindCode('role'), stableStringCode(selector.seatToken)];
}

function zoneTokenAggFeatureRef(
  expr: Extract<CompiledPolicyExpr, { readonly kind: 'zoneTokenAgg' }>,
  layout: EncodedStateLayout,
): FeatureRef {
  if (typeof expr.zone !== 'string') {
    return dynamicExprRef(expr);
  }
  const zoneIndex = indexOf(layout.zoneIds.map(String), expr.zone);
  const propIndex = indexOf(layout.tokenLayout.scalarPropIds, expr.prop);
  if (zoneIndex === undefined || propIndex === undefined) {
    return dynamicExprRef(expr);
  }
  return {
    kind: 'zoneTokenAgg',
    layoutIndex: zoneIndex,
    aux: [ownerCode(expr.owner), propIndex, aggOpCode(expr.aggOp)],
  };
}

function globalTokenAggFeatureRef(
  expr: Extract<CompiledPolicyExpr, { readonly kind: 'globalTokenAgg' }>,
  layout: EncodedStateLayout,
): FeatureRef {
  const propIndex = expr.prop === undefined ? -1 : indexOf(layout.tokenLayout.scalarPropIds, expr.prop);
  if (propIndex === undefined) {
    return dynamicExprRef(expr);
  }
  return {
    kind: 'globalTokenAgg',
    layoutIndex: propIndex < 0 ? DYNAMIC_LAYOUT_INDEX : propIndex,
    aux: [
      aggOpCode(expr.aggOp),
      zoneScopeCode(expr.zoneScope),
      propIndex,
      tokenFilterCode(expr.tokenFilter, layout),
      zoneFilterCode(expr.zoneFilter, layout),
    ],
  };
}

function globalZoneAggFeatureRef(
  expr: Extract<CompiledPolicyExpr, { readonly kind: 'globalZoneAgg' }>,
  layout: EncodedStateLayout,
): FeatureRef {
  const variableIndex = expr.source === 'variable' ? indexOf(layout.varLayout.zoneVariableIds, expr.field) : undefined;
  return {
    kind: 'globalZoneAgg',
    layoutIndex: variableIndex ?? DYNAMIC_LAYOUT_INDEX,
    aux: [
      globalZoneSourceCode(expr.source),
      variableIndex ?? stableStringCode(expr.field),
      aggOpCode(expr.aggOp),
      zoneScopeCode(expr.zoneScope),
      zoneFilterCode(expr.zoneFilter, layout),
    ],
  };
}

function adjacentTokenAggFeatureRef(
  expr: Extract<CompiledPolicyExpr, { readonly kind: 'adjacentTokenAgg' }>,
  layout: EncodedStateLayout,
): FeatureRef {
  if (typeof expr.anchorZone !== 'string') {
    return dynamicExprRef(expr);
  }
  const zoneIndex = indexOf(layout.zoneIds.map(String), expr.anchorZone);
  const propIndex = expr.prop === undefined ? -1 : indexOf(layout.tokenLayout.scalarPropIds, expr.prop);
  if (zoneIndex === undefined || propIndex === undefined) {
    return dynamicExprRef(expr);
  }
  return {
    kind: 'adjacentTokenAgg',
    layoutIndex: zoneIndex,
    aux: [aggOpCode(expr.aggOp), propIndex, tokenFilterCode(expr.tokenFilter, layout)],
  };
}

function zonePropFeatureRef(
  expr: Extract<CompiledPolicyExpr, { readonly kind: 'zoneProp' }>,
  layout: EncodedStateLayout,
): FeatureRef {
  if (typeof expr.zone !== 'string') {
    return dynamicExprRef(expr);
  }
  const zoneIndex = indexOf(layout.zoneIds.map(String), expr.zone);
  if (zoneIndex === undefined) {
    return dynamicExprRef(expr);
  }
  const variableIndex = indexOf(layout.varLayout.zoneVariableIds, expr.prop);
  return {
    kind: 'zoneProp',
    layoutIndex: zoneIndex,
    aux: [
      variableIndex === undefined ? zonePropSourceCode('attribute') : zonePropSourceCode('variable'),
      variableIndex ?? stableStringCode(expr.prop),
    ],
  };
}

function dynamicExprRef(expr: CompiledPolicyExpr): FeatureRef {
  return {
    kind: 'dynamicExpr',
    layoutIndex: DYNAMIC_LAYOUT_INDEX,
    aux: [stablePayloadCode(expr)],
  };
}

function ownerCode(owner: string): number {
  return OWNER_CODE[owner] ?? stableStringCode(owner);
}

function tokenFilterCode(filter: AgentPolicyTokenFilter | undefined, layout: EncodedStateLayout): number {
  if (filter === undefined) {
    return 0;
  }
  const encoded = {
    type: filter.type === undefined ? undefined : layout.tokenLayout.tokenTypeIndexById[filter.type] ?? stableStringCode(filter.type),
    props: Object.fromEntries(
      Object.entries(filter.props ?? {})
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([propId, comparison]) => [
          layout.tokenLayout.scalarPropIndexById[propId] ?? stableStringCode(propId),
          comparison.eq,
        ]),
    ),
  };
  return stablePayloadCode(encoded);
}

function zoneFilterCode(filter: AgentPolicyZoneFilter | undefined, layout: EncodedStateLayout): number {
  if (filter === undefined) {
    return 0;
  }
  const encoded = {
    category: filter.category,
    attribute: filter.attribute,
    variable: filter.variable === undefined
      ? undefined
      : {
          ...filter.variable,
          prop: layout.varLayout.zoneVariableIds.indexOf(filter.variable.prop) < 0
            ? filter.variable.prop
            : layout.varLayout.zoneVariableIds.indexOf(filter.variable.prop),
        },
  };
  return stablePayloadCode(encoded);
}

function forEachCompiledPolicyExpr(def: GameDef, visit: (expr: CompiledPolicyExpr) => void): void {
  const compiled = def.agents?.compiled;
  if (compiled === undefined) {
    return;
  }
  for (const feature of Object.values(compiled.stateFeatures)) visit(feature.expr);
  for (const feature of Object.values(compiled.candidateFeatures)) visit(feature.expr);
  for (const aggregate of Object.values(compiled.candidateAggregates)) {
    visit(aggregate.of);
    if (aggregate.where !== undefined) visit(aggregate.where);
  }
  for (const rule of Object.values(compiled.pruningRules)) visit(rule.when);
  for (const consideration of Object.values(compiled.considerations)) {
    if (consideration.when !== undefined) visit(consideration.when);
    visit(consideration.weight);
    visit(consideration.value);
  }
  for (const tieBreaker of Object.values(compiled.tieBreakers)) {
    if (tieBreaker.value !== undefined) visit(tieBreaker.value);
  }
  for (const condition of Object.values(compiled.strategicConditions)) {
    visit(condition.target);
    if (condition.proximity !== undefined) visit(condition.proximity.current);
  }
}
