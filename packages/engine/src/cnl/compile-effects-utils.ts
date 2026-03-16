import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  ConditionAST,
  EffectAST,
  MacroOrigin,
  OptionsQuery,
  PlayerSel,
  ZoneRef,
} from '../kernel/types.js';
import { inferQueryDomainKinds, type QueryDomainKind } from '../kernel/query-domain-kinds.js';
import {
  buildChoiceOptionsRuntimeShapeDiagnostic,
  CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES,
} from '../kernel/choice-options-runtime-shape-diagnostic.js';
import {
  collectDeclaredBinderCandidatesFromEffectNode,
  isCanonicalBindingIdentifier,
} from '../contracts/index.js';
import { collectDeclaredBinderCandidates } from './binder-surface-registry.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  lowerValueNode,
  type ConditionLoweringContext,
} from './compile-conditions.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import { canonicalizeZoneSelector } from './compile-zones.js';
import { isTrustedMacroOriginCarrier } from './macro-origin-trust.js';
import { collectReservedCompilerMetadataKeyOccurrencesOnRecord } from './reserved-compiler-metadata.js';
import type { EffectLoweringContext, EffectLoweringResult, QueryDomainContract } from './compile-effects-types.js';
import { RESERVED_COMPILER_BINDING_PREFIX, TRUSTED_COMPILER_BINDING_PREFIXES } from './compile-effects-types.js';
import type { BindingScope } from './compile-effects-binding-scope.js';
import { registerSequentialBinding } from './compile-effects-binding-scope.js';

// Forward declaration — lowerEffectNode is in compile-effects-core.ts
// We accept it as a parameter to avoid circular dependency
type LowerEffectNodeFn = (
  source: unknown,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
) => EffectLoweringResult<readonly EffectAST[]>;

let _lowerEffectNode: LowerEffectNodeFn | null = null;

export function setLowerEffectNode(fn: LowerEffectNodeFn): void {
  _lowerEffectNode = fn;
}

export function lowerNestedEffects(
  source: readonly unknown[],
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<readonly EffectAST[]> {
  if (_lowerEffectNode === null) {
    throw new Error('lowerEffectNode not initialized — call setLowerEffectNode first');
  }
  const diagnostics: Diagnostic[] = [];
  const values: EffectAST[] = [];
  let loweredEntryCount = 0;
  source.forEach((entry, index) => {
    const lowered = _lowerEffectNode!(entry, context, scope, `${path}.${index}`);
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value !== null) {
      loweredEntryCount += 1;
      for (const loweredEffect of lowered.value) {
        values.push(loweredEffect);
        registerSequentialBinding(loweredEffect, scope);
      }
    }
  });
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') && loweredEntryCount !== source.length) {
    return { value: null, diagnostics };
  }
  return { value: values, diagnostics };
}

export function lowerZoneSelector(
  source: unknown,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<ZoneRef> {
  if (typeof source === 'string') {
    const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path, context.seatIds, context.zoneIdSet);
    if (zone.value === null) {
      return { value: null, diagnostics: zone.diagnostics };
    }

    const diagnostics = validateZoneQualifierBinding(zone.value, scope, path);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return { value: null, diagnostics };
    }
    return { value: zone.value, diagnostics };
  }

  if (!isRecord(source)) {
    return {
      value: null,
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
          path,
          severity: 'error',
          message: 'Zone selector must be a string or { zoneExpr: <ValueExpr> }.',
          suggestion: 'Use "zoneBase:qualifier" for static selectors, or wrap dynamic selectors in { zoneExpr: ... }.',
        },
      ],
    };
  }

  if (!('zoneExpr' in source)) {
    return {
      value: null,
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
          path,
          severity: 'error',
          message: 'Dynamic zone selectors must use explicit { zoneExpr: <ValueExpr> }.',
          suggestion: 'Wrap dynamic zone selectors in { zoneExpr: ... }.',
        },
      ],
    };
  }

  const valueResult = lowerValueNode(source.zoneExpr, makeConditionContext(context, scope), `${path}.zoneExpr`);
  if (valueResult.value === null) {
    return { value: null, diagnostics: valueResult.diagnostics };
  }
  return { value: { zoneExpr: valueResult.value }, diagnostics: valueResult.diagnostics };
}

export function lowerPlayerSelector(
  source: unknown,
  scope: BindingScope,
  path: string,
  seatIds?: readonly string[],
): EffectLoweringResult<PlayerSel> {
  const selector = normalizePlayerSelector(source, path, seatIds);
  if (selector.value === null) {
    return selector;
  }
  if (typeof selector.value === 'object' && 'chosen' in selector.value) {
    const diagnostics = validateBindingReference(selector.value.chosen, scope, path);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return { value: null, diagnostics };
    }
    return {
      value: selector.value,
      diagnostics,
    };
  }
  return selector;
}

