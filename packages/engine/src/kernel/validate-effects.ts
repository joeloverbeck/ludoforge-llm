import type { Diagnostic } from './diagnostics.js';
import type {
  ConditionAST,
  EffectAST,
  ValueExpr,
} from './types.js';
import {
  appendEffectConditionSurfacePath,
  collectDeclaredBinderCandidatesFromEffectNode,
  CONDITION_SURFACE_SUFFIX,
  collectTurnFlowFreeOperationGrantContractViolations,
  renderTurnFlowFreeOperationGrantContractViolation,
  TURN_FLOW_ACTION_CLASS_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_PROGRESSION_POLICY_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES,
  type TurnFlowFreeOperationGrantContractViolationCode,
} from '../contracts/index.js';
import {
  type ValidationContext,
  pushMissingReferenceDiagnostic,
  validatePlayerSelector,
} from './validate-gamedef-structure.js';
import {
  getNestedEffectSequenceContextScopes,
  ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE,
  type EffectSequenceContextScope,
} from './effect-sequence-context-scope.js';
import {
  validateCanonicalBinding,
  EFFECT_DECLARED_BINDER_POLICY_BY_PATTERN,
  normalizeDeclaredBinderDiagnosticPath,
  validateScopedVarReference,
  getBooleanCapableScopedVarType,
  tryStaticStringValue,
  validateMarkerStateLiteral,
} from './validate-behavior-shared.js';
import { validateScopedVarNameExpr } from './validate-behavior-shared.js';
import { tryStaticScopedVarNameExpr } from './scoped-var-name-resolution.js';
import { validateValueExpr, validateNumericValueExpr, validateZoneRef } from './validate-values.js';
import { validateConditionAst } from './validate-conditions.js';
import {
  validateOptionsQuery,
  validateChoiceOptionsQueryContract,
  validateTokenFilter,
} from './validate-queries.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FreeOperationGrantValidationTarget = {
  readonly operationClass: string;
  readonly uses?: number;
  readonly viabilityPolicy?: string | null;
  readonly moveZoneBindings?: readonly unknown[] | null;
  readonly moveZoneProbeBindings?: readonly unknown[] | null;
  readonly sequence?: {
    readonly step?: unknown;
  };
  readonly sequenceContext?: {
    readonly captureMoveZoneCandidatesAs?: unknown;
    readonly requireMoveZoneCandidatesFrom?: unknown;
  };
  readonly executionContext?: Readonly<Record<string, unknown>>;
  readonly zoneFilter?: ConditionAST;
};

// ---------------------------------------------------------------------------
// Grant contract diagnostics
// ---------------------------------------------------------------------------

