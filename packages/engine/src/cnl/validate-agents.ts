import type { Diagnostic } from '../kernel/diagnostics.js';
import {
  AGENT_POLICY_LIBRARY_BUCKETS,
  AGENT_POLICY_PROFILE_USE_BUCKETS,
} from '../contracts/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  isNonEmptyTrimmedString,
  isNonEmptyString,
  isRecord,
  pushMissingReferenceDiagnostic,
  validateUnknownKeys,
} from './validate-spec-shared.js';

const AGENTS_SECTION_KEYS = ['parameters', 'library', 'profiles', 'bindings'] as const;
const AGENT_PARAMETER_KEYS = ['type', 'default', 'min', 'max', 'tunable', 'values', 'allowedIds'] as const;
const AGENT_PROFILE_KEYS = ['observer', 'params', 'use', 'preview', 'selection', 'selector', 'strategyModules', 'guardrails'] as const;
const DEPRECATED_PRUNING_RULES_KEY = 'pruning' + 'Rules';

const BUILT_IN_OBSERVER_NAMES = new Set<string>(['omniscient', 'default']);
type AgentProfileUseKey = typeof AGENT_POLICY_PROFILE_USE_BUCKETS[number];
type AgentLibraryBucketMap = Partial<Record<AgentProfileUseKey | 'selectors' | 'strategyModules', Record<string, unknown>>>;

const INLINE_PROFILE_LOGIC_KEYS = new Set([
  'expr',
  'when',
  'value',
  'weight',
  'stateFeatures',
  'candidateFeatures',
  'candidateAggregates',
  'selectors',
  'strategyModules',
  'guardrails',
  'considerations',
  'tieBreakers',
]);

export function validateAgents(doc: GameSpecDoc, diagnostics: Diagnostic[]): void {
  if (doc.agents === null) {
    return;
  }

  if (!isRecord(doc.agents)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_SECTION_INVALID',
      path: 'doc.agents',
      severity: 'error',
      message: 'agents section must be an object.',
      suggestion: 'Define doc.agents as an object containing parameters, library, profiles, and bindings maps.',
    });
    return;
  }

  validateUnknownKeys(doc.agents, AGENTS_SECTION_KEYS, 'doc.agents', diagnostics, 'agents');
  const authoredLibrary = isRecord(doc.agents.library) ? doc.agents.library : undefined;
  validateNamedDefinitionMap(doc.agents.parameters, 'doc.agents.parameters', diagnostics, 'agents parameter map');
  validateLibrary(doc.agents.library, diagnostics);
  validateProfiles(doc.agents.profiles, authoredLibrary, doc.observability, diagnostics);
  validateBindings(doc.agents.bindings, diagnostics);
}

function validateLibrary(library: unknown, diagnostics: Diagnostic[]): void {
  if (!validateRecordMap(library, 'doc.agents.library', diagnostics, 'agents library')) {
    return;
  }

  reportDeprecatedGuardrailKey(library, 'doc.agents.library', diagnostics);
  validateUnknownKeys(library, AGENT_POLICY_LIBRARY_BUCKETS, 'doc.agents.library', diagnostics, 'agents library');

  for (const key of AGENT_POLICY_LIBRARY_BUCKETS) {
    validateNamedDefinitionMap(library[key], `doc.agents.library.${key}`, diagnostics, `agents library ${key}`);
  }

  const considerations = library.considerations;
  if (!isRecord(considerations)) {
    return;
  }
  for (const [considerationId, considerationDef] of Object.entries(considerations)) {
    if (!isRecord(considerationDef)) {
      continue;
    }
    validateConsiderationScopes(considerationDef.scopes, `doc.agents.library.considerations.${considerationId}.scopes`, diagnostics);
  }
}

