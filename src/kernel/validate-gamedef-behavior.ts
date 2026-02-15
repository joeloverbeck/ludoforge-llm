import type { Diagnostic } from './diagnostics.js';
import type {
  ConditionAST,
  EffectAST,
  GameDef,
  NumericValueExpr,
  OptionsQuery,
  Reference,
  TokenFilterPredicate,
  ValueExpr,
  ZoneRef,
} from './types.js';
import { isNumericValueExpr } from './numeric-value-expr.js';
import {
  type ValidationContext,
  pushMissingReferenceDiagnostic,
  validatePlayerSelector,
  validateZoneSelector,
} from './validate-gamedef-structure.js';

function validateStaticMapSpaceSelector(
  diagnostics: Diagnostic[],
  zoneSelector: string,
  path: string,
  context: ValidationContext,
): void {
  if (context.mapSpaceZoneCandidates.length === 0) {
    return;
  }

  if (zoneSelector.startsWith('$')) {
    return;
  }

  if (!zoneSelector.includes(':')) {
    return;
  }

  if (context.mapSpaceZoneNames.has(zoneSelector)) {
    return;
  }

  pushMissingReferenceDiagnostic(
    diagnostics,
    'REF_MAP_SPACE_MISSING',
    path,
    `Zone "${zoneSelector}" is not a declared map space.`,
    zoneSelector,
    context.mapSpaceZoneCandidates,
  );
}

function validateMapSpacePropertyReference(
  diagnostics: Diagnostic[],
  zoneSelector: string,
  prop: string,
  path: string,
  context: ValidationContext,
  expectedKind: 'scalar' | 'array',
): void {
  if (context.mapSpaceZoneCandidates.length === 0) {
    return;
  }

  validateStaticMapSpaceSelector(diagnostics, zoneSelector, `${path}.zone`, context);

  const propertyKind = context.mapSpacePropKinds.get(prop);
  if (propertyKind === undefined) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_MAP_SPACE_PROP_MISSING',
      `${path}.prop`,
      `Unknown map-space property "${prop}".`,
      prop,
      context.mapSpacePropCandidates,
    );
    return;
  }

  if (propertyKind === 'mixed' || propertyKind === expectedKind) {
    return;
  }

  diagnostics.push({
    code: 'REF_MAP_SPACE_PROP_KIND_INVALID',
    path: `${path}.prop`,
    severity: 'error',
    message:
      expectedKind === 'scalar'
        ? `Property "${prop}" is array-valued in map spaces and cannot be used with zoneProp.`
        : `Property "${prop}" is scalar-valued in map spaces and cannot be used with zonePropIncludes.`,
    suggestion:
      expectedKind === 'scalar'
        ? 'Use zonePropIncludes for array membership checks.'
        : 'Use zoneProp with comparison operators for scalar properties.',
  });
}

const validateReference = (
  diagnostics: Diagnostic[],
  reference: Reference,
  path: string,
  context: ValidationContext,
): void => {
  if (reference.ref === 'gvar' && !context.globalVarNames.has(reference.var)) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_GVAR_MISSING',
      `${path}.var`,
      `Unknown global variable "${reference.var}".`,
      reference.var,
      context.globalVarCandidates,
    );
    return;
  }

  if (reference.ref === 'pvar' && !context.perPlayerVarNames.has(reference.var)) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_PVAR_MISSING',
      `${path}.var`,
      `Unknown per-player variable "${reference.var}".`,
      reference.var,
      context.perPlayerVarCandidates,
    );
    return;
  }

  if (reference.ref === 'pvar') {
    validatePlayerSelector(diagnostics, reference.player, `${path}.player`, context);
  }

  if (reference.ref === 'zoneCount') {
    validateZoneSelector(diagnostics, reference.zone, `${path}.zone`, context);
    return;
  }

  if (reference.ref === 'markerState') {
    validateZoneSelector(diagnostics, reference.space, `${path}.space`, context);
    if (!context.markerLatticeNames.has(reference.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_MARKER_LATTICE_MISSING',
        `${path}.marker`,
        `Unknown marker lattice "${reference.marker}".`,
        reference.marker,
        context.markerLatticeCandidates,
      );
    }
    return;
  }

  if (reference.ref === 'globalMarkerState') {
    if (!context.globalMarkerLatticeNames.has(reference.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GLOBAL_MARKER_LATTICE_MISSING',
        `${path}.marker`,
        `Unknown global marker lattice "${reference.marker}".`,
        reference.marker,
        context.globalMarkerLatticeCandidates,
      );
    }
    return;
  }

  if (reference.ref === 'zoneProp') {
    validateMapSpacePropertyReference(diagnostics, reference.zone, reference.prop, path, context, 'scalar');
    return;
  }
};

