import type { Diagnostic } from './diagnostics.js';
import type { Reference, ValueExpr } from './types.js';
import type { AstScopedVarScope } from './scoped-var-contract.js';
import { isCanonicalBindingIdentifier } from '../contracts/index.js';
import {
  type ValidationContext,
  pushMissingReferenceDiagnostic,
  validatePlayerSelector,
  validateZoneSelector,
} from './validate-gamedef-structure.js';

// ---------------------------------------------------------------------------
// Map-space helpers
// ---------------------------------------------------------------------------

export function validateStaticMapSpaceSelector(
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

export function validateMapSpacePropertyReference(
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

// ---------------------------------------------------------------------------
// Canonical binding validation
// ---------------------------------------------------------------------------

export const validateCanonicalBinding = (
  diagnostics: Diagnostic[],
  binding: string,
  path: string,
  code: string,
  messagePrefix: string,
): void => {
  if (isCanonicalBindingIdentifier(binding)) {
    return;
  }
  diagnostics.push({
    code,
    path,
    severity: 'error',
    message: `${messagePrefix} "${binding}" must be a canonical "$name" token.`,
    suggestion: 'Use a canonical binding token like "$candidate".',
  });
};

// ---------------------------------------------------------------------------
// Declared-binder policy
// ---------------------------------------------------------------------------

export const EFFECT_DECLARED_BINDER_POLICY_BY_PATTERN: Readonly<Record<string, { readonly code: string; readonly surface: string }>> = {
  'transferVar.actualBind': {
    code: 'EFFECT_TRANSFER_VAR_ACTUAL_BIND_INVALID',
    surface: 'transferVar.actualBind',
  },
  'forEach.bind': {
    code: 'EFFECT_FOR_EACH_BIND_INVALID',
    surface: 'forEach.bind',
  },
  'forEach.countBind': {
    code: 'EFFECT_FOR_EACH_COUNT_BIND_INVALID',
    surface: 'forEach.countBind',
  },
  'reduce.itemBind': {
    code: 'EFFECT_REDUCE_ITEM_BIND_INVALID',
    surface: 'reduce.itemBind',
  },
  'reduce.accBind': {
    code: 'EFFECT_REDUCE_ACC_BIND_INVALID',
    surface: 'reduce.accBind',
  },
  'reduce.resultBind': {
    code: 'EFFECT_REDUCE_RESULT_BIND_INVALID',
    surface: 'reduce.resultBind',
  },
  'evaluateSubset.subsetBind': {
    code: 'EFFECT_EVALUATE_SUBSET_BIND_INVALID',
    surface: 'evaluateSubset.subsetBind',
  },
  'evaluateSubset.resultBind': {
    code: 'EFFECT_EVALUATE_SUBSET_RESULT_BIND_INVALID',
    surface: 'evaluateSubset.resultBind',
  },
  'evaluateSubset.bestSubsetBind': {
    code: 'EFFECT_EVALUATE_SUBSET_BEST_BIND_INVALID',
    surface: 'evaluateSubset.bestSubsetBind',
  },
  'removeByPriority.remainingBind': {
    code: 'EFFECT_REMOVE_BY_PRIORITY_REMAINING_BIND_INVALID',
    surface: 'removeByPriority.remainingBind',
  },
  'removeByPriority.groups.*.bind': {
    code: 'EFFECT_REMOVE_BY_PRIORITY_BIND_INVALID',
    surface: 'removeByPriority.groups[].bind',
  },
  'removeByPriority.groups.*.countBind': {
    code: 'EFFECT_REMOVE_BY_PRIORITY_COUNT_BIND_INVALID',
    surface: 'removeByPriority.groups[].countBind',
  },
  'let.bind': {
    code: 'EFFECT_LET_BIND_INVALID',
    surface: 'let.bind',
  },
  'bindValue.bind': {
    code: 'EFFECT_BIND_VALUE_BIND_INVALID',
    surface: 'bindValue.bind',
  },
  'chooseOne.bind': {
    code: 'EFFECT_CHOOSE_ONE_BIND_INVALID',
    surface: 'chooseOne.bind',
  },
  'chooseN.bind': {
    code: 'EFFECT_CHOOSE_N_BIND_INVALID',
    surface: 'chooseN.bind',
  },
  'rollRandom.bind': {
    code: 'EFFECT_ROLL_RANDOM_BIND_INVALID',
    surface: 'rollRandom.bind',
  },
};

export function collectEffectDeclaredBinderPolicyPatternsForTest(): readonly string[] {
  return Object.keys(EFFECT_DECLARED_BINDER_POLICY_BY_PATTERN);
}

export function normalizeDeclaredBinderDiagnosticPath(path: string): string {
  return path.replace(/\.([0-9]+)(?=\.|$)/g, '[$1]');
}

// ---------------------------------------------------------------------------
// Reference validation
// ---------------------------------------------------------------------------

export const validateReference = (
  diagnostics: Diagnostic[],
  reference: Reference,
  path: string,
  context: ValidationContext,
): void => {
  if (reference.ref === 'capturedSequenceZones' && typeof reference.key !== 'string') {
    if (reference.key.ref === 'binding') {
      validateCanonicalBinding(
        diagnostics,
        reference.key.name,
        `${path}.key.name`,
        'REF_BINDING_INVALID',
        'capturedSequenceZones.key',
      );
    }
  }

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

  if (reference.ref === 'assetField') {
    const contract = context.tableContractsById.get(reference.tableId);
    if (contract === undefined) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_RUNTIME_TABLE_MISSING',
        `${path}.tableId`,
        `Unknown runtime table "${reference.tableId}".`,
        reference.tableId,
        context.tableContractCandidates,
      );
      return;
    }

    if (!contract.fields.some((field) => field.field === reference.field)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_RUNTIME_TABLE_FIELD_MISSING',
        `${path}.field`,
        `Unknown field "${reference.field}" in runtime table "${reference.tableId}".`,
        reference.field,
        contract.fields.map((field) => field.field),
      );
    }
    return;
  }
};

