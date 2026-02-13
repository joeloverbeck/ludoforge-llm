import type { Diagnostic } from './diagnostics.js';
import type {
  ConditionAST,
  EffectAST,
  GameDef,
  MapSpaceDef,
  OptionsQuery,
  PlayerSel,
  Reference,
  ScenarioPiecePlacement,
  StackingConstraint,
  TokenFilterPredicate,
  ValueExpr,
  ZoneRef,
} from './types.js';
import { buildAdjacencyGraph, validateAdjacency } from './spatial.js';

const MAX_ALTERNATIVE_DISTANCE = 3;

const checkDuplicateIds = (
  diagnostics: Diagnostic[],
  values: readonly string[],
  code: string,
  label: string,
  pathPrefix: string,
): void => {
  const seen = new Set<string>();

  for (const [index, value] of values.entries()) {
    if (!seen.has(value)) {
      seen.add(value);
      continue;
    }

    diagnostics.push({
      code,
      path: `${pathPrefix}[${index}]`,
      severity: 'error',
      message: `Duplicate ${label} \"${value}\".`,
    });
  }
};

const levenshteinDistance = (left: string, right: string): number => {
  const cols = right.length + 1;
  let previousRow: number[] = Array.from({ length: cols }, (_unused, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const currentRow: number[] = new Array<number>(cols).fill(0);
    currentRow[0] = row;

    for (let col = 1; col <= right.length; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      const insertCost = (currentRow[col - 1] ?? Number.POSITIVE_INFINITY) + 1;
      const deleteCost = (previousRow[col] ?? Number.POSITIVE_INFINITY) + 1;
      const replaceCost = (previousRow[col - 1] ?? Number.POSITIVE_INFINITY) + substitutionCost;
      currentRow[col] = Math.min(insertCost, deleteCost, replaceCost);
    }

    previousRow = currentRow;
  }

  return previousRow[right.length] ?? 0;
};

const getAlternatives = (value: string, validValues: readonly string[]): readonly string[] => {
  if (validValues.length === 0) {
    return [];
  }

  const scored = validValues
    .map((candidate) => ({ candidate, distance: levenshteinDistance(value, candidate) }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }

      return left.candidate.localeCompare(right.candidate);
    });

  const bestDistance = scored[0]?.distance;
  if (bestDistance === undefined || bestDistance > MAX_ALTERNATIVE_DISTANCE) {
    return [];
  }

  return scored.filter((item) => item.distance === bestDistance).map((item) => item.candidate);
};

const pushMissingReferenceDiagnostic = (
  diagnostics: Diagnostic[],
  code: string,
  path: string,
  message: string,
  value: string,
  validValues: readonly string[],
): void => {
  const alternatives = getAlternatives(value, validValues);
  const suggestion =
    alternatives.length > 0 ? `Did you mean \"${alternatives[0]}\"?` : `Use one of the declared values.`;

  if (alternatives.length > 0) {
    diagnostics.push({
      code,
      path,
      severity: 'error',
      message,
      suggestion,
      alternatives,
    });
    return;
  }

  diagnostics.push({
    code,
    path,
    severity: 'error',
    message,
    suggestion,
  });
};

const parseZoneSelector = (
  zoneSelector: string,
): {
  base: string;
  qualifier: string | null;
} => {
  const separatorIndex = zoneSelector.lastIndexOf(':');
  if (separatorIndex < 0 || separatorIndex === zoneSelector.length - 1) {
    return {
      base: zoneSelector,
      qualifier: null,
    };
  }

  return {
    base: zoneSelector.slice(0, separatorIndex),
    qualifier: zoneSelector.slice(separatorIndex + 1),
  };
};

const PLAYER_ZONE_QUALIFIER_PATTERN = /^[0-9]+$/;

type ValidationContext = {
  globalVarNames: Set<string>;
  perPlayerVarNames: Set<string>;
  globalVarCandidates: readonly string[];
  perPlayerVarCandidates: readonly string[];
  zoneNames: Set<string>;
  zoneCandidates: readonly string[];
  zoneOwners: ReadonlyMap<string, GameDef['zones'][number]['owner']>;
  tokenTypeNames: Set<string>;
  tokenTypeCandidates: readonly string[];
  playerIdMin: number;
  playerIdMaxInclusive: number;
};