const tryStaticStringValue = (valueExpr: ValueExpr): string | null => {
  if (typeof valueExpr === 'string') {
    return valueExpr;
  }

  if (typeof valueExpr === 'object' && valueExpr !== null && 'concat' in valueExpr) {
    const parts: string[] = [];
    for (const entry of valueExpr.concat) {
      const part = tryStaticStringValue(entry);
      if (part === null) {
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  }

  return null;
};

const validateMarkerStateLiteral = (
  diagnostics: Diagnostic[],
  markerId: string,
  markerStateExpr: ValueExpr,
  path: string,
  statesByMarkerId: ReadonlyMap<string, readonly string[]>,
): void => {
  const validStates = statesByMarkerId.get(markerId);
  if (validStates === undefined) {
    return;
  }

  const markerState = tryStaticStringValue(markerStateExpr);
  if (markerState === null || validStates.includes(markerState)) {
    return;
  }

  pushMissingReferenceDiagnostic(
    diagnostics,
    'REF_MARKER_STATE_MISSING',
    path,
    `Unknown marker state "${markerState}" for marker lattice "${markerId}".`,
    markerState,
    validStates,
  );
};

export const validateValueExpr = (
  diagnostics: Diagnostic[],
  valueExpr: ValueExpr,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof valueExpr === 'number' || typeof valueExpr === 'boolean' || typeof valueExpr === 'string') {
    return;
  }

  if ('ref' in valueExpr) {
    validateReference(diagnostics, valueExpr, path, context);
    return;
  }

  if ('concat' in valueExpr) {
    valueExpr.concat.forEach((child, index) => {
      validateValueExpr(diagnostics, child, `${path}.concat[${index}]`, context);
    });
    return;
  }

  if ('op' in valueExpr) {
    validateValueExpr(diagnostics, valueExpr.left, `${path}.left`, context);
    validateValueExpr(diagnostics, valueExpr.right, `${path}.right`, context);
    if (
      (valueExpr.op === '/' || valueExpr.op === 'floorDiv' || valueExpr.op === 'ceilDiv') &&
      typeof valueExpr.right === 'number' &&
      valueExpr.right === 0
    ) {
      diagnostics.push({
        code: 'VALUE_EXPR_DIVISION_BY_ZERO_STATIC',
        path: `${path}.right`,
        severity: 'error',
        message: `ValueExpr "${valueExpr.op}" denominator must not be 0.`,
        suggestion: 'Use a non-zero literal denominator or guard the expression with an if condition.',
      });
    }
    return;
  }

  if ('if' in valueExpr) {
    validateConditionAst(diagnostics, valueExpr.if.when, `${path}.if.when`, context);
    validateValueExpr(diagnostics, valueExpr.if.then, `${path}.if.then`, context);
    validateValueExpr(diagnostics, valueExpr.if.else, `${path}.if.else`, context);
    return;
  }

  validateOptionsQuery(diagnostics, valueExpr.aggregate.query, `${path}.aggregate.query`, context);
};

export const validateNumericValueExpr = (
  diagnostics: Diagnostic[],
  valueExpr: NumericValueExpr,
  path: string,
  context: ValidationContext,
): void => {
  validateValueExpr(diagnostics, valueExpr, path, context);
  if (!isNumericValueExpr(valueExpr)) {
    diagnostics.push({
      code: 'VALUE_EXPR_NUMERIC_REQUIRED',
      path,
      severity: 'error',
      message: 'Expected a numeric value expression in this context.',
      suggestion: 'Use number, numeric refs/aggregates, arithmetic, or numeric if-expression branches.',
    });
  }
};

export const validateConditionAst = (
  diagnostics: Diagnostic[],
  condition: ConditionAST,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof condition === 'boolean') {
    return;
  }

  switch (condition.op) {
    case 'and':
    case 'or': {
      condition.args.forEach((entry, index) => {
        validateConditionAst(diagnostics, entry, `${path}.args[${index}]`, context);
      });
      return;
    }
    case 'not': {
      validateConditionAst(diagnostics, condition.arg, `${path}.arg`, context);
      return;
    }
    case 'in': {
      validateValueExpr(diagnostics, condition.item, `${path}.item`, context);
      validateValueExpr(diagnostics, condition.set, `${path}.set`, context);
      return;
    }
    case 'adjacent': {
      validateZoneSelector(diagnostics, condition.left, `${path}.left`, context);
      validateZoneSelector(diagnostics, condition.right, `${path}.right`, context);
      return;
    }
    case 'connected': {
      validateZoneSelector(diagnostics, condition.from, `${path}.from`, context);
      validateZoneSelector(diagnostics, condition.to, `${path}.to`, context);
      if (condition.via) {
        validateConditionAst(diagnostics, condition.via, `${path}.via`, context);
      }
      return;
    }
    case 'zonePropIncludes': {
      validateMapSpacePropertyReference(diagnostics, condition.zone, condition.prop, path, context, 'array');
      validateValueExpr(diagnostics, condition.value, `${path}.value`, context);
      return;
    }
    default: {
      validateValueExpr(diagnostics, condition.left, `${path}.left`, context);
      validateValueExpr(diagnostics, condition.right, `${path}.right`, context);
      if ((condition.op === '==' || condition.op === '!=') && typeof condition.left === 'object' && condition.left !== null) {
        if ('ref' in condition.left && condition.left.ref === 'markerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.left.marker,
            condition.right,
            `${path}.right`,
            context.markerLatticeStatesById,
          );
        }
        if ('ref' in condition.left && condition.left.ref === 'globalMarkerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.left.marker,
            condition.right,
            `${path}.right`,
            context.globalMarkerLatticeStatesById,
          );
        }
      }

      if ((condition.op === '==' || condition.op === '!=') && typeof condition.right === 'object' && condition.right !== null) {
        if ('ref' in condition.right && condition.right.ref === 'markerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.right.marker,
            condition.left,
            `${path}.left`,
            context.markerLatticeStatesById,
          );
        }
        if ('ref' in condition.right && condition.right.ref === 'globalMarkerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.right.marker,
            condition.left,
            `${path}.left`,
            context.globalMarkerLatticeStatesById,
          );
        }
      }
    }
  }
};