function validateProfiles(
  profiles: unknown,
  library: AgentLibraryBucketMap | undefined,
  observability: GameSpecDoc['observability'],
  diagnostics: Diagnostic[],
): void {
  if (!validateRecordMap(profiles, 'doc.agents.profiles', diagnostics, 'agents profiles')) {
    return;
  }

  for (const [profileId, profileDef] of Object.entries(profiles)) {
    const profilePath = `doc.agents.profiles.${profileId}`;
    if (!isNonEmptyTrimmedString(profileId)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_AGENTS_ID_INVALID',
        path: profilePath,
        severity: 'error',
        message: 'agents profile ids must be non-empty strings without surrounding whitespace.',
        suggestion: 'Use a trimmed non-empty profile id.',
      });
    }

    if (!isRecord(profileDef)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_AGENTS_PROFILE_INVALID',
        path: profilePath,
        severity: 'error',
        message: 'agents profile definition must be an object.',
        suggestion: 'Define each agents profile as an object with params and use fields.',
      });
      continue;
    }

    validateUnknownKeys(profileDef, AGENT_PROFILE_KEYS, profilePath, diagnostics, 'agents profile');
    validateProfileObserverRef(profileDef.observer, observability, `${profilePath}.observer`, diagnostics);
    validateInlineProfileLogic(profileDef, profilePath, diagnostics);
    validateProfileParams(profileDef.params, `${profilePath}.params`, diagnostics);
    validateProfileUse(profileDef.use, `${profilePath}.use`, library, diagnostics);
    validatePreviewOutcomeGrantContinuation(profileId, profileDef, profilePath, diagnostics);
    validatePolicyGuidedMicroturnConsiderations(profileId, profileDef, profilePath, library, diagnostics);
    validateInnerPreviewOptionConsiderations(profileId, profileDef, profilePath, library, diagnostics);
  }
}

function validatePreviewOutcomeGrantContinuation(
  profileId: string,
  profileDef: Record<string, unknown>,
  profilePath: string,
  diagnostics: Diagnostic[],
): void {
  const preview = profileDef.preview;
  const block = isRecord(preview) ? preview.outcomeGrantContinuation : undefined;
  if (block === undefined) {
    return;
  }
  if (!isRecord(block)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_INVALID,
      path: `${profilePath}.preview.outcomeGrantContinuation`,
      severity: 'error',
      message: `Profile "${profileId}" preview.outcomeGrantContinuation must be an object.`,
      suggestion: 'Use preview.outcomeGrantContinuation with enabled, extraDepthCap, and capClass.',
    });
    return;
  }
  const enabled = block.enabled ?? false;
  if (typeof enabled !== 'boolean') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_INVALID,
      path: `${profilePath}.preview.outcomeGrantContinuation.enabled`,
      severity: 'error',
      message: `Profile "${profileId}" preview.outcomeGrantContinuation.enabled must be a boolean, got ${typeof enabled}.`,
      suggestion: 'Set preview.outcomeGrantContinuation.enabled to true or false.',
    });
    return;
  }
  if (!enabled) {
    return;
  }
  if (
    typeof block.extraDepthCap !== 'number'
    || !Number.isSafeInteger(block.extraDepthCap)
    || block.extraDepthCap <= 0
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_EXTRA_DEPTH_CAP_INVALID,
      path: `${profilePath}.preview.outcomeGrantContinuation.extraDepthCap`,
      severity: 'error',
      message: `Profile "${profileId}" preview.outcomeGrantContinuation.extraDepthCap must be a positive safe integer when outcomeGrantContinuation is enabled.`,
      suggestion: 'Set preview.outcomeGrantContinuation.extraDepthCap to 4 for capClass postGrant16.',
    });
  }
  if (block.capClass !== 'postGrant16') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_CAP_CLASS_UNKNOWN,
      path: `${profilePath}.preview.outcomeGrantContinuation.capClass`,
      severity: 'error',
      message: `Profile "${profileId}" preview.outcomeGrantContinuation.capClass must be postGrant16.`,
      suggestion: 'Set preview.outcomeGrantContinuation.capClass to postGrant16.',
    });
  }
}