const validatePlayerSelector = (
  diagnostics: Diagnostic[],
  playerSelector: PlayerSel,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof playerSelector !== 'object' || !('id' in playerSelector)) {
    return;
  }

  const id = playerSelector.id;
  if (!Number.isInteger(id) || id < context.playerIdMin || id > context.playerIdMaxInclusive) {
    diagnostics.push({
      code: 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS',
      path,
      severity: 'error',
      message: `PlayerSel.id must be an integer in [${context.playerIdMin}, ${context.playerIdMaxInclusive}] based on metadata.players.max.`,
      suggestion: `Use a value between ${context.playerIdMin} and ${context.playerIdMaxInclusive}, or a dynamic selector such as "active".`,
    });
  }
};

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
      `Unknown global variable \"${reference.var}\".`,
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
      `Unknown per-player variable \"${reference.var}\".`,
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
  }
};

const validateValueExpr = (
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

const validateConditionAst = (
  diagnostics: Diagnostic[],
  condition: ConditionAST,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof condition === 'boolean') return;
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
      validateZoneSelector(diagnostics, condition.zone, `${path}.zone`, context);
      validateValueExpr(diagnostics, condition.value, `${path}.value`, context);
      return;
    }
    default: {
      validateValueExpr(diagnostics, condition.left, `${path}.left`, context);
      validateValueExpr(diagnostics, condition.right, `${path}.right`, context);
    }
  }
};

const validateZoneSelector = (
  diagnostics: Diagnostic[],
  zoneSelector: string,
  path: string,
  context: ValidationContext,
): void => {
  if (context.zoneNames.has(zoneSelector)) {
    const owner = context.zoneOwners.get(zoneSelector);
    const qualifier = parseZoneSelector(zoneSelector).qualifier;

    if (owner !== undefined && qualifier !== null) {
      if (qualifier === 'none' && owner !== 'none') {
        diagnostics.push({
          code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
          path,
          severity: 'error',
          message: `Selector "${zoneSelector}" uses :none, but zone "${zoneSelector}" is owner "${owner}".`,
          suggestion: `Use a selector that targets a player-owned zone, or change "${zoneSelector}" owner to "none".`,
        });
      } else if (qualifier !== 'none' && owner !== 'player') {
        diagnostics.push({
          code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
          path,
          severity: 'error',
          message: `Selector "${zoneSelector}" is owner-qualified, but zone "${zoneSelector}" is owner "${owner}".`,
          suggestion: `Use :none for unowned zones, or change "${zoneSelector}" owner to "player".`,
        });
      }
    }

    return;
  }

  const { base, qualifier } = parseZoneSelector(zoneSelector);
  const baseMatches = context.zoneCandidates.filter((candidate) => candidate.startsWith(`${base}:`));

  if (baseMatches.length === 0) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_ZONE_MISSING',
      path,
      `Unknown zone \"${zoneSelector}\".`,
      zoneSelector,
      context.zoneCandidates,
    );
    return;
  }

  if (qualifier === null) {
    return;
  }

  const hasUnownedVariant = baseMatches.some((candidate) => context.zoneOwners.get(candidate) === 'none');
  const hasPlayerOwnedVariant = baseMatches.some((candidate) => context.zoneOwners.get(candidate) === 'player');

  if (qualifier === 'none') {
    if (!hasUnownedVariant) {
      diagnostics.push({
        code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
        path,
        severity: 'error',
        message: `Selector "${zoneSelector}" uses :none, but zone base "${base}" is player-owned.`,
        suggestion: `Use a selector that targets a player-owned zone, or change "${base}" owner to "none".`,
      });
    }
    return;
  }

  if (!hasPlayerOwnedVariant) {
    diagnostics.push({
      code: 'ZONE_SELECTOR_OWNERSHIP_INVALID',
      path,
      severity: 'error',
      message: `Selector "${zoneSelector}" is owner-qualified, but zone base "${base}" is unowned.`,
      suggestion: `Use :none for unowned zones, or change "${base}" owner to "player".`,
    });
    return;
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

const validateTokenFilterPredicates = (
  diagnostics: Diagnostic[],
  filters: readonly TokenFilterPredicate[],
  path: string,
  context: ValidationContext,
): void => {
  for (let i = 0; i < filters.length; i++) {
    const filterValue = filters[i]!.value;
    if (!Array.isArray(filterValue)) {
      validateValueExpr(diagnostics, filterValue as ValueExpr, `${path}[${i}].value`, context);
    }
  }
};

const validateOptionsQuery = (
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
      if (query.min > query.max) {
        diagnostics.push({
          code: 'DOMAIN_INTS_RANGE_INVALID',
          path,
          severity: 'error',
          message: `Invalid intsInRange domain; min (${query.min}) must be <= max (${query.max}).`,
        });
      }
      return;
    }
    case 'zones': {
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
  }
};

