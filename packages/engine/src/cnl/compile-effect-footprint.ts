import type {
  CompiledAgentDependencyRefs,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  EffectAST,
  EffectFootprint,
  EffectFootprintSurface,
  EffectFootprintTargetSet,
  ScopedVarNameExpr,
  TransferVarEndpoint,
  ZoneRef,
} from '../kernel/types.js';

export type { EffectFootprint, EffectFootprintSurface, EffectFootprintTargetSet } from '../kernel/types.js';

const emptySet = (): readonly string[] => [];

export function emptyEffectFootprint(): EffectFootprint {
  return {
    writes: emptySurface(),
    reads: emptySurface(),
    mayTouchTokens: emptySet(),
    mayTouchZones: emptySet(),
    mayTouchVariables: emptySet(),
    mayTouchScores: emptySet(),
  };
}

export function computeEffectFootprint(effect: EffectAST): EffectFootprint {
  if ('setVar' in effect) {
    return withWrite(variableSurface(effect.setVar.scope, effect.setVar.var));
  }
  if ('addVar' in effect) {
    return withWrite(variableSurface(effect.addVar.scope, effect.addVar.var));
  }
  if ('transferVar' in effect) {
    return unionFootprints([
      withRead(variableSurface(effect.transferVar.from.scope, effect.transferVar.from.var)),
      withWrite(variableSurface(effect.transferVar.to.scope, effect.transferVar.to.var)),
      zoneRefFootprint(endpointZone(effect.transferVar.from)),
      zoneRefFootprint(endpointZone(effect.transferVar.to)),
    ]);
  }
  if ('moveToken' in effect) {
    return unionFootprints([
      touchTokens('unknown'),
      touchZoneRef(effect.moveToken.from),
      touchZoneRef(effect.moveToken.to),
      zoneRefFootprint(effect.moveToken.from),
      zoneRefFootprint(effect.moveToken.to),
    ]);
  }
  if ('moveAll' in effect) {
    return unionFootprints([
      touchTokens('unknown'),
      touchZoneRef(effect.moveAll.from),
      touchZoneRef(effect.moveAll.to),
      zoneRefFootprint(effect.moveAll.from),
      zoneRefFootprint(effect.moveAll.to),
    ]);
  }
  if ('moveTokenAdjacent' in effect) {
    return unionFootprints([
      touchTokens('unknown'),
      touchZoneRef(effect.moveTokenAdjacent.from),
      zoneRefFootprint(effect.moveTokenAdjacent.from),
      touchZones('unknown'),
    ]);
  }
  if ('draw' in effect) {
    return unionFootprints([
      touchTokens('unknown'),
      touchZoneRef(effect.draw.from),
      touchZoneRef(effect.draw.to),
      zoneRefFootprint(effect.draw.from),
      zoneRefFootprint(effect.draw.to),
    ]);
  }
  if ('reveal' in effect) {
    return unionFootprints([touchTokens('unknown'), zoneRefFootprint(effect.reveal.zone)]);
  }
  if ('conceal' in effect) {
    return unionFootprints([touchTokens('unknown'), zoneRefFootprint(effect.conceal.zone)]);
  }
  if ('shuffle' in effect) {
    return unionFootprints([touchTokens('unknown'), zoneRefFootprint(effect.shuffle.zone)]);
  }
  if ('createToken' in effect) {
    return unionFootprints([
      touchTokens([effect.createToken.type]),
      touchZoneRef(effect.createToken.zone),
      zoneRefFootprint(effect.createToken.zone),
    ]);
  }
  if ('destroyToken' in effect || 'setTokenProp' in effect) {
    return touchTokens('unknown');
  }
  if ('if' in effect) {
    return unionFootprints([
      ...effect.if.then.map(computeEffectFootprint),
      ...(effect.if.else ?? []).map(computeEffectFootprint),
    ]);
  }
  if ('forEach' in effect) {
    return unionFootprints([
      queryFootprint(effect.forEach.over),
      ...effect.forEach.effects.map(computeEffectFootprint),
      ...(effect.forEach.in ?? []).map(computeEffectFootprint),
    ]);
  }
  if ('reduce' in effect) {
    return unionFootprints([queryFootprint(effect.reduce.over), ...effect.reduce.in.map(computeEffectFootprint)]);
  }
  if ('removeByPriority' in effect) {
    return unionFootprints([
      ...effect.removeByPriority.groups.flatMap((group) => [
        queryFootprint(group.over),
        zoneRefFootprint(group.from),
        zoneRefFootprint(group.to),
        touchZoneRef(group.from),
        touchZoneRef(group.to),
        touchTokens('unknown'),
      ]),
      ...(effect.removeByPriority.in ?? []).map(computeEffectFootprint),
    ]);
  }
  if ('let' in effect) {
    return unionFootprints(effect.let.in.map(computeEffectFootprint));
  }
  if ('evaluateSubset' in effect) {
    return unionFootprints([
      queryFootprint(effect.evaluateSubset.source),
      ...effect.evaluateSubset.compute.map(computeEffectFootprint),
      ...effect.evaluateSubset.in.map(computeEffectFootprint),
    ]);
  }
  if ('rollRandom' in effect) {
    return unionFootprints(effect.rollRandom.in.map(computeEffectFootprint));
  }
  if ('setMarker' in effect) {
    return unionFootprints([touchZoneRef(effect.setMarker.space), zoneRefFootprint(effect.setMarker.space)]);
  }
  if ('shiftMarker' in effect) {
    return unionFootprints([touchZoneRef(effect.shiftMarker.space), zoneRefFootprint(effect.shiftMarker.space)]);
  }
  if ('setGlobalMarker' in effect || 'flipGlobalMarker' in effect || 'shiftGlobalMarker' in effect) {
    return touchVariables('unknown');
  }
  return emptyEffectFootprint();
}