function validatePolicyGuidedMicroturnConsiderations(
  profileId: string,
  profileDef: Record<string, unknown>,
  profilePath: string,
  library: AgentLibraryBucketMap | undefined,
  diagnostics: Diagnostic[],
): void {
  const preview = profileDef.preview;
  if (!isRecord(preview) || preview.completion !== 'policyGuided') {
    return;
  }

  const use = profileDef.use;
  const considerationIds = isRecord(use) && Array.isArray(use.considerations)
    ? use.considerations
    : [];
  const hasMicroturnScope = considerationIds.some((considerationId) => {
    if (!isNonEmptyString(considerationId)) {
      return false;
    }
    const consideration = library?.considerations?.[considerationId];
    return isRecord(consideration)
      && Array.isArray(consideration.scopes)
      && consideration.scopes.includes('microturn');
  });
  if (hasMicroturnScope) {
    return;
  }

  const fallbackPolicy = isNonEmptyString(preview.fallbackCompletionPolicy)
    ? preview.fallbackCompletionPolicy
    : 'greedy';
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POLICYGUIDED_NO_MICROTURN_CONSIDERATIONS,
    path: `${profilePath}.preview.completion`,
    severity: 'warning',
    message: `Profile "${profileId}" declares preview.completion: policyGuided but has no scopes: [microturn] considerations; completion will always fall back to ${fallbackPolicy}.`,
    suggestion: 'Add at least one consideration with scopes: [microturn] to the profile, or set preview.completion to greedy.',
  });
}

function validateInnerPreviewOptionConsiderations(
  profileId: string,
  profileDef: Record<string, unknown>,
  profilePath: string,
  library: AgentLibraryBucketMap | undefined,
  diagnostics: Diagnostic[],
): void {
  const preview = profileDef.preview;
  const inner = isRecord(preview) ? preview.inner : undefined;
  if (!isRecord(inner)) {
    return;
  }

  const flagsRequiringConsideration: Array<'chooseOne' | 'chooseNStep'> = [];
  if (inner.chooseOne === true) {
    flagsRequiringConsideration.push('chooseOne');
  }
  if (inner.chooseNStep === true) {
    flagsRequiringConsideration.push('chooseNStep');
  }
  if (flagsRequiringConsideration.length === 0) {
    return;
  }

  if (hasPreviewOptionMicroturnConsideration(profileDef.use, library)) {
    return;
  }

  for (const flag of flagsRequiringConsideration) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION,
      path: `${profilePath}.preview.inner.${flag}`,
      severity: 'warning',
      message: `Profile "${profileId}" has preview.inner.${flag} enabled but no microturn-scope consideration references preview.option.* refs; the per-option preview drive will run but produce no scoring signal.`,
      suggestion: `Add a microturn-scope consideration that references preview.option.delta.victory.currentMargin.self or another preview.option.* ref, or disable preview.inner.${flag}.`,
    });
  }
}

function hasPreviewOptionMicroturnConsideration(
  use: unknown,
  library: AgentLibraryBucketMap | undefined,
): boolean {
  const considerationIds = isRecord(use) && Array.isArray(use.considerations)
    ? use.considerations
    : [];
  return considerationIds.some((considerationId) => {
    if (!isNonEmptyString(considerationId)) {
      return false;
    }
    const consideration = library?.considerations?.[considerationId];
    return isRecord(consideration)
      && Array.isArray(consideration.scopes)
      && consideration.scopes.includes('microturn')
      && containsPreviewOptionRef(consideration, library);
  });
}

function containsPreviewOptionRef(
  value: unknown,
  library: AgentLibraryBucketMap | undefined,
  seenSelectors: ReadonlySet<string> = new Set(),
): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsPreviewOptionRef(entry, library, seenSelectors));
  }
  if (!isRecord(value)) {
    return false;
  }
  for (const [key, entry] of Object.entries(value)) {
    if ((key === 'ref' || key === 'feature')
      && typeof entry === 'string'
      && entry.startsWith('preview.option.')) {
      return true;
    }
    if (key === 'ref' && typeof entry === 'string' && entry.startsWith('selector.')) {
      const selectorId = entry.slice('selector.'.length).split('.')[0];
      if (selectorId !== undefined && selectorId.length > 0 && !seenSelectors.has(selectorId)) {
        const nextSeen = new Set(seenSelectors);
        nextSeen.add(selectorId);
        if (containsPreviewOptionRef(library?.selectors?.[selectorId], library, nextSeen)) {
          return true;
        }
      }
    }
    if (containsPreviewOptionRef(entry, library, seenSelectors)) {
      return true;
    }
  }
  return false;
}