export function validateZoneQualifierBinding(zoneSelector: string, scope: BindingScope, path: string): readonly Diagnostic[] {
  const splitIndex = zoneSelector.indexOf(':');
  if (splitIndex < 0) {
    return [];
  }
  const qualifier = zoneSelector.slice(splitIndex + 1);
  return validatePrefixedBindingReference(qualifier, scope, path);
}

export function validateBindingReference(value: string, scope: BindingScope, path: string): readonly Diagnostic[] {
  if (scope.has(value)) {
    return [];
  }
  return [
    {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_UNBOUND,
      path,
      severity: 'error',
      message: `Unbound binding reference "${value}".`,
      suggestion: 'Use a binding declared by action params or an in-scope effect binder.',
      alternatives: scope.alternativesFor(value),
    },
  ];
}

export function validatePrefixedBindingReference(value: string, scope: BindingScope, path: string): readonly Diagnostic[] {
  if (!value.startsWith('$')) {
    return [];
  }
  return validateBindingReference(value, scope, path);
}

export function makeConditionContext(context: EffectLoweringContext, scope: BindingScope): ConditionLoweringContext {
  return {
    ownershipByBase: context.ownershipByBase,
    bindingScope: scope.visibleBindings(),
    ...(context.zoneIdSet === undefined ? {} : { zoneIdSet: context.zoneIdSet }),
    ...(context.tokenTraitVocabulary === undefined ? {} : { tokenTraitVocabulary: context.tokenTraitVocabulary }),
    ...(context.tokenFilterProps === undefined ? {} : { tokenFilterProps: context.tokenFilterProps }),
    ...(context.namedSets === undefined ? {} : { namedSets: context.namedSets }),
    ...(context.typeInference === undefined ? {} : { typeInference: context.typeInference }),
    ...(context.seatIds === undefined ? {} : { seatIds: context.seatIds }),
  };
}

export function missingCapability<TValue>(
  path: string,
  construct: string,
  actual: unknown,
  alternatives?: readonly string[],
): EffectLoweringResult<TValue> {
  return {
    value: null,
    diagnostics: [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path,
        severity: 'error',
        message: `Cannot lower ${construct} to kernel AST: ${formatValue(actual)}.`,
        suggestion: 'Rewrite this node to a supported kernel-compatible shape.',
        ...(alternatives === undefined ? {} : { alternatives: [...alternatives] }),
      },
    ],
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function makeSyntheticBinding(path: string, suffix: string): string {
  const stem = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `$__${suffix}_${stem}`;
}

export function readMacroOrigin(
  value: unknown,
  carrier: Record<string, unknown>,
  path: string,
): EffectLoweringResult<MacroOrigin | undefined> {
  if (value === undefined) {
    return { value: undefined, diagnostics: [] };
  }
  if (!isRecord(value) || typeof value.macroId !== 'string' || typeof value.stem !== 'string') {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MACRO_ORIGIN_INVALID,
        path,
        severity: 'error',
        message: 'macroOrigin must be { macroId: string, stem: string } when present.',
        suggestion: 'Remove macroOrigin from authored YAML; compiler expansion manages this field.',
      }],
    };
  }
  if (!isTrustedMacroOriginCarrier(carrier)) {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED,
        path,
        severity: 'error',
        message: 'macroOrigin is compiler-owned metadata and cannot be authored directly.',
        suggestion: 'Remove macroOrigin from authored YAML and rely on effect macro expansion.',
      }],
    };
  }
  return {
    value: {
      macroId: value.macroId,
      stem: value.stem,
    },
    diagnostics: [],
  };
}

export function conditionFingerprint(condition: ConditionAST): string | null {
  try {
    return JSON.stringify(condition);
  } catch {
    return null;
  }
}

export function collectReservedCompilerMetadataDiagnostics(
  value: unknown,
  path: string,
): readonly Diagnostic[] {
  return collectReservedCompilerMetadataKeyOccurrencesOnRecord(value, path).map((occurrence) => ({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_RESERVED_COMPILER_METADATA_FORBIDDEN,
    path: occurrence.path,
    severity: 'error',
    message: `${occurrence.key} is reserved compiler metadata and cannot be authored directly.`,
    suggestion: `Remove ${occurrence.key} from authored YAML.`,
  }));
}