function endpointZone(endpoint: TransferVarEndpoint): ZoneRef | undefined {
  return endpoint.scope === 'zoneVar' ? endpoint.zone : undefined;
}

export function attachEffectFootprint(effect: EffectAST): EffectAST {
  return {
    ...effect,
    footprint: computeEffectFootprint(effect),
  } as EffectAST;
}

export function computePolicyExprReadFootprint(expr: CompiledPolicyExpr): EffectFootprint {
  switch (expr.kind) {
    case 'literal':
    case 'param':
      return emptyEffectFootprint();
    case 'ref':
      return withRead(surfaceForPolicyRef(expr.ref));
    case 'op':
      return unionFootprints(expr.args.map(computePolicyExprReadFootprint));
    case 'zoneTokenAgg':
      return unionFootprints([touchTokens('unknown'), zoneSourceFootprint(expr.zone)]);
    case 'globalTokenAgg':
      return touchTokens('unknown');
    case 'globalZoneAgg':
      return touchZones('unknown');
    case 'adjacentTokenAgg':
      return unionFootprints([touchTokens('unknown'), zoneSourceFootprint(expr.anchorZone), touchZones('unknown')]);
    case 'seatAgg':
      return computePolicyExprReadFootprint(expr.expr);
    case 'zoneProp':
      return zoneSourceFootprint(expr.zone);
  }
}

export function computeDependenciesReadFootprint(dependencies: CompiledAgentDependencyRefs): EffectFootprint {
  const surfaces: EffectFootprint[] = [];
  if (dependencies.stateFeatures.length > 0) {
    surfaces.push(withRead({ ...emptySurface(), variables: 'unknown', zones: 'unknown', tokens: 'unknown', scores: 'unknown' }));
  }
  if (
    dependencies.candidateFeatures.length > 0
    || dependencies.aggregates.length > 0
    || dependencies.strategicConditions.length > 0
    || (dependencies.strategyModules?.length ?? 0) > 0
  ) {
    surfaces.push(withRead({ ...emptySurface(), variables: 'unknown', zones: 'unknown', tokens: 'unknown', scores: 'unknown' }));
  }
  return unionFootprints(surfaces);
}