const FREE_OPERATION_GRANT_DIAGNOSTIC_BY_VIOLATION_CODE = {
  operationClassInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_CLASS_INVALID',
    suggestion: () => `Use one of: ${TURN_FLOW_ACTION_CLASS_VALUES.join('|')}.`,
  },
  usesInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_USES_INVALID',
    suggestion: () => 'Set uses to an integer >= 1.',
  },
  viabilityPolicyInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_VIABILITY_POLICY_INVALID',
    suggestion: () => `Use one of: ${TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES.join('|')}.`,
  },
  moveZoneBindingsInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_MOVE_ZONE_BINDINGS_INVALID',
    suggestion: () => 'Set moveZoneBindings to a non-empty string array of bound move-zone names.',
  },
  moveZoneProbeBindingsInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_MOVE_ZONE_PROBE_BINDINGS_INVALID',
    suggestion: () => 'Set moveZoneProbeBindings to a non-empty string array of bound move-zone names.',
  },
  completionPolicyInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_COMPLETION_POLICY_INVALID',
    suggestion: () => `Use one of: ${TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES.join('|')}.`,
  },
  outcomePolicyInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_OUTCOME_POLICY_INVALID',
    suggestion: () => `Use one of: ${TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES.join('|')}.`,
  },
  postResolutionTurnFlowInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_POST_RESOLUTION_TURN_FLOW_INVALID',
    suggestion: () => `Use one of: ${TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES.join('|')}.`,
  },
  progressionPolicyInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_PROGRESSION_POLICY_INVALID',
    suggestion: () => `Use one of: ${TURN_FLOW_FREE_OPERATION_GRANT_PROGRESSION_POLICY_VALUES.join('|')}.`,
  },
  requiredPostResolutionTurnFlowMissing: {
    code: 'EFFECT_GRANT_FREE_OPERATION_POST_RESOLUTION_TURN_FLOW_REQUIRED',
    suggestion: (label: string) => `Set ${label}.postResolutionTurnFlow to ${TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES.join('|')}.`,
  },
  postResolutionTurnFlowRequiresRequiredCompletionPolicy: {
    code: 'EFFECT_GRANT_FREE_OPERATION_COMPLETION_POLICY_REQUIRED',
    suggestion: (label: string) => `Set ${label}.completionPolicy to ${TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES.join('|')}.`,
  },
  sequenceBatchInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_INVALID',
    suggestion: () => 'Set sequence.batch to a non-empty string.',
  },
  sequenceStepInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_INVALID',
    suggestion: () => 'Set sequence.step to an integer >= 0.',
  },
  sequenceContextInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID',
    suggestion: () => 'Set captureMoveZoneCandidatesAs and/or requireMoveZoneCandidatesFrom to non-empty strings.',
  },
  sequenceContextRequiresSequence: {
    code: 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID',
    suggestion: () => 'Declare sequence.batch and sequence.step when using sequenceContext.',
  },
  executionContextInvalid: {
    code: 'EFFECT_GRANT_FREE_OPERATION_EXECUTION_CONTEXT_INVALID',
    suggestion: () => 'Set executionContext to an object whose values are scalar literals, scalar arrays, or ValueExpr-compatible objects.',
  },
} satisfies Record<TurnFlowFreeOperationGrantContractViolationCode, {
  readonly code: string;
  readonly suggestion: (label: string) => string;
}>;

// ---------------------------------------------------------------------------
// Grant contract validation
// ---------------------------------------------------------------------------