const validateTokenFilterPredicates = (
  diagnostics: Diagnostic[],
  filters: readonly TokenFilterPredicate[],
  path: string,
  context: ValidationContext,
): void => {
  for (let i = 0; i < filters.length; i += 1) {
    const filterValue = filters[i]!.value;
    if (!Array.isArray(filterValue)) {
      validateValueExpr(diagnostics, filterValue as ValueExpr, `${path}[${i}].value`, context);
    }
  }
};

export const validateOptionsQuery = (
  diagnostics: Diagnostic[],
  query: OptionsQuery,
  path: string,
  context: ValidationContext,
): void => {
  switch (query.query) {
    case 'tokensInZone': {
      validateZoneSelector(diagnostics, query.zone, `${path}.zone`, context);
      if (query.filter) {
        validateTokenFilterPredicates(diagnostics, query.filter, `${path}.filter`, context);
      }
      return;
    }
    case 'adjacentZones': {
      validateZoneSelector(diagnostics, query.zone, `${path}.zone`, context);
      return;
    }
    case 'tokensInAdjacentZones': {
      validateZoneSelector(diagnostics, query.zone, `${path}.zone`, context);
      if (query.filter) {
        validateTokenFilterPredicates(diagnostics, query.filter, `${path}.filter`, context);
      }
      return;
    }
    case 'connectedZones': {
      validateZoneSelector(diagnostics, query.zone, `${path}.zone`, context);
      if (query.via) {
        validateConditionAst(diagnostics, query.via, `${path}.via`, context);
      }
      return;
    }
    case 'intsInRange': {
      if (typeof query.min === 'number') {
        if (!Number.isSafeInteger(query.min)) {
          diagnostics.push({
            code: 'DOMAIN_INTS_RANGE_BOUND_INVALID',
            path: `${path}.min`,
            severity: 'error',
            message: 'intsInRange.min must be a safe integer literal when provided as a number.',
            suggestion: 'Use an integer literal or a ValueExpr that evaluates to an integer.',
          });
        }
      } else {
        validateNumericValueExpr(diagnostics, query.min, `${path}.min`, context);
      }

      if (typeof query.max === 'number') {
        if (!Number.isSafeInteger(query.max)) {
          diagnostics.push({
            code: 'DOMAIN_INTS_RANGE_BOUND_INVALID',
            path: `${path}.max`,
            severity: 'error',
            message: 'intsInRange.max must be a safe integer literal when provided as a number.',
            suggestion: 'Use an integer literal or a ValueExpr that evaluates to an integer.',
          });
        }
      } else {
        validateNumericValueExpr(diagnostics, query.max, `${path}.max`, context);
      }

      if (typeof query.min === 'number' && typeof query.max === 'number' && query.min > query.max) {
        diagnostics.push({
          code: 'DOMAIN_INTS_RANGE_INVALID',
          path,
          severity: 'error',
          message: `Invalid intsInRange domain; min (${query.min}) must be <= max (${query.max}).`,
        });
      }
      return;
    }
    case 'zones':
    case 'mapSpaces': {
      if (query.filter?.owner) {
        validatePlayerSelector(diagnostics, query.filter.owner, `${path}.filter.owner`, context);
      }
      if (query.filter?.condition) {
        validateConditionAst(diagnostics, query.filter.condition, `${path}.filter.condition`, context);
      }
      return;
    }
    case 'enums':
    case 'players': {
      return;
    }
    case 'globalMarkers': {
      query.markers?.forEach((markerId, index) => {
        if (!context.globalMarkerLatticeNames.has(markerId)) {
          pushMissingReferenceDiagnostic(
            diagnostics,
            'REF_GLOBAL_MARKER_LATTICE_MISSING',
            `${path}.markers[${index}]`,
            `Unknown global marker lattice "${markerId}".`,
            markerId,
            context.globalMarkerLatticeCandidates,
          );
        }
      });

      if (query.states !== undefined && query.markers !== undefined) {
        query.markers.forEach((markerId) => {
          const validStates = context.globalMarkerLatticeStatesById.get(markerId);
          if (validStates === undefined) {
            return;
          }
          query.states?.forEach((state, index) => {
            if (!validStates.includes(state)) {
              pushMissingReferenceDiagnostic(
                diagnostics,
                'REF_MARKER_STATE_MISSING',
                `${path}.states[${index}]`,
                `Unknown marker state "${state}" for marker lattice "${markerId}".`,
                state,
                validStates,
              );
            }
          });
        });
      }
      return;
    }
  }
};