export function unionFootprints(footprints: readonly EffectFootprint[]): EffectFootprint {
  return footprints.reduce((merged, entry) => ({
    writes: unionSurfaces(merged.writes, entry.writes),
    reads: unionSurfaces(merged.reads, entry.reads),
    mayTouchTokens: unionTargetSets(merged.mayTouchTokens, entry.mayTouchTokens),
    mayTouchZones: unionTargetSets(merged.mayTouchZones, entry.mayTouchZones),
    mayTouchVariables: unionTargetSets(merged.mayTouchVariables, entry.mayTouchVariables),
    mayTouchScores: unionTargetSets(merged.mayTouchScores, entry.mayTouchScores),
  }), emptyEffectFootprint());
}

export function structuralImpactScore(
  writeFootprint: EffectFootprint | undefined,
  readFootprint: EffectFootprint | undefined,
): number {
  if (writeFootprint === undefined || readFootprint === undefined) {
    return 1;
  }
  return 1
    + intersectionCardinality(writeFootprint.writes.tokens, readFootprint.reads.tokens)
    + intersectionCardinality(writeFootprint.writes.zones, readFootprint.reads.zones)
    + intersectionCardinality(writeFootprint.writes.variables, readFootprint.reads.variables)
    + intersectionCardinality(writeFootprint.writes.scores, readFootprint.reads.scores)
    + intersectionCardinality(writeFootprint.mayTouchTokens, readFootprint.reads.tokens)
    + intersectionCardinality(writeFootprint.mayTouchZones, readFootprint.reads.zones)
    + intersectionCardinality(writeFootprint.mayTouchVariables, readFootprint.reads.variables)
    + intersectionCardinality(writeFootprint.mayTouchScores, readFootprint.reads.scores);
}

function emptySurface(): EffectFootprintSurface {
  return {
    tokens: emptySet(),
    zones: emptySet(),
    variables: emptySet(),
    scores: emptySet(),
  };
}

function withRead(reads: EffectFootprintSurface): EffectFootprint {
  return { ...emptyEffectFootprint(), reads };
}

function withWrite(writes: EffectFootprintSurface): EffectFootprint {
  return {
    ...emptyEffectFootprint(),
    writes,
    mayTouchTokens: writes.tokens,
    mayTouchZones: writes.zones,
    mayTouchVariables: writes.variables,
    mayTouchScores: writes.scores,
  };
}

function touchTokens(tokens: EffectFootprintTargetSet): EffectFootprint {
  return withWrite({ ...emptySurface(), tokens });
}

function touchZones(zones: EffectFootprintTargetSet): EffectFootprint {
  return withWrite({ ...emptySurface(), zones });
}

function touchVariables(variables: EffectFootprintTargetSet): EffectFootprint {
  return withWrite({ ...emptySurface(), variables });
}

function variableSurface(scope: 'global' | 'pvar' | 'zoneVar', variable: ScopedVarNameExpr): EffectFootprintSurface {
  if (typeof variable !== 'string') {
    return { ...emptySurface(), variables: 'unknown' };
  }
  return { ...emptySurface(), variables: [`${scope}:${variable}`] };
}

function zoneRefFootprint(zone: ZoneRef | undefined): EffectFootprint {
  if (zone === undefined) {
    return emptyEffectFootprint();
  }
  if (typeof zone === 'string') {
    return withRead({ ...emptySurface(), zones: [zone] });
  }
  return unionFootprints([
    withRead({ ...emptySurface(), zones: 'unknown' }),
    computeValueExprReadFootprint(zone.zoneExpr),
  ]);
}

function touchZoneRef(zone: ZoneRef | undefined): EffectFootprint {
  if (zone === undefined) {
    return emptyEffectFootprint();
  }
  return typeof zone === 'string'
    ? touchZones([zone])
    : touchZones('unknown');
}

function zoneSourceFootprint(source: string | CompiledPolicyExpr): EffectFootprint {
  return typeof source === 'string'
    ? withRead({ ...emptySurface(), zones: [source] })
    : computePolicyExprReadFootprint(source);
}