export const validateFreeOperationGrantContract = (
  diagnostics: Diagnostic[],
  grant: FreeOperationGrantValidationTarget,
  path: string,
  context: ValidationContext,
  options?: {
    readonly label?: string;
  },
): void => {
  const label = options?.label ?? 'grantFreeOperation';
  for (const violation of collectTurnFlowFreeOperationGrantContractViolations(grant)) {
    const surface = renderTurnFlowFreeOperationGrantContractViolation(violation, {
      basePath: path,
      label,
    });
    const diagnostic = FREE_OPERATION_GRANT_DIAGNOSTIC_BY_VIOLATION_CODE[violation.code];
    diagnostics.push({
      code: diagnostic.code,
      path: surface.path,
      severity: 'error',
      message: surface.message,
      suggestion: diagnostic.suggestion(label),
    });
  }
  if (grant.executionContext !== undefined) {
    for (const [key, value] of Object.entries(grant.executionContext)) {
      if (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
      ) {
        validateValueExpr(diagnostics, value as ValueExpr, `${path}.executionContext.${key}`, context);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Declared canonical bindings
// ---------------------------------------------------------------------------

const validateDeclaredCanonicalBindingsOnEffect = (
  diagnostics: Diagnostic[],
  effect: EffectAST,
  path: string,
): void => {
  for (const candidate of collectDeclaredBinderCandidatesFromEffectNode(effect as unknown as Record<string, unknown>)) {
    if (typeof candidate.value !== 'string') {
      continue;
    }
    const policy = EFFECT_DECLARED_BINDER_POLICY_BY_PATTERN[candidate.pattern];
    if (policy === undefined) {
      continue;
    }
    validateCanonicalBinding(
      diagnostics,
      candidate.value,
      `${path}.${normalizeDeclaredBinderDiagnosticPath(candidate.path)}`,
      policy.code,
      policy.surface,
    );
  }
};

// ---------------------------------------------------------------------------
// Effect AST validation
// ---------------------------------------------------------------------------

const DEFAULT_EFFECT_VALIDATION_SCOPE = ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE;

export const validateEffectAst = (
  diagnostics: Diagnostic[],
  effect: EffectAST,
  path: string,
  context: ValidationContext,
  scope: EffectSequenceContextScope = DEFAULT_EFFECT_VALIDATION_SCOPE,
): void => {
  validateDeclaredCanonicalBindingsOnEffect(diagnostics, effect, path);

  if ('setVar' in effect) {
    validateScopedVarReference(diagnostics, effect.setVar.scope, effect.setVar.var, `${path}.setVar.var`, context);

    if (effect.setVar.scope === 'pvar') {
      validatePlayerSelector(diagnostics, effect.setVar.player, `${path}.setVar.player`, context);
    }

    if (effect.setVar.scope === 'zoneVar') {
      validateZoneRef(diagnostics, effect.setVar.zone, `${path}.setVar.zone`, context);
    }

    validateValueExpr(diagnostics, effect.setVar.value, `${path}.setVar.value`, context);
    return;
  }

  if ('setActivePlayer' in effect) {
    validatePlayerSelector(diagnostics, effect.setActivePlayer.player, `${path}.setActivePlayer.player`, context);
    return;
  }

  if ('addVar' in effect) {
    validateScopedVarReference(diagnostics, effect.addVar.scope, effect.addVar.var, `${path}.addVar.var`, context);

    if (effect.addVar.scope === 'pvar') {
      validatePlayerSelector(diagnostics, effect.addVar.player, `${path}.addVar.player`, context);
    }

    if (effect.addVar.scope === 'zoneVar') {
      validateZoneRef(diagnostics, effect.addVar.zone, `${path}.addVar.zone`, context);
    }

    if (effect.addVar.scope !== 'zoneVar') {
      const varType = getBooleanCapableScopedVarType(effect.addVar.scope, effect.addVar.var, context);
      if (varType === 'boolean') {
        diagnostics.push({
          code: 'ADDVAR_BOOLEAN_TARGET_INVALID',
          path: `${path}.addVar.var`,
          severity: 'error',
          message: `addVar cannot target boolean variable "${effect.addVar.var}".`,
          suggestion: 'Use setVar with a boolean value expression for boolean variables.',
        });
      }
    }

    validateNumericValueExpr(diagnostics, effect.addVar.delta, `${path}.addVar.delta`, context);
    return;
  }

  if ('transferVar' in effect) {
    const transferEndpoints = [
      { key: 'from', endpoint: effect.transferVar.from },
      { key: 'to', endpoint: effect.transferVar.to },
    ] as const;

    for (const { key, endpoint } of transferEndpoints) {
      const endpointPath = `${path}.transferVar.${key}`;
      const varPath = `${endpointPath}.var`;
      validateScopedVarNameExpr(diagnostics, endpoint.var, varPath);
      const staticVariable = tryStaticScopedVarNameExpr(endpoint.var);

      if (endpoint.scope === 'global') {
        if (staticVariable !== null && !context.globalVarNames.has(staticVariable)) {
          pushMissingReferenceDiagnostic(
            diagnostics,
            'REF_GVAR_MISSING',
            varPath,
            `Unknown global variable "${staticVariable}".`,
            staticVariable,
            context.globalVarCandidates,
          );
        }
        if (staticVariable !== null && context.globalVarTypesByName.get(staticVariable) === 'boolean') {
          diagnostics.push({
            code: 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID',
            path: varPath,
            severity: 'error',
            message: `transferVar cannot target boolean variable "${staticVariable}".`,
            suggestion: 'Use integer variables for transferVar source and destination.',
          });
        }
        continue;
      }

      if (endpoint.scope === 'pvar') {
        if (staticVariable !== null && !context.perPlayerVarNames.has(staticVariable)) {
          pushMissingReferenceDiagnostic(
            diagnostics,
            'REF_PVAR_MISSING',
            varPath,
            `Unknown per-player variable "${staticVariable}".`,
            staticVariable,
            context.perPlayerVarCandidates,
          );
        }
        if (staticVariable !== null && context.perPlayerVarTypesByName.get(staticVariable) === 'boolean') {
          diagnostics.push({
            code: 'EFFECT_TRANSFER_VAR_BOOLEAN_TARGET_INVALID',
            path: varPath,
            severity: 'error',
            message: `transferVar cannot target boolean variable "${staticVariable}".`,
            suggestion: 'Use integer variables for transferVar source and destination.',
          });
        }
        validatePlayerSelector(diagnostics, endpoint.player, `${endpointPath}.player`, context);
        continue;
      }

      if (staticVariable !== null && !context.zoneVarNames.has(staticVariable)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_ZONEVAR_MISSING',
          varPath,
          `Unknown zone variable "${staticVariable}".`,
          staticVariable,
          context.zoneVarCandidates,
        );
      }
      validateZoneRef(diagnostics, endpoint.zone, `${endpointPath}.zone`, context);
    }

    validateNumericValueExpr(diagnostics, effect.transferVar.amount, `${path}.transferVar.amount`, context);
    if (effect.transferVar.min !== undefined) {
      validateNumericValueExpr(diagnostics, effect.transferVar.min, `${path}.transferVar.min`, context);
    }
    if (effect.transferVar.max !== undefined) {
      validateNumericValueExpr(diagnostics, effect.transferVar.max, `${path}.transferVar.max`, context);
    }
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
      validateConditionAst(
        diagnostics,
        effect.moveAll.filter,
        appendEffectConditionSurfacePath(path, CONDITION_SURFACE_SUFFIX.effect.moveAllFilter),
        context,
      );
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

  if ('reveal' in effect) {
    validateZoneRef(diagnostics, effect.reveal.zone, `${path}.reveal.zone`, context);
    if (effect.reveal.to !== 'all') {
      validatePlayerSelector(diagnostics, effect.reveal.to, `${path}.reveal.to`, context);
    }
    validateTokenFilter(diagnostics, effect.reveal.filter, `${path}.reveal.filter`, context);
    return;
  }

  if ('conceal' in effect) {
    validateZoneRef(diagnostics, effect.conceal.zone, `${path}.conceal.zone`, context);
    if (effect.conceal.from !== undefined && effect.conceal.from !== 'all') {
      validatePlayerSelector(diagnostics, effect.conceal.from, `${path}.conceal.from`, context);
    }
    validateTokenFilter(diagnostics, effect.conceal.filter, `${path}.conceal.filter`, context);
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
    validateConditionAst(
      diagnostics,
      effect.if.when,
      appendEffectConditionSurfacePath(path, CONDITION_SURFACE_SUFFIX.effect.ifWhen),
      context,
    );
    getNestedEffectSequenceContextScopes(effect, scope).forEach((nestedScope) => {
      nestedScope.effects.forEach((entry, index) => {
        validateEffectAst(diagnostics, entry, `${path}${nestedScope.pathSuffix}[${index}]`, context, nestedScope.scope);
      });
    });
    return;
  }

  if ('forEach' in effect) {
    validateOptionsQuery(diagnostics, effect.forEach.over, `${path}.forEach.over`, context);
    if (effect.forEach.limit !== undefined) {
      validateNumericValueExpr(diagnostics, effect.forEach.limit, `${path}.forEach.limit`, context);
    }
    getNestedEffectSequenceContextScopes(effect, scope).forEach((nestedScope) => {
      nestedScope.effects.forEach((entry, index) => {
        validateEffectAst(diagnostics, entry, `${path}${nestedScope.pathSuffix}[${index}]`, context, nestedScope.scope);
      });
    });
    return;
  }

  if ('reduce' in effect) {
    validateOptionsQuery(diagnostics, effect.reduce.over, `${path}.reduce.over`, context);
    validateValueExpr(diagnostics, effect.reduce.initial, `${path}.reduce.initial`, context);
    validateValueExpr(diagnostics, effect.reduce.next, `${path}.reduce.next`, context);
    if (effect.reduce.limit !== undefined) {
      validateNumericValueExpr(diagnostics, effect.reduce.limit, `${path}.reduce.limit`, context);
    }
    if (
      effect.reduce.itemBind === effect.reduce.accBind
      || effect.reduce.itemBind === effect.reduce.resultBind
      || effect.reduce.accBind === effect.reduce.resultBind
    ) {
      diagnostics.push({
        code: 'REDUCE_BINDING_CONFLICT',
        path: `${path}.reduce`,
        severity: 'error',
        message: 'reduce requires distinct itemBind, accBind, and resultBind identifiers.',
        suggestion: 'Use unique binding names for item, accumulator, and reduced result.',
      });
    }
    getNestedEffectSequenceContextScopes(effect, scope).forEach((nestedScope) => {
      nestedScope.effects.forEach((entry, index) => {
        validateEffectAst(diagnostics, entry, `${path}${nestedScope.pathSuffix}[${index}]`, context, nestedScope.scope);
      });
    });
    return;
  }

  if ('evaluateSubset' in effect) {
    validateOptionsQuery(diagnostics, effect.evaluateSubset.source, `${path}.evaluateSubset.source`, context);
    validateNumericValueExpr(diagnostics, effect.evaluateSubset.subsetSize, `${path}.evaluateSubset.subsetSize`, context);
    validateNumericValueExpr(diagnostics, effect.evaluateSubset.scoreExpr, `${path}.evaluateSubset.scoreExpr`, context);
    getNestedEffectSequenceContextScopes(effect, scope).forEach((nestedScope) => {
      nestedScope.effects.forEach((entry, index) => {
        validateEffectAst(diagnostics, entry, `${path}${nestedScope.pathSuffix}[${index}]`, context, nestedScope.scope);
      });
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
    getNestedEffectSequenceContextScopes(effect, scope).forEach((nestedScope) => {
      nestedScope.effects.forEach((entry, index) => {
        validateEffectAst(diagnostics, entry, `${path}${nestedScope.pathSuffix}[${index}]`, context, nestedScope.scope);
      });
    });
    return;
  }

  if ('let' in effect) {
    validateValueExpr(diagnostics, effect.let.value, `${path}.let.value`, context);
    getNestedEffectSequenceContextScopes(effect, scope).forEach((nestedScope) => {
      nestedScope.effects.forEach((entry, index) => {
        validateEffectAst(diagnostics, entry, `${path}${nestedScope.pathSuffix}[${index}]`, context, nestedScope.scope);
      });
    });
    return;
  }

  if ('bindValue' in effect) {
    validateValueExpr(diagnostics, effect.bindValue.value, `${path}.bindValue.value`, context);
    return;
  }

  if ('chooseOne' in effect) {
    const optionsPath = `${path}.chooseOne.options`;
    validateChoiceOptionsQueryContract(diagnostics, effect.chooseOne.options, optionsPath, context, 'chooseOne');
    return;
  }

  if ('setTokenProp' in effect) {
    validateValueExpr(diagnostics, effect.setTokenProp.value, `${path}.setTokenProp.value`, context);
    return;
  }

  if ('rollRandom' in effect) {
    validateNumericValueExpr(diagnostics, effect.rollRandom.min, `${path}.rollRandom.min`, context);
    validateNumericValueExpr(diagnostics, effect.rollRandom.max, `${path}.rollRandom.max`, context);
    getNestedEffectSequenceContextScopes(effect, scope).forEach((nestedScope) => {
      nestedScope.effects.forEach((entry, index) => {
        validateEffectAst(diagnostics, entry, `${path}${nestedScope.pathSuffix}[${index}]`, context, nestedScope.scope);
      });
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
    validateFreeOperationGrantContract(
      diagnostics,
      grant,
      `${path}.grantFreeOperation`,
      context,
      {
        label: 'grantFreeOperation',
      },
    );
    if (grant.zoneFilter !== undefined) {
      validateConditionAst(
        diagnostics,
        grant.zoneFilter,
        appendEffectConditionSurfacePath(path, CONDITION_SURFACE_SUFFIX.effect.grantFreeOperationZoneFilter),
        context,
      );
    }
    if (grant.sequenceContext !== undefined && !scope.allowsPersistentSequenceContextGrants) {
      diagnostics.push({
        code: 'EFFECT_GRANT_FREE_OPERATION_SEQUENCE_CONTEXT_SCOPE_UNSUPPORTED',
        path: `${path}.grantFreeOperation.sequenceContext`,
        severity: 'error',
        message: 'grantFreeOperation.sequenceContext is not supported inside evaluateSubset.compute because compute-state grants are not persistent.',
        suggestion: 'Move the sequence-context grant to a persistent effect scope such as evaluateSubset.in or another enclosing effect list.',
      });
    }
    return;
  }

  if ('gotoPhaseExact' in effect) {
    if (!context.turnPhaseNames.has(effect.gotoPhaseExact.phase)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `${path}.gotoPhaseExact.phase`,
        `Unknown turn phase "${effect.gotoPhaseExact.phase}".`,
        effect.gotoPhaseExact.phase,
        context.turnPhaseCandidates,
      );
    }
    return;
  }

  if ('advancePhase' in effect) {
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

  const optionsPath = `${path}.chooseN.options`;
  validateChoiceOptionsQueryContract(diagnostics, effect.chooseN.options, optionsPath, context, 'chooseN');
};