const validateZoneRef = (
  diagnostics: Diagnostic[],
  zoneRef: ZoneRef,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof zoneRef === 'string') {
    validateZoneSelector(diagnostics, zoneRef, path, context);
    return;
  }
  validateValueExpr(diagnostics, zoneRef.zoneExpr, `${path}.zoneExpr`, context);
};

export const validateEffectAst = (
  diagnostics: Diagnostic[],
  effect: EffectAST,
  path: string,
  context: ValidationContext,
): void => {
  if ('setVar' in effect) {
    if (effect.setVar.scope === 'global' && !context.globalVarNames.has(effect.setVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GVAR_MISSING',
        `${path}.setVar.var`,
        `Unknown global variable "${effect.setVar.var}".`,
        effect.setVar.var,
        context.globalVarCandidates,
      );
    }

    if (effect.setVar.scope === 'pvar' && !context.perPlayerVarNames.has(effect.setVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PVAR_MISSING',
        `${path}.setVar.var`,
        `Unknown per-player variable "${effect.setVar.var}".`,
        effect.setVar.var,
        context.perPlayerVarCandidates,
      );
    }

    if (effect.setVar.player) {
      validatePlayerSelector(diagnostics, effect.setVar.player, `${path}.setVar.player`, context);
    }

    validateValueExpr(diagnostics, effect.setVar.value, `${path}.setVar.value`, context);
    return;
  }

  if ('addVar' in effect) {
    if (effect.addVar.scope === 'global' && !context.globalVarNames.has(effect.addVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GVAR_MISSING',
        `${path}.addVar.var`,
        `Unknown global variable "${effect.addVar.var}".`,
        effect.addVar.var,
        context.globalVarCandidates,
      );
    }

    if (effect.addVar.scope === 'pvar' && !context.perPlayerVarNames.has(effect.addVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PVAR_MISSING',
        `${path}.addVar.var`,
        `Unknown per-player variable "${effect.addVar.var}".`,
        effect.addVar.var,
        context.perPlayerVarCandidates,
      );
    }

    if (effect.addVar.player) {
      validatePlayerSelector(diagnostics, effect.addVar.player, `${path}.addVar.player`, context);
    }

    const varType =
      effect.addVar.scope === 'global'
        ? context.globalVarTypesByName.get(effect.addVar.var)
        : context.perPlayerVarTypesByName.get(effect.addVar.var);
    if (varType === 'boolean') {
      diagnostics.push({
        code: 'ADDVAR_BOOLEAN_TARGET_INVALID',
        path: `${path}.addVar.var`,
        severity: 'error',
        message: `addVar cannot target boolean variable "${effect.addVar.var}".`,
        suggestion: 'Use setVar with a boolean value expression for boolean variables.',
      });
    }

    validateNumericValueExpr(diagnostics, effect.addVar.delta, `${path}.addVar.delta`, context);
    return;
  }

  if ('moveToken' in effect) {
    validateZoneRef(diagnostics, effect.moveToken.from, `${path}.moveToken.from`, context);
    validateZoneRef(diagnostics, effect.moveToken.to, `${path}.moveToken.to`, context);
    return;
  }

  if ('moveAll' in effect) {
    validateZoneRef(diagnostics, effect.moveAll.from, `${path}.moveAll.from`, context);
    validateZoneRef(diagnostics, effect.moveAll.to, `${path}.moveAll.to`, context);

    if (effect.moveAll.filter) {
      validateConditionAst(diagnostics, effect.moveAll.filter, `${path}.moveAll.filter`, context);
    }
    return;
  }

  if ('moveTokenAdjacent' in effect) {
    validateZoneRef(diagnostics, effect.moveTokenAdjacent.from, `${path}.moveTokenAdjacent.from`, context);
    return;
  }

  if ('draw' in effect) {
    validateZoneRef(diagnostics, effect.draw.from, `${path}.draw.from`, context);
    validateZoneRef(diagnostics, effect.draw.to, `${path}.draw.to`, context);
    return;
  }

  if ('shuffle' in effect) {
    validateZoneRef(diagnostics, effect.shuffle.zone, `${path}.shuffle.zone`, context);
    return;
  }

  if ('createToken' in effect) {
    if (!context.tokenTypeNames.has(effect.createToken.type)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_TOKEN_TYPE_MISSING',
        `${path}.createToken.type`,
        `Unknown token type "${effect.createToken.type}".`,
        effect.createToken.type,
        context.tokenTypeCandidates,
      );
    }

    validateZoneRef(diagnostics, effect.createToken.zone, `${path}.createToken.zone`, context);
    if (effect.createToken.props) {
      Object.entries(effect.createToken.props).forEach(([propName, propValue]) => {
        validateValueExpr(diagnostics, propValue, `${path}.createToken.props.${propName}`, context);
      });
    }
    return;
  }

  if ('destroyToken' in effect) {
    return;
  }

  if ('if' in effect) {
    validateConditionAst(diagnostics, effect.if.when, `${path}.if.when`, context);
    effect.if.then.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.if.then[${index}]`, context);
    });
    effect.if.else?.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.if.else[${index}]`, context);
    });
    return;
  }

  if ('forEach' in effect) {
    validateOptionsQuery(diagnostics, effect.forEach.over, `${path}.forEach.over`, context);
    effect.forEach.effects.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.forEach.effects[${index}]`, context);
    });
    if (effect.forEach.limit !== undefined) {
      validateNumericValueExpr(diagnostics, effect.forEach.limit, `${path}.forEach.limit`, context);
    }
    effect.forEach.in?.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.forEach.in[${index}]`, context);
    });
    return;
  }

  if ('removeByPriority' in effect) {
    validateNumericValueExpr(diagnostics, effect.removeByPriority.budget, `${path}.removeByPriority.budget`, context);

    effect.removeByPriority.groups.forEach((group, index) => {
      const groupPath = `${path}.removeByPriority.groups[${index}]`;
      validateOptionsQuery(diagnostics, group.over, `${groupPath}.over`, context);
      validateZoneRef(diagnostics, group.to, `${groupPath}.to`, context);
      if (group.from !== undefined) {
        validateZoneRef(diagnostics, group.from, `${groupPath}.from`, context);
      }
    });

    effect.removeByPriority.in?.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.removeByPriority.in[${index}]`, context);
    });
    return;
  }

  if ('let' in effect) {
    validateValueExpr(diagnostics, effect.let.value, `${path}.let.value`, context);
    effect.let.in.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.let.in[${index}]`, context);
    });
    return;
  }

  if ('chooseOne' in effect) {
    validateOptionsQuery(diagnostics, effect.chooseOne.options, `${path}.chooseOne.options`, context);
    return;
  }

  if ('setTokenProp' in effect) {
    validateValueExpr(diagnostics, effect.setTokenProp.value, `${path}.setTokenProp.value`, context);
    return;
  }

  if ('rollRandom' in effect) {
    validateNumericValueExpr(diagnostics, effect.rollRandom.min, `${path}.rollRandom.min`, context);
    validateNumericValueExpr(diagnostics, effect.rollRandom.max, `${path}.rollRandom.max`, context);
    effect.rollRandom.in.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.rollRandom.in[${index}]`, context);
    });
    return;
  }

  if ('setMarker' in effect) {
    validateZoneRef(diagnostics, effect.setMarker.space, `${path}.setMarker.space`, context);
    if (!context.markerLatticeNames.has(effect.setMarker.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_MARKER_LATTICE_MISSING',
        `${path}.setMarker.marker`,
        `Unknown marker lattice "${effect.setMarker.marker}".`,
        effect.setMarker.marker,
        context.markerLatticeCandidates,
      );
    }
    validateMarkerStateLiteral(
      diagnostics,
      effect.setMarker.marker,
      effect.setMarker.state,
      `${path}.setMarker.state`,
      context.markerLatticeStatesById,
    );
    validateValueExpr(diagnostics, effect.setMarker.state, `${path}.setMarker.state`, context);
    return;
  }

  if ('shiftMarker' in effect) {
    validateZoneRef(diagnostics, effect.shiftMarker.space, `${path}.shiftMarker.space`, context);
    if (!context.markerLatticeNames.has(effect.shiftMarker.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_MARKER_LATTICE_MISSING',
        `${path}.shiftMarker.marker`,
        `Unknown marker lattice "${effect.shiftMarker.marker}".`,
        effect.shiftMarker.marker,
        context.markerLatticeCandidates,
      );
    }
    validateNumericValueExpr(diagnostics, effect.shiftMarker.delta, `${path}.shiftMarker.delta`, context);
    return;
  }

  if ('setGlobalMarker' in effect) {
    if (!context.globalMarkerLatticeNames.has(effect.setGlobalMarker.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GLOBAL_MARKER_LATTICE_MISSING',
        `${path}.setGlobalMarker.marker`,
        `Unknown global marker lattice "${effect.setGlobalMarker.marker}".`,
        effect.setGlobalMarker.marker,
        context.globalMarkerLatticeCandidates,
      );
    }
    validateMarkerStateLiteral(
      diagnostics,
      effect.setGlobalMarker.marker,
      effect.setGlobalMarker.state,
      `${path}.setGlobalMarker.state`,
      context.globalMarkerLatticeStatesById,
    );
    validateValueExpr(diagnostics, effect.setGlobalMarker.state, `${path}.setGlobalMarker.state`, context);
    return;
  }

  if ('flipGlobalMarker' in effect) {
    const staticMarkerId = tryStaticStringValue(effect.flipGlobalMarker.marker);
    if (staticMarkerId !== null) {
      if (!context.globalMarkerLatticeNames.has(staticMarkerId)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_GLOBAL_MARKER_LATTICE_MISSING',
          `${path}.flipGlobalMarker.marker`,
          `Unknown global marker lattice "${staticMarkerId}".`,
          staticMarkerId,
          context.globalMarkerLatticeCandidates,
        );
      } else {
        validateMarkerStateLiteral(
          diagnostics,
          staticMarkerId,
          effect.flipGlobalMarker.stateA,
          `${path}.flipGlobalMarker.stateA`,
          context.globalMarkerLatticeStatesById,
        );
        validateMarkerStateLiteral(
          diagnostics,
          staticMarkerId,
          effect.flipGlobalMarker.stateB,
          `${path}.flipGlobalMarker.stateB`,
          context.globalMarkerLatticeStatesById,
        );
      }
    }

    const staticStateA = tryStaticStringValue(effect.flipGlobalMarker.stateA);
    const staticStateB = tryStaticStringValue(effect.flipGlobalMarker.stateB);
    if (staticStateA !== null && staticStateB !== null && staticStateA === staticStateB) {
      diagnostics.push({
        code: 'EFFECT_FLIP_GLOBAL_MARKER_STATE_INVALID',
        path: `${path}.flipGlobalMarker`,
        severity: 'error',
        message: 'flipGlobalMarker.stateA and flipGlobalMarker.stateB must be distinct.',
        suggestion: 'Provide two different marker states to flip between.',
      });
    }

    validateValueExpr(diagnostics, effect.flipGlobalMarker.marker, `${path}.flipGlobalMarker.marker`, context);
    validateValueExpr(diagnostics, effect.flipGlobalMarker.stateA, `${path}.flipGlobalMarker.stateA`, context);
    validateValueExpr(diagnostics, effect.flipGlobalMarker.stateB, `${path}.flipGlobalMarker.stateB`, context);
    return;
  }

  if ('shiftGlobalMarker' in effect) {
    if (!context.globalMarkerLatticeNames.has(effect.shiftGlobalMarker.marker)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GLOBAL_MARKER_LATTICE_MISSING',
        `${path}.shiftGlobalMarker.marker`,
        `Unknown global marker lattice "${effect.shiftGlobalMarker.marker}".`,
        effect.shiftGlobalMarker.marker,
        context.globalMarkerLatticeCandidates,
      );
    }
    validateNumericValueExpr(diagnostics, effect.shiftGlobalMarker.delta, `${path}.shiftGlobalMarker.delta`, context);
    return;
  }

  if ('grantFreeOperation' in effect) {
    const grant = effect.grantFreeOperation;
    if (
      grant.operationClass !== 'pass' &&
      grant.operationClass !== 'event' &&
      grant.operationClass !== 'operation' &&
      grant.operationClass !== 'limitedOperation' &&
      grant.operationClass !== 'operationPlusSpecialActivity'
    ) {
      diagnostics.push({
        code: 'EFFECT_GRANT_FREE_OPERATION_CLASS_INVALID',
        path: `${path}.grantFreeOperation.operationClass`,
        severity: 'error',
        message: `grantFreeOperation.operationClass is invalid: \"${grant.operationClass}\".`,
        suggestion: 'Use one of pass|event|operation|limitedOperation|operationPlusSpecialActivity.',
      });
    }
    if (grant.uses !== undefined && (!Number.isSafeInteger(grant.uses) || grant.uses <= 0)) {
      diagnostics.push({
        code: 'EFFECT_GRANT_FREE_OPERATION_USES_INVALID',
        path: `${path}.grantFreeOperation.uses`,
        severity: 'error',
        message: 'grantFreeOperation.uses must be a positive integer.',
        suggestion: 'Set uses to an integer >= 1.',
      });
    }
    if (
      grant.sequence !== undefined &&
      (!Number.isSafeInteger(grant.sequence.step) || grant.sequence.step < 0)
    ) {
      diagnostics.push({
        code: 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_INVALID',
        path: `${path}.grantFreeOperation.sequence.step`,
        severity: 'error',
        message: 'grantFreeOperation.sequence.step must be a non-negative integer.',
        suggestion: 'Set sequence.step to an integer >= 0.',
      });
    }
    if (grant.zoneFilter !== undefined) {
      validateConditionAst(diagnostics, grant.zoneFilter, `${path}.grantFreeOperation.zoneFilter`, context);
    }
    return;
  }

  if ('gotoPhase' in effect) {
    if (!context.turnPhaseNames.has(effect.gotoPhase.phase)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `${path}.gotoPhase.phase`,
        `Unknown turn phase "${effect.gotoPhase.phase}".`,
        effect.gotoPhase.phase,
        context.turnPhaseCandidates,
      );
    }
    return;
  }

  if ('pushInterruptPhase' in effect) {
    if (!context.phaseNames.has(effect.pushInterruptPhase.phase)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `${path}.pushInterruptPhase.phase`,
        `Unknown phase "${effect.pushInterruptPhase.phase}".`,
        effect.pushInterruptPhase.phase,
        context.phaseCandidates,
      );
    }
    if (!context.phaseNames.has(effect.pushInterruptPhase.resumePhase)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `${path}.pushInterruptPhase.resumePhase`,
        `Unknown phase "${effect.pushInterruptPhase.resumePhase}".`,
        effect.pushInterruptPhase.resumePhase,
        context.phaseCandidates,
      );
    }
    return;
  }

  if ('popInterruptPhase' in effect) {
    return;
  }

  const chooseN = effect.chooseN;
  const hasN = 'n' in chooseN && chooseN.n !== undefined;
  const hasMax = 'max' in chooseN && chooseN.max !== undefined;
  const hasMin = 'min' in chooseN && chooseN.min !== undefined;

  if ((hasN && hasMax) || (!hasN && !hasMax)) {
    diagnostics.push({
      code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
      path: `${path}.chooseN`,
      severity: 'error',
      message: 'chooseN must declare either exact n or range max/min cardinality.',
      suggestion: 'Use { n } or { max, min? }.',
    });
  }

  if (hasN && (!Number.isSafeInteger(chooseN.n) || chooseN.n < 0)) {
    diagnostics.push({
      code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
      path: `${path}.chooseN.n`,
      severity: 'error',
      message: 'chooseN.n must be a non-negative integer.',
      suggestion: 'Set n to an integer >= 0.',
    });
  }

  if (hasMax) {
    validateNumericValueExpr(diagnostics, chooseN.max, `${path}.chooseN.max`, context);
    if (typeof chooseN.max === 'number' && (!Number.isSafeInteger(chooseN.max) || chooseN.max < 0)) {
      diagnostics.push({
        code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
        path: `${path}.chooseN.max`,
        severity: 'error',
        message: 'chooseN.max must be a non-negative integer when provided as a literal.',
        suggestion: 'Set max literal to an integer >= 0 or use a ValueExpr that evaluates to one.',
      });
    }
  }

  if (hasMin) {
    validateNumericValueExpr(diagnostics, chooseN.min, `${path}.chooseN.min`, context);
    if (typeof chooseN.min === 'number' && (!Number.isSafeInteger(chooseN.min) || chooseN.min < 0)) {
      diagnostics.push({
        code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
        path: `${path}.chooseN.min`,
        severity: 'error',
        message: 'chooseN.min must be a non-negative integer when provided as a literal.',
        suggestion: 'Set min literal to an integer >= 0 or use a ValueExpr that evaluates to one.',
      });
    }
  }

  if (hasMax && hasMin && typeof chooseN.max === 'number' && typeof chooseN.min === 'number' && chooseN.min > chooseN.max) {
    diagnostics.push({
      code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
      path: `${path}.chooseN`,
      severity: 'error',
      message: 'chooseN.min cannot exceed chooseN.max.',
      suggestion: 'Set min <= max.',
    });
  }

  validateOptionsQuery(diagnostics, effect.chooseN.options, `${path}.chooseN.options`, context);
};