function queryFootprint(query: { readonly query: string }): EffectFootprint {
  switch (query.query) {
    case 'tokensInZone':
    case 'tokenZones':
    case 'tokensInMapSpaces':
    case 'tokensInAdjacentZones':
      return unionFootprints([touchTokens('unknown'), touchZones('unknown')]);
    case 'zones':
    case 'mapSpaces':
    case 'adjacentZones':
    case 'connectedZones':
      return touchZones('unknown');
    case 'intsInVarRange':
      return withRead({ ...emptySurface(), variables: 'unknown' });
    default:
      return emptyEffectFootprint();
  }
}

function computeValueExprReadFootprint(expr: unknown): EffectFootprint {
  if (expr === null || typeof expr !== 'object') {
    return emptyEffectFootprint();
  }
  const value = expr as { readonly ref?: unknown; readonly var?: unknown; readonly zone?: unknown };
  if (value.ref === 'gvar' && typeof value.var === 'string') {
    return withRead({ ...emptySurface(), variables: [`global:${value.var}`] });
  }
  if (value.ref === 'pvar' && typeof value.var === 'string') {
    return withRead({ ...emptySurface(), variables: [`pvar:${value.var}`] });
  }
  if (value.ref === 'zoneVar' && typeof value.var === 'string') {
    return withRead({ ...emptySurface(), variables: [`zoneVar:${value.var}`], zones: typeof value.zone === 'string' ? [value.zone] : 'unknown' });
  }
  if (value.ref === 'tokenProp' || value.ref === 'tokenZone') {
    return withRead({ ...emptySurface(), tokens: 'unknown' });
  }
  if (value.ref === 'zoneCount' || value.ref === 'zoneProp') {
    return withRead({ ...emptySurface(), zones: typeof value.zone === 'string' ? [value.zone] : 'unknown' });
  }
  return emptyEffectFootprint();
}

function surfaceForPolicyRef(ref: CompiledAgentPolicyRef): EffectFootprintSurface {
  if (ref.kind === 'previewSurface' || ref.kind === 'currentSurface') {
    switch (ref.family) {
      case 'globalVar':
        return { ...emptySurface(), variables: [`global:${ref.id}`] };
      case 'perPlayerVar':
        return { ...emptySurface(), variables: [`pvar:${ref.id}`] };
      case 'derivedMetric':
      case 'victoryCurrentMargin':
      case 'victoryCurrentRank':
        return { ...emptySurface(), scores: [ref.id] };
      case 'globalMarker':
      case 'activeCardIdentity':
      case 'activeCardTag':
      case 'activeCardMetadata':
      case 'activeCardAnnotation':
        return { ...emptySurface(), variables: 'unknown' };
    }
  }
  if (ref.kind === 'library' && ref.refKind === 'previewStateFeature') {
    return { ...emptySurface(), variables: 'unknown', tokens: 'unknown', zones: 'unknown', scores: 'unknown' };
  }
  if (ref.kind === 'previewOptionRef') {
    return { ...emptySurface(), variables: 'unknown', tokens: 'unknown', zones: 'unknown', scores: 'unknown' };
  }
  return emptySurface();
}

function unionSurfaces(left: EffectFootprintSurface, right: EffectFootprintSurface): EffectFootprintSurface {
  return {
    tokens: unionTargetSets(left.tokens, right.tokens),
    zones: unionTargetSets(left.zones, right.zones),
    variables: unionTargetSets(left.variables, right.variables),
    scores: unionTargetSets(left.scores, right.scores),
  };
}

function unionTargetSets(left: EffectFootprintTargetSet, right: EffectFootprintTargetSet): EffectFootprintTargetSet {
  if (left === 'unknown' || right === 'unknown') {
    return 'unknown';
  }
  return [...new Set([...left, ...right])].sort();
}

function intersectionCardinality(left: EffectFootprintTargetSet, right: EffectFootprintTargetSet): number {
  if (left === 'unknown' || right === 'unknown') {
    if (left !== 'unknown' && left.length === 0) {
      return 0;
    }
    if (right !== 'unknown' && right.length === 0) {
      return 0;
    }
    return 1;
  }
  const rightSet = new Set(right);
  return left.filter((entry) => rightSet.has(entry)).length;
}