export function collectReservedCompilerBindingNamespaceDiagnostics(
  source: Record<string, unknown>,
  path: string,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const candidate of collectDeclaredBinderCandidates(source)) {
    if (typeof candidate.value !== 'string' || !candidate.value.startsWith(RESERVED_COMPILER_BINDING_PREFIX)) {
      continue;
    }
    const bindingValue = candidate.value;
    if (TRUSTED_COMPILER_BINDING_PREFIXES.some((prefix) => bindingValue.startsWith(prefix))) {
      continue;
    }
    if (isTrustedCompilerMacroBinderCandidate(source, candidate.path)) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_RESERVED_BINDING_NAMESPACE_FORBIDDEN,
      path: `${path}.${candidate.path}`,
      severity: 'error',
      message: `Binding "${bindingValue}" uses compiler-owned namespace "${RESERVED_COMPILER_BINDING_PREFIX}".`,
      suggestion: 'Rename authored binders to a non-reserved identifier such as "$token" or "$choice".',
    });
  }
  return diagnostics;
}

function isTrustedCompilerMacroBinderCandidate(source: Record<string, unknown>, binderPath: string): boolean {
  const segments = binderPath.split('.');
  const kind = segments[0];
  if (kind === undefined || !isRecord(source[kind])) {
    return false;
  }
  const effectBody = source[kind];

  if (kind === 'forEach') {
    return isTrustedMacroOriginCarrier(effectBody);
  }
  if (kind === 'reduce') {
    const bindField = segments[1];
    if (bindField === 'itemBind') {
      return isTrustedMacroOriginCarrier(effectBody);
    }
    if (bindField === 'accBind') {
      return isTrustedMacroOriginCarrier(effectBody);
    }
    if (bindField === 'resultBind') {
      return isTrustedMacroOriginCarrier(effectBody);
    }
    return false;
  }
  if (kind === 'removeByPriority') {
    if (segments[1] !== 'groups') {
      return false;
    }
    const groupIndex = Number.parseInt(segments[2] ?? '', 10);
    if (!Number.isInteger(groupIndex) || !Array.isArray(effectBody.groups)) {
      return false;
    }
    const group = effectBody.groups[groupIndex];
    if (!isRecord(group)) {
      return false;
    }
    return isTrustedMacroOriginCarrier(group);
  }

  return false;
}

function normalizeDeclaredBinderDiagnosticPath(path: string): string {
  return path;
}

function normalizeDeclaredBinderSurface(pattern: string): string {
  return pattern.replace(/\.?\*/g, '[]');
}

export function collectDeclaredBindingDeclarationDiagnostics(
  source: Record<string, unknown>,
  path: string,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const candidate of collectDeclaredBinderCandidatesFromEffectNode(source)) {
    if (typeof candidate.value !== 'string' || isCanonicalBindingIdentifier(candidate.value)) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_DECLARATION_NON_CANONICAL,
      path: `${path}.${normalizeDeclaredBinderDiagnosticPath(candidate.path)}`,
      severity: 'error',
      message: `${normalizeDeclaredBinderSurface(candidate.pattern)} "${candidate.value}" must be a canonical "$name" token.`,
      suggestion: 'Use a canonical binding token like "$candidate".',
    });
  }
  return diagnostics;
}

export function validateQueryDomainContract(
  query: OptionsQuery,
  contract: QueryDomainContract,
  path: string,
): readonly Diagnostic[] {
  if (contract === 'agnostic') {
    return [];
  }

  const expected: QueryDomainKind = contract === 'tokenOnly' ? 'token' : 'zone';
  const domains = inferQueryDomainKinds(query);
  if (domains.size === 1 && domains.has(expected)) {
    return [];
  }

  const expectedLabel = expected === 'token' ? 'token' : 'zone';
  const code = contract === 'tokenOnly'
    ? CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_DISTRIBUTE_TOKENS_TOKEN_DOMAIN_INVALID
    : CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_DISTRIBUTE_TOKENS_DESTINATION_DOMAIN_INVALID;

  return [
    {
      code,
      path,
      severity: 'error',
      message: `distributeTokens ${path.endsWith('.tokens') ? 'tokens' : 'destinations'} query must resolve to ${expectedLabel}-domain options.`,
      suggestion:
        expected === 'token'
          ? 'Use token queries only (tokensInZone, tokensInAdjacentZones, tokensInMapSpaces, or compositions that stay token-only).'
          : 'Use zone queries only (zones, mapSpaces, adjacentZones, connectedZones, or compositions that stay zone-only).',
    },
  ];
}

export function validateChoiceOptionsRuntimeShape(
  query: OptionsQuery,
  path: string,
  effectName: 'chooseOne' | 'chooseN',
): readonly Diagnostic[] {
  const diagnostic = buildChoiceOptionsRuntimeShapeDiagnostic({
    code: CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.compiler,
    path,
    effectName,
    query,
  });
  if (diagnostic === null) {
    return [];
  }
  return [diagnostic];
}