export const validatePostAdjacencyBehavior = (
  diagnostics: Diagnostic[],
  def: GameDef,
  context: ValidationContext,
  phaseCandidates: readonly string[],
  actionCandidates: readonly string[],
): void => {
  def.turnStructure.phases.forEach((phase, phaseIndex) => {
    phase.onEnter?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.phases[${phaseIndex}].onEnter[${effectIndex}]`, context);
    });
    phase.onExit?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.phases[${phaseIndex}].onExit[${effectIndex}]`, context);
    });
  });
  (def.turnStructure.interrupts ?? []).forEach((phase, phaseIndex) => {
    phase.onEnter?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.interrupts[${phaseIndex}].onEnter[${effectIndex}]`, context);
    });
    phase.onExit?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.interrupts[${phaseIndex}].onExit[${effectIndex}]`, context);
    });
  });

  def.triggers.forEach((trigger, triggerIndex) => {
    if (trigger.event.type === 'phaseEnter' || trigger.event.type === 'phaseExit') {
      if (!phaseCandidates.includes(trigger.event.phase)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_PHASE_MISSING',
          `triggers[${triggerIndex}].event.phase`,
          `Unknown phase "${trigger.event.phase}".`,
          trigger.event.phase,
          phaseCandidates,
        );
      }
    }

    if (trigger.event.type === 'actionResolved' && trigger.event.action) {
      if (!actionCandidates.includes(trigger.event.action)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_ACTION_MISSING',
          `triggers[${triggerIndex}].event.action`,
          `Unknown action "${trigger.event.action}".`,
          trigger.event.action,
          actionCandidates,
        );
      }
    }

    if (trigger.event.type === 'tokenEntered' && trigger.event.zone) {
      validateZoneSelector(diagnostics, trigger.event.zone, `triggers[${triggerIndex}].event.zone`, context);
    }

    if (trigger.event.type === 'varChanged' && trigger.event.var) {
      const globalVarNames = def.globalVars.map((variable) => variable.name);
      const perPlayerVarNames = def.perPlayerVars.map((variable) => variable.name);
      const candidateNames =
        trigger.event.scope === 'global'
          ? globalVarNames
          : trigger.event.scope === 'perPlayer'
            ? perPlayerVarNames
            : [...globalVarNames, ...perPlayerVarNames];
      if (!candidateNames.includes(trigger.event.var)) {
        diagnostics.push({
          code: 'REF_VAR_MISSING',
          path: `triggers[${triggerIndex}].event.var`,
          severity: 'error',
          message: `Unknown variable "${trigger.event.var}".`,
          suggestion: 'Use one of the declared globalVars/perPlayerVars names.',
        });
      }
    }

    if (trigger.match) {
      validateConditionAst(diagnostics, trigger.match, `triggers[${triggerIndex}].match`, context);
    }

    if (trigger.when) {
      validateConditionAst(diagnostics, trigger.when, `triggers[${triggerIndex}].when`, context);
    }

    trigger.effects.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `triggers[${triggerIndex}].effects[${effectIndex}]`, context);
    });
  });

  const terminal = def.terminal;
  if (!terminal) {
    return;
  }

  terminal.conditions.forEach((endCondition, endConditionIndex) => {
    if (endCondition.result.type === 'win') {
      validatePlayerSelector(diagnostics, endCondition.result.player, `terminal.conditions[${endConditionIndex}].result.player`, context);
    }
    if (endCondition.result.type === 'score' && !terminal.scoring) {
      diagnostics.push({
        code: 'SCORING_REQUIRED_FOR_SCORE_RESULT',
        path: `terminal.conditions[${endConditionIndex}].result`,
        severity: 'error',
        message: 'End condition with result.type "score" requires a scoring definition.',
        suggestion: 'Add def.terminal.scoring or change end condition result.type.',
      });
    }

    validateConditionAst(diagnostics, endCondition.when, `terminal.conditions[${endConditionIndex}].when`, context);
  });

  if (terminal.scoring) {
    validateNumericValueExpr(diagnostics, terminal.scoring.value, 'terminal.scoring.value', context);
    const usesScoreResult = terminal.conditions.some((endCondition) => endCondition.result.type === 'score');
    if (!usesScoreResult) {
      diagnostics.push({
        code: 'SCORING_UNUSED',
        path: 'terminal.scoring',
        severity: 'warning',
        message: 'scoring is configured but no end condition uses result.type "score".',
        suggestion: 'Add a score-based end condition or remove scoring.',
      });
    }
  }
};