const validateEffectAst = (
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
        `Unknown global variable \"${effect.setVar.var}\".`,
        effect.setVar.var,
        context.globalVarCandidates,
      );
    }

    if (effect.setVar.scope === 'pvar' && !context.perPlayerVarNames.has(effect.setVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PVAR_MISSING',
        `${path}.setVar.var`,
        `Unknown per-player variable \"${effect.setVar.var}\".`,
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
        `Unknown global variable \"${effect.addVar.var}\".`,
        effect.addVar.var,
        context.globalVarCandidates,
      );
    }

    if (effect.addVar.scope === 'pvar' && !context.perPlayerVarNames.has(effect.addVar.var)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PVAR_MISSING',
        `${path}.addVar.var`,
        `Unknown per-player variable \"${effect.addVar.var}\".`,
        effect.addVar.var,
        context.perPlayerVarCandidates,
      );
    }

    if (effect.addVar.player) {
      validatePlayerSelector(diagnostics, effect.addVar.player, `${path}.addVar.player`, context);
    }

    validateValueExpr(diagnostics, effect.addVar.delta, `${path}.addVar.delta`, context);
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
        `Unknown token type \"${effect.createToken.type}\".`,
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
      validateValueExpr(diagnostics, effect.forEach.limit, `${path}.forEach.limit`, context);
    }
    effect.forEach.in?.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.forEach.in[${index}]`, context);
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
    validateValueExpr(diagnostics, effect.rollRandom.min, `${path}.rollRandom.min`, context);
    validateValueExpr(diagnostics, effect.rollRandom.max, `${path}.rollRandom.max`, context);
    effect.rollRandom.in.forEach((entry, index) => {
      validateEffectAst(diagnostics, entry, `${path}.rollRandom.in[${index}]`, context);
    });
    return;
  }

  if ('setMarker' in effect) {
    validateZoneRef(diagnostics, effect.setMarker.space, `${path}.setMarker.space`, context);
    validateValueExpr(diagnostics, effect.setMarker.state, `${path}.setMarker.state`, context);
    return;
  }

  if ('shiftMarker' in effect) {
    validateZoneRef(diagnostics, effect.shiftMarker.space, `${path}.shiftMarker.space`, context);
    validateValueExpr(diagnostics, effect.shiftMarker.delta, `${path}.shiftMarker.delta`, context);
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

  if (hasMax && (!Number.isSafeInteger(chooseN.max) || chooseN.max < 0)) {
    diagnostics.push({
      code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
      path: `${path}.chooseN.max`,
      severity: 'error',
      message: 'chooseN.max must be a non-negative integer.',
      suggestion: 'Set max to an integer >= 0.',
    });
  }

  if (hasMin && (!Number.isSafeInteger(chooseN.min) || chooseN.min < 0)) {
    diagnostics.push({
      code: 'EFFECT_CHOOSE_N_CARDINALITY_INVALID',
      path: `${path}.chooseN.min`,
      severity: 'error',
      message: 'chooseN.min must be a non-negative integer.',
      suggestion: 'Set min to an integer >= 0.',
    });
  }

  if (
    hasMax &&
    hasMin &&
    Number.isSafeInteger(chooseN.max) &&
    Number.isSafeInteger(chooseN.min) &&
    chooseN.min > chooseN.max
  ) {
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

const validateCoupPlan = (diagnostics: Diagnostic[], def: GameDef): void => {
  if (!def.coupPlan) {
    return;
  }

  checkDuplicateIds(
    diagnostics,
    def.coupPlan.phases.map((phase) => phase.id),
    'DUPLICATE_COUP_PLAN_PHASE_ID',
    'coup phase id',
    'coupPlan.phases',
  );

  def.coupPlan.phases.forEach((phase, phaseIndex) => {
    if (phase.steps.length === 0) {
      diagnostics.push({
        code: 'COUP_PLAN_PHASE_STEPS_EMPTY',
        path: `coupPlan.phases[${phaseIndex}].steps`,
        severity: 'error',
        message: `coupPlan phase "${phase.id}" must declare at least one step.`,
        suggestion: 'Add one or more deterministic symbolic step ids.',
      });
    }
  });

  if (
    def.coupPlan.maxConsecutiveRounds !== undefined &&
    (!Number.isInteger(def.coupPlan.maxConsecutiveRounds) || def.coupPlan.maxConsecutiveRounds < 1)
  ) {
    diagnostics.push({
      code: 'COUP_PLAN_MAX_CONSECUTIVE_INVALID',
      path: 'coupPlan.maxConsecutiveRounds',
      severity: 'error',
      message: `coupPlan.maxConsecutiveRounds must be an integer >= 1; received ${def.coupPlan.maxConsecutiveRounds}.`,
      suggestion: 'Set maxConsecutiveRounds to 1 or greater.',
    });
  }

  const declaredPhases = new Set(def.coupPlan.phases.map((phase) => phase.id));
  def.coupPlan.finalRoundOmitPhases?.forEach((phaseId, index) => {
    if (!declaredPhases.has(phaseId)) {
      diagnostics.push({
        code: 'COUP_PLAN_FINAL_ROUND_OMIT_UNKNOWN_PHASE',
        path: `coupPlan.finalRoundOmitPhases[${index}]`,
        severity: 'error',
        message: `Unknown coupPlan phase id "${phaseId}" in finalRoundOmitPhases.`,
        suggestion: 'Reference ids declared in coupPlan.phases.',
      });
    }
  });
};

const validateVictory = (diagnostics: Diagnostic[], def: GameDef, context: ValidationContext): void => {
  if (!def.victory) {
    return;
  }

  if (def.victory.checkpoints.length === 0) {
    diagnostics.push({
      code: 'VICTORY_CHECKPOINTS_EMPTY',
      path: 'victory.checkpoints',
      severity: 'error',
      message: 'victory.checkpoints must include at least one checkpoint definition.',
      suggestion: 'Define one or more deterministic checkpoint entries.',
    });
  }

  checkDuplicateIds(
    diagnostics,
    def.victory.checkpoints.map((checkpoint) => checkpoint.id),
    'DUPLICATE_VICTORY_CHECKPOINT_ID',
    'victory checkpoint id',
    'victory.checkpoints',
  );

  def.victory.checkpoints.forEach((checkpoint, index) => {
    if (typeof checkpoint.when !== 'object' || checkpoint.when === null || Array.isArray(checkpoint.when)) {
      diagnostics.push({
        code: 'VICTORY_CHECKPOINT_WHEN_INVALID',
        path: `victory.checkpoints[${index}].when`,
        severity: 'error',
        message: 'victory checkpoint "when" must be a condition object.',
        suggestion: 'Set checkpoint.when to a valid Condition AST object.',
      });
      return;
    }
    validateConditionAst(diagnostics, checkpoint.when as ConditionAST, `victory.checkpoints[${index}].when`, context);
  });

  def.victory.margins?.forEach((margin, index) => {
    const isLiteral =
      typeof margin.value === 'number' || typeof margin.value === 'string' || typeof margin.value === 'boolean';
    const isObject = typeof margin.value === 'object' && margin.value !== null && !Array.isArray(margin.value);
    if (!isLiteral && !isObject) {
      diagnostics.push({
        code: 'VICTORY_MARGIN_VALUE_INVALID',
        path: `victory.margins[${index}].value`,
        severity: 'error',
        message: 'victory margin value must be a ValueExpr-compatible literal or object.',
        suggestion: 'Use a literal or ValueExpr object.',
      });
      return;
    }
    validateValueExpr(diagnostics, margin.value as ValueExpr, `victory.margins[${index}].value`, context);
  });
};

export const validateGameDef = (def: GameDef): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  if (def.metadata.players.min < 1) {
    diagnostics.push({
      code: 'META_PLAYERS_MIN_INVALID',
      path: 'metadata.players.min',
      severity: 'error',
      message: `metadata.players.min must be >= 1; received ${def.metadata.players.min}.`,
    });
  }
  if (def.metadata.players.min > def.metadata.players.max) {
    diagnostics.push({
      code: 'META_PLAYERS_RANGE_INVALID',
      path: 'metadata.players',
      severity: 'error',
      message: `metadata.players.min (${def.metadata.players.min}) must be <= metadata.players.max (${def.metadata.players.max}).`,
    });
  }
  if (
    def.metadata.maxTriggerDepth !== undefined &&
    (!Number.isInteger(def.metadata.maxTriggerDepth) || def.metadata.maxTriggerDepth < 1)
  ) {
    diagnostics.push({
      code: 'META_MAX_TRIGGER_DEPTH_INVALID',
      path: 'metadata.maxTriggerDepth',
      severity: 'error',
      message: `metadata.maxTriggerDepth must be an integer >= 1; received ${def.metadata.maxTriggerDepth}.`,
    });
  }

  def.globalVars.forEach((variable, index) => {
    if (variable.min > variable.init || variable.init > variable.max) {
      diagnostics.push({
        code: 'VAR_BOUNDS_INVALID',
        path: `globalVars[${index}]`,
        severity: 'error',
        message: `Variable "${variable.name}" must satisfy min <= init <= max; received ${variable.min} <= ${variable.init} <= ${variable.max}.`,
      });
    }
  });
  def.perPlayerVars.forEach((variable, index) => {
    if (variable.min > variable.init || variable.init > variable.max) {
      diagnostics.push({
        code: 'VAR_BOUNDS_INVALID',
        path: `perPlayerVars[${index}]`,
        severity: 'error',
        message: `Variable "${variable.name}" must satisfy min <= init <= max; received ${variable.min} <= ${variable.init} <= ${variable.max}.`,
      });
    }
  });

  checkDuplicateIds(
    diagnostics,
    def.zones.map((zone) => zone.id),
    'DUPLICATE_ZONE_ID',
    'zone id',
    'zones',
  );
  checkDuplicateIds(
    diagnostics,
    def.tokenTypes.map((tokenType) => tokenType.id),
    'DUPLICATE_TOKEN_TYPE_ID',
    'token type id',
    'tokenTypes',
  );
  checkDuplicateIds(
    diagnostics,
    def.turnStructure.phases.map((phase) => phase.id),
    'DUPLICATE_PHASE_ID',
    'phase id',
    'turnStructure.phases',
  );
  checkDuplicateIds(
    diagnostics,
    def.actions.map((action) => action.id),
    'DUPLICATE_ACTION_ID',
    'action id',
    'actions',
  );
  checkDuplicateIds(
    diagnostics,
    def.triggers.map((trigger) => trigger.id),
    'DUPLICATE_TRIGGER_ID',
    'trigger id',
    'triggers',
  );
  checkDuplicateIds(
    diagnostics,
    def.globalVars.map((variable) => variable.name),
    'DUPLICATE_GLOBAL_VAR_NAME',
    'global var name',
    'globalVars',
  );
  checkDuplicateIds(
    diagnostics,
    def.perPlayerVars.map((variable) => variable.name),
    'DUPLICATE_PER_PLAYER_VAR_NAME',
    'per-player var name',
    'perPlayerVars',
  );
  checkDuplicateIds(
    diagnostics,
    (def.operationProfiles ?? []).map((operationProfile) => operationProfile.id),
    'DUPLICATE_OPERATION_PROFILE_ID',
    'operation profile id',
    'operationProfiles',
  );

  def.zones.forEach((zone, index) => {
    const qualifier = parseZoneSelector(zone.id).qualifier;

    if (zone.owner === 'none') {
      if (qualifier !== 'none') {
        diagnostics.push({
          code: 'ZONE_ID_OWNERSHIP_INVALID',
          path: `zones[${index}].id`,
          severity: 'error',
          message: `Unowned zone "${zone.id}" must use the :none qualifier to match owner "none".`,
          suggestion: `Rename zone id to use :none, or change owner to "player".`,
        });
      }
      return;
    }

    if (qualifier === null || !PLAYER_ZONE_QUALIFIER_PATTERN.test(qualifier)) {
      diagnostics.push({
        code: 'ZONE_ID_PLAYER_QUALIFIER_INVALID',
        path: `zones[${index}].id`,
        severity: 'error',
        message: `Player-owned zone "${zone.id}" must use a numeric owner qualifier (for example :0).`,
        suggestion: `Rename zone id to include a numeric player qualifier, or change owner to "none".`,
      });
      return;
    }

    const playerId = Number(qualifier);
    if (playerId > def.metadata.players.max - 1) {
      diagnostics.push({
        code: 'ZONE_ID_PLAYER_INDEX_OUT_OF_BOUNDS',
        path: `zones[${index}].id`,
        severity: 'error',
        message: `Player-owned zone "${zone.id}" targets player ${playerId}, which exceeds metadata.players.max (${def.metadata.players.max}).`,
        suggestion: `Use a qualifier in [0, ${def.metadata.players.max - 1}] or increase metadata.players.max.`,
      });
    }
  });

  const zoneCandidates = [...new Set(def.zones.map((zone) => zone.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const globalVarCandidates = [...new Set(def.globalVars.map((variable) => variable.name))].sort((left, right) =>
    left.localeCompare(right),
  );
  const perPlayerVarCandidates = [...new Set(def.perPlayerVars.map((variable) => variable.name))].sort(
    (left, right) => left.localeCompare(right),
  );
  const tokenTypeCandidates = [...new Set(def.tokenTypes.map((tokenType) => tokenType.id))].sort(
    (left, right) => left.localeCompare(right),
  );
  const phaseCandidates = [...new Set(def.turnStructure.phases.map((phase) => phase.id))].sort((left, right) =>
    left.localeCompare(right),
  );
  const actionCandidates = [...new Set(def.actions.map((action) => action.id))].sort((left, right) =>
    left.localeCompare(right),
  );

  const context = {
    zoneNames: new Set(zoneCandidates),
    zoneCandidates,
    zoneOwners: new Map(def.zones.map((zone) => [zone.id, zone.owner])),
    globalVarNames: new Set(globalVarCandidates),
    globalVarCandidates,
    perPlayerVarNames: new Set(perPlayerVarCandidates),
    perPlayerVarCandidates,
    tokenTypeNames: new Set(tokenTypeCandidates),
    tokenTypeCandidates,
    playerIdMin: 0,
    playerIdMaxInclusive: def.metadata.players.max - 1,
  };

  validateCoupPlan(diagnostics, def);
  validateVictory(diagnostics, def, context);

  def.setup.forEach((effect, index) => {
    validateEffectAst(diagnostics, effect, `setup[${index}]`, context);
  });

  def.actions.forEach((action, actionIndex) => {
    validatePlayerSelector(diagnostics, action.actor, `actions[${actionIndex}].actor`, context);

    if (!phaseCandidates.includes(action.phase)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `actions[${actionIndex}].phase`,
        `Unknown phase \"${action.phase}\".`,
        action.phase,
        phaseCandidates,
      );
    }

    action.params.forEach((param, paramIndex) => {
      validateOptionsQuery(diagnostics, param.domain, `actions[${actionIndex}].params[${paramIndex}].domain`, context);
    });

    if (action.pre) {
      validateConditionAst(diagnostics, action.pre, `actions[${actionIndex}].pre`, context);
    }

    action.cost.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `actions[${actionIndex}].cost[${effectIndex}]`, context);
    });
    action.effects.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `actions[${actionIndex}].effects[${effectIndex}]`, context);
    });
  });

  const operationActionIdCounts = new Map<string, number>();
  def.operationProfiles?.forEach((operationProfile, operationProfileIndex) => {
    const basePath = `operationProfiles[${operationProfileIndex}]`;

    if (!actionCandidates.includes(operationProfile.actionId)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_ACTION_MISSING',
        `${basePath}.actionId`,
        `Unknown action "${operationProfile.actionId}".`,
        operationProfile.actionId,
        actionCandidates,
      );
    }

    operationActionIdCounts.set(operationProfile.actionId, (operationActionIdCounts.get(operationProfile.actionId) ?? 0) + 1);

    if (operationProfile.resolution.length === 0) {
      diagnostics.push({
        code: 'OPERATION_PROFILE_RESOLUTION_EMPTY',
        path: `${basePath}.resolution`,
        severity: 'error',
        message: 'Operation profile resolution must contain at least one stage.',
        suggestion: 'Declare one or more deterministic resolution stages.',
      });
    }

    if (operationProfile.partialExecution.mode !== 'forbid' && operationProfile.partialExecution.mode !== 'allow') {
      diagnostics.push({
        code: 'OPERATION_PROFILE_PARTIAL_EXECUTION_MODE_INVALID',
        path: `${basePath}.partialExecution.mode`,
        severity: 'error',
        message: `Unsupported partial execution mode "${operationProfile.partialExecution.mode}".`,
        suggestion: 'Use "forbid" or "allow".',
      });
    }
  });

  // Post-loop: when multiple profiles share an actionId, all must have applicability
  for (const [actionId, count] of operationActionIdCounts) {
    if (count <= 1) {
      continue;
    }
    const profilesForAction = (def.operationProfiles ?? []).filter((p) => p.actionId === actionId);
    const missingApplicability = profilesForAction.some((p) => p.applicability === undefined);
    if (missingApplicability) {
      diagnostics.push({
        code: 'OPERATION_PROFILE_ACTION_MAPPING_AMBIGUOUS',
        path: 'operationProfiles',
        severity: 'error',
        message: `Multiple operation profiles map to action "${actionId}" but not all have an applicability condition.`,
        suggestion: 'When multiple profiles share an actionId, each must have an applicability condition for dispatch.',
      });
    }
  }

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  diagnostics.push(...validateAdjacency(adjacencyGraph, def.zones));

  def.turnStructure.phases.forEach((phase, phaseIndex) => {
    phase.onEnter?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.phases[${phaseIndex}].onEnter[${effectIndex}]`, context);
    });
    phase.onExit?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.phases[${phaseIndex}].onExit[${effectIndex}]`, context);
    });
  });

  def.triggers.forEach((trigger, triggerIndex) => {
    if (trigger.event.type === 'phaseEnter' || trigger.event.type === 'phaseExit') {
      if (!phaseCandidates.includes(trigger.event.phase)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_PHASE_MISSING',
          `triggers[${triggerIndex}].event.phase`,
          `Unknown phase \"${trigger.event.phase}\".`,
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
          `Unknown action \"${trigger.event.action}\".`,
          trigger.event.action,
          actionCandidates,
        );
      }
    }

    if (trigger.event.type === 'tokenEntered' && trigger.event.zone) {
      validateZoneSelector(diagnostics, trigger.event.zone, `triggers[${triggerIndex}].event.zone`, context);
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

  def.endConditions.forEach((endCondition, endConditionIndex) => {
    if (endCondition.result.type === 'win') {
      validatePlayerSelector(
        diagnostics,
        endCondition.result.player,
        `endConditions[${endConditionIndex}].result.player`,
        context,
      );
    }
    if (endCondition.result.type === 'score' && !def.scoring) {
      diagnostics.push({
        code: 'SCORING_REQUIRED_FOR_SCORE_RESULT',
        path: `endConditions[${endConditionIndex}].result`,
        severity: 'error',
        message: 'End condition with result.type "score" requires a scoring definition.',
        suggestion: 'Add def.scoring or change end condition result.type.',
      });
    }

    validateConditionAst(diagnostics, endCondition.when, `endConditions[${endConditionIndex}].when`, context);
  });

  if (def.scoring) {
    validateValueExpr(diagnostics, def.scoring.value, 'scoring.value', context);
    const usesScoreResult = def.endConditions.some((endCondition) => endCondition.result.type === 'score');
    if (!usesScoreResult) {
      diagnostics.push({
        code: 'SCORING_UNUSED',
        path: 'scoring',
        severity: 'warning',
        message: 'scoring is configured but no end condition uses result.type "score".',
        suggestion: 'Add a score-based end condition or remove scoring.',
      });
    }
  }

  return diagnostics;
};

const spaceMatchesFilter = (
  space: MapSpaceDef,
  filter: StackingConstraint['spaceFilter'],
): boolean => {
  if (filter.spaceIds !== undefined && filter.spaceIds.length > 0 && !filter.spaceIds.includes(space.id)) {
    return false;
  }
  if (filter.spaceTypes !== undefined && filter.spaceTypes.length > 0 && !filter.spaceTypes.includes(space.spaceType)) {
    return false;
  }
  if (filter.country !== undefined && filter.country.length > 0 && !filter.country.includes(space.country)) {
    return false;
  }
  if (filter.populationEquals !== undefined && space.population !== filter.populationEquals) {
    return false;
  }
  return true;
};

const placementMatchesPieceFilter = (
  placement: ScenarioPiecePlacement,
  filter: StackingConstraint['pieceFilter'],
): boolean => {
  if (
    filter.pieceTypeIds !== undefined &&
    filter.pieceTypeIds.length > 0 &&
    !filter.pieceTypeIds.includes(placement.pieceTypeId)
  ) {
    return false;
  }
  if (filter.factions !== undefined && filter.factions.length > 0 && !filter.factions.includes(placement.faction)) {
    return false;
  }
  return true;
};

export const validateInitialPlacementsAgainstStackingConstraints = (
  constraints: readonly StackingConstraint[],
  placements: readonly ScenarioPiecePlacement[],
  spaces: readonly MapSpaceDef[],
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const spaceMap = new Map(spaces.map((space) => [space.id, space]));

  for (const constraint of constraints) {
    const matchingSpaceIds = spaces
      .filter((space) => spaceMatchesFilter(space, constraint.spaceFilter))
      .map((space) => space.id);

    const matchingSpaceSet = new Set(matchingSpaceIds);

    const countBySpace = new Map<string, number>();
    for (const placement of placements) {
      if (!matchingSpaceSet.has(placement.spaceId)) {
        continue;
      }
      if (!placementMatchesPieceFilter(placement, constraint.pieceFilter)) {
        continue;
      }
      const current = countBySpace.get(placement.spaceId) ?? 0;
      countBySpace.set(placement.spaceId, current + placement.count);
    }

    for (const [spaceId, count] of countBySpace) {
      const space = spaceMap.get(spaceId);
      const spaceLabel = space ? `${spaceId} (${space.spaceType})` : spaceId;

      if (constraint.rule === 'prohibit' && count > 0) {
        diagnostics.push({
          code: 'STACKING_CONSTRAINT_VIOLATION',
          path: `stackingConstraints[${constraint.id}]`,
          severity: 'error',
          message: `Stacking violation: ${count} piece(s) in ${spaceLabel} violate constraint "${constraint.id}" (${constraint.description}).`,
          suggestion: `Remove the prohibited pieces from ${spaceId} or adjust the constraint.`,
        });
      }

      if (constraint.rule === 'maxCount' && constraint.maxCount !== undefined && count > constraint.maxCount) {
        diagnostics.push({
          code: 'STACKING_CONSTRAINT_VIOLATION',
          path: `stackingConstraints[${constraint.id}]`,
          severity: 'error',
          message: `Stacking violation: ${count} piece(s) in ${spaceLabel} exceed max ${constraint.maxCount} for constraint "${constraint.id}" (${constraint.description}).`,
          suggestion: `Reduce pieces in ${spaceId} to at most ${constraint.maxCount} or adjust the constraint.`,
        });
      }
    }
  }

  return diagnostics;
};