// ---------------------------------------------------------------------------
// Value expression helpers
// ---------------------------------------------------------------------------

export const tryStaticStringValue = (valueExpr: ValueExpr): string | null => {
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

export const validateMarkerStateLiteral = (
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

// ---------------------------------------------------------------------------
// Scoped variable helpers
// ---------------------------------------------------------------------------

export const validateScopedVarReference = (
  diagnostics: Diagnostic[],
  scope: AstScopedVarScope,
  variable: string,
  path: string,
  context: ValidationContext,
): void => {
  if (scope === 'global') {
    if (!context.globalVarNames.has(variable)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_GVAR_MISSING',
        path,
        `Unknown global variable "${variable}".`,
        variable,
        context.globalVarCandidates,
      );
    }
    return;
  }

  if (scope === 'pvar') {
    if (!context.perPlayerVarNames.has(variable)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PVAR_MISSING',
        path,
        `Unknown per-player variable "${variable}".`,
        variable,
        context.perPlayerVarCandidates,
      );
    }
    return;
  }

  if (!context.zoneVarNames.has(variable)) {
    pushMissingReferenceDiagnostic(
      diagnostics,
      'REF_ZONEVAR_MISSING',
      path,
      `Unknown zone variable "${variable}".`,
      variable,
      context.zoneVarCandidates,
    );
  }
};

export const getBooleanCapableScopedVarType = (
  scope: Exclude<AstScopedVarScope, 'zoneVar'>,
  variable: string,
  context: ValidationContext,
): 'int' | 'boolean' | undefined => {
  if (scope === 'global') {
    return context.globalVarTypesByName.get(variable);
  }
  return context.perPlayerVarTypesByName.get(variable);
};