function validateProfileObserverRef(
  observer: unknown,
  observability: GameSpecDoc['observability'],
  path: string,
  diagnostics: Diagnostic[],
): void {
  if (observer === undefined) {
    return; // No observer specified — uses built-in default
  }

  if (typeof observer !== 'string' || observer.trim() === '') {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_PROFILE_OBSERVER_INVALID',
      path,
      severity: 'error',
      message: 'agents profile observer must be a non-empty string.',
      suggestion: 'Set observer to the name of an observer defined in observability.observers or a built-in name (omniscient, default).',
    });
    return;
  }

  // Built-in names are always valid
  if (BUILT_IN_OBSERVER_NAMES.has(observer)) {
    return;
  }

  // Check observability section exists
  if (observability === null) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_PROFILE_OBSERVER_NO_SECTION',
      path,
      severity: 'error',
      message: `agents profile references observer "${observer}", but no observability section is defined.`,
      suggestion: 'Add an observability section with observers, or use a built-in observer name (omniscient, default).',
    });
    return;
  }

  // Check observer exists in observability.observers
  const observers = observability.observers;
  if (observers === undefined || !(observer in observers)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_PROFILE_OBSERVER_UNKNOWN',
      path,
      severity: 'error',
      message: `agents profile references unknown observer "${observer}".`,
      suggestion: `Define "${observer}" in observability.observers or use a built-in name (omniscient, default).`,
    });
  }
}

function validateInlineProfileLogic(
  profileDef: Record<string, unknown>,
  profilePath: string,
  diagnostics: Diagnostic[],
): void {
  for (const [key, value] of Object.entries(profileDef)) {
    if (!INLINE_PROFILE_LOGIC_KEYS.has(key) || key === 'use') {
      continue;
    }
    if (!Array.isArray(value) && !isRecord(value)) {
      continue;
    }

    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_PROFILE_INLINE_LOGIC_FORBIDDEN',
      path: `${profilePath}.${key}`,
      severity: 'error',
      message: `agents profiles may not define inline anonymous logic at "${key}".`,
      suggestion: 'Move reusable logic into doc.agents.library and reference it from profile.use.',
    });
  }
}

function validateProfileParams(params: unknown, path: string, diagnostics: Diagnostic[]): void {
  validateRecordMap(params, path, diagnostics, 'agents profile params');
}

function validateProfileUse(
  use: unknown,
  path: string,
  library: AgentLibraryBucketMap | undefined,
  diagnostics: Diagnostic[],
): void {
  if (!validateRecordMap(use, path, diagnostics, 'agents profile use')) {
    return;
  }

  reportDeprecatedGuardrailKey(use, path, diagnostics);
  validateUnknownKeys(use, AGENT_POLICY_PROFILE_USE_BUCKETS, path, diagnostics, 'agents profile use');
  for (const key of AGENT_POLICY_PROFILE_USE_BUCKETS) {
    const listValue = use[key];
    if (listValue === undefined) {
      continue;
    }
    if (!Array.isArray(listValue)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_AGENTS_PROFILE_USE_LIST_INVALID',
        path: `${path}.${key}`,
        severity: 'error',
        message: `agents profile use.${key} must be an ordered list of library ids.`,
        suggestion: `Set ${key} to an array of authored library ids.`,
      });
      continue;
    }

    const libraryBucket = library?.[key];
    for (const [index, entry] of listValue.entries()) {
      if (isNonEmptyString(entry)) {
        if (libraryBucket?.[entry] === undefined) {
          pushMissingReferenceDiagnostic(
            diagnostics,
            'CNL_VALIDATOR_AGENTS_PROFILE_USE_UNKNOWN_ID',
            `${path}.${key}.${index}`,
            `agents profile use.${key} references unknown library id "${entry}".`,
            entry,
            Object.keys(libraryBucket ?? {}),
          `Define "${entry}" in doc.agents.library.${key} before referencing it from profile.use.${key}.`,
          );
          continue;
        }
        continue;
      }
      diagnostics.push({
        code: 'CNL_VALIDATOR_AGENTS_PROFILE_USE_ENTRY_INVALID',
        path: `${path}.${key}.${index}`,
        severity: 'error',
        message: `agents profile use.${key} entries must be non-empty string ids.`,
        suggestion: 'Reference named library items by id only; inline objects are not allowed.',
      });
    }
  }
}

function reportDeprecatedGuardrailKey(
  value: Record<string, unknown>,
  path: string,
  diagnostics: Diagnostic[],
): void {
  if (!(DEPRECATED_PRUNING_RULES_KEY in value)) {
    return;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED,
    path: `${path}.${DEPRECATED_PRUNING_RULES_KEY}`,
    severity: 'error',
    message: 'Agent pruning rules were replaced by guardrails.',
    suggestion: 'Move this entry to guardrails and declare severity, safety, fallback, and onUnavailable behavior.',
  });
}

function validateConsiderationScopes(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): void {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_DEFINITION_INVALID',
      path,
      severity: 'error',
      message: 'agents consideration scopes must be a non-empty array.',
      suggestion: 'Set scopes to a non-empty list containing "move" or "microturn".',
    });
    return;
  }

  if (value.length === 0) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_DEFINITION_INVALID',
      path,
      severity: 'error',
      message: 'agents consideration scopes must contain at least one scope.',
      suggestion: 'Use scopes: ["move"] or scopes: ["microturn"].',
    });
  }

  for (const [index, entry] of value.entries()) {
    if (entry === 'move' || entry === 'microturn') {
      continue;
    }
    if (entry === 'completion') {
      diagnostics.push({
        code: 'CNL_VALIDATOR_AGENTS_DEFINITION_INVALID',
        path: `${path}.${index}`,
        severity: 'error',
        message: 'scopes: [completion] is removed; use scopes: [microturn] with microturn.* refs.',
        suggestion: 'Replace completion with microturn and migrate retired refs to microturn.*.',
      });
      continue;
    }
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_DEFINITION_INVALID',
      path: `${path}.${index}`,
      severity: 'error',
      message: `agents consideration scopes entries must be "move" or "microturn", got ${JSON.stringify(entry)}.`,
      suggestion: 'Use only the supported consideration scopes: "move" and "microturn".',
    });
  }
}

function validateBindings(bindings: unknown, diagnostics: Diagnostic[]): void {
  if (!validateRecordMap(bindings, 'doc.agents.bindings', diagnostics, 'agents bindings')) {
    return;
  }

  for (const [seatId, profileId] of Object.entries(bindings)) {
    if (!isNonEmptyTrimmedString(seatId)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_AGENTS_ID_INVALID',
        path: `doc.agents.bindings.${seatId}`,
        severity: 'error',
        message: 'agents binding keys must be non-empty strings without surrounding whitespace.',
        suggestion: 'Use canonical trimmed seat ids as binding keys.',
      });
    }

    if (isNonEmptyTrimmedString(profileId)) {
      continue;
    }

    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_BINDING_VALUE_INVALID',
      path: `doc.agents.bindings.${seatId}`,
      severity: 'error',
      message: 'agents bindings must map each seat id to a non-empty profile id string.',
      suggestion: 'Set each binding value to a trimmed authored profile id.',
    });
  }
}

function validateNamedDefinitionMap(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  label: string,
): void {
  if (!validateRecordMap(value, path, diagnostics, label)) {
    return;
  }

  for (const [entryId, entryValue] of Object.entries(value)) {
    if (!isNonEmptyTrimmedString(entryId)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_AGENTS_ID_INVALID',
        path: `${path}.${entryId}`,
        severity: 'error',
        message: `${label} ids must be non-empty strings without surrounding whitespace.`,
        suggestion: 'Use trimmed non-empty ids for authored agents collections.',
      });
    }

    if (isRecord(entryValue)) {
      if (path === 'doc.agents.parameters') {
        validateUnknownKeys(entryValue, AGENT_PARAMETER_KEYS, `${path}.${entryId}`, diagnostics, 'agents parameter');
      }
      continue;
    }

    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_DEFINITION_INVALID',
      path: `${path}.${entryId}`,
      severity: 'error',
      message: `${label} entries must be objects keyed by id.`,
      suggestion: 'Define each authored agents entry as an object value inside a keyed map.',
    });
  }
}

function validateRecordMap(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  label: string,
): value is Record<string, unknown> {
  if (value === undefined) {
    return false;
  }

  if (isRecord(value)) {
    return true;
  }

  diagnostics.push({
    code: 'CNL_VALIDATOR_AGENTS_MAP_REQUIRED',
    path,
    severity: 'error',
    message: `${label} must be a map keyed by ids, not an array or scalar.`,
    suggestion: `Rewrite ${path} as an object keyed by canonical ids.`,
  });
  return false;
}
