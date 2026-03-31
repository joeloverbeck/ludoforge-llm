import type { Diagnostic } from '../kernel/diagnostics.js';
import {
  AGENT_POLICY_COMPLETION_GUIDANCE_KEYS,
  AGENT_POLICY_LIBRARY_BUCKETS,
  AGENT_POLICY_PROFILE_USE_BUCKETS,
  isAgentPolicyCompletionGuidanceFallback,
} from '../contracts/index.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  isNonEmptyTrimmedString,
  isNonEmptyString,
  isRecord,
  pushMissingReferenceDiagnostic,
  validateUnknownKeys,
} from './validate-spec-shared.js';

const AGENTS_SECTION_KEYS = ['parameters', 'visibility', 'library', 'profiles', 'bindings'] as const;
const AGENT_PARAMETER_KEYS = ['type', 'default', 'min', 'max', 'tunable', 'values', 'allowedIds'] as const;
const AGENT_VISIBILITY_SECTION_KEYS = ['globalVars', 'perPlayerVars', 'derivedMetrics', 'victory'] as const;
const AGENT_VISIBILITY_KEYS = ['current', 'preview'] as const;
const AGENT_VISIBILITY_PREVIEW_KEYS = ['visibility', 'allowWhenHiddenSampling'] as const;
const AGENT_VISIBILITY_VICTORY_KEYS = ['currentMargin', 'currentRank'] as const;
const AGENT_PROFILE_KEYS = ['params', 'use', 'completionGuidance', 'preview'] as const;
type AgentProfileUseKey = typeof AGENT_POLICY_PROFILE_USE_BUCKETS[number];
type AgentLibraryBucketMap = Partial<Record<AgentProfileUseKey, Record<string, unknown>>>;

interface ProfileUseValidationSummary {
  readonly completionScoreTermsValidCount: number | null;
}

const INLINE_PROFILE_LOGIC_KEYS = new Set([
  'expr',
  'when',
  'value',
  'weight',
  'stateFeatures',
  'candidateFeatures',
  'candidateAggregates',
  'pruningRules',
  'scoreTerms',
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
  validateVisibility(doc.agents.visibility, diagnostics);
  validateLibrary(doc.agents.library, diagnostics);
  validateProfiles(doc.agents.profiles, authoredLibrary, diagnostics);
  validateBindings(doc.agents.bindings, diagnostics);
}

function validateVisibility(visibility: unknown, diagnostics: Diagnostic[]): void {
  if (!validateRecordMap(visibility, 'doc.agents.visibility', diagnostics, 'agents visibility')) {
    return;
  }

  validateUnknownKeys(visibility, AGENT_VISIBILITY_SECTION_KEYS, 'doc.agents.visibility', diagnostics, 'agents visibility');
  validateVisibilityMap(visibility.globalVars, 'doc.agents.visibility.globalVars', diagnostics);
  validateVisibilityMap(visibility.perPlayerVars, 'doc.agents.visibility.perPlayerVars', diagnostics);
  validateVisibilityMap(visibility.derivedMetrics, 'doc.agents.visibility.derivedMetrics', diagnostics);

  if (visibility.victory === undefined) {
    return;
  }
  if (!isRecord(visibility.victory)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_DEFINITION_INVALID',
      path: 'doc.agents.visibility.victory',
      severity: 'error',
      message: 'agents visibility.victory must be an object.',
      suggestion: 'Define victory visibility overrides as an object keyed by currentMargin/currentRank.',
    });
    return;
  }
  validateUnknownKeys(
    visibility.victory,
    AGENT_VISIBILITY_VICTORY_KEYS,
    'doc.agents.visibility.victory',
    diagnostics,
    'agents visibility victory',
  );
  validateVisibilityEntry(visibility.victory.currentMargin, 'doc.agents.visibility.victory.currentMargin', diagnostics);
  validateVisibilityEntry(visibility.victory.currentRank, 'doc.agents.visibility.victory.currentRank', diagnostics);
}

function validateVisibilityMap(value: unknown, path: string, diagnostics: Diagnostic[]): void {
  if (!validateRecordMap(value, path, diagnostics, 'agents visibility map')) {
    return;
  }

  for (const [entryId, entryValue] of Object.entries(value)) {
    if (!isNonEmptyTrimmedString(entryId)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_AGENTS_ID_INVALID',
        path: `${path}.${entryId}`,
        severity: 'error',
        message: 'agents visibility ids must be non-empty strings without surrounding whitespace.',
        suggestion: 'Use trimmed surface ids for authored visibility entries.',
      });
    }
    validateVisibilityEntry(entryValue, `${path}.${entryId}`, diagnostics);
  }
}

function validateVisibilityEntry(value: unknown, path: string, diagnostics: Diagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_DEFINITION_INVALID',
      path,
      severity: 'error',
      message: 'agents visibility entries must be objects.',
      suggestion: 'Define visibility entries with current and/or preview fields.',
    });
    return;
  }
  validateUnknownKeys(value, AGENT_VISIBILITY_KEYS, path, diagnostics, 'agents visibility entry');
  if (value.preview !== undefined) {
    if (!isRecord(value.preview)) {
      diagnostics.push({
        code: 'CNL_VALIDATOR_AGENTS_DEFINITION_INVALID',
        path: `${path}.preview`,
        severity: 'error',
        message: 'agents visibility preview entries must be objects.',
        suggestion: 'Define preview visibility with visibility and/or allowWhenHiddenSampling.',
      });
      return;
    }
    validateUnknownKeys(value.preview, AGENT_VISIBILITY_PREVIEW_KEYS, `${path}.preview`, diagnostics, 'agents visibility preview');
  }
}

function validateLibrary(library: unknown, diagnostics: Diagnostic[]): void {
  if (!validateRecordMap(library, 'doc.agents.library', diagnostics, 'agents library')) {
    return;
  }

  validateUnknownKeys(library, AGENT_POLICY_LIBRARY_BUCKETS, 'doc.agents.library', diagnostics, 'agents library');

  for (const key of AGENT_POLICY_LIBRARY_BUCKETS) {
    validateNamedDefinitionMap(library[key], `doc.agents.library.${key}`, diagnostics, `agents library ${key}`);
  }
}

function validateProfiles(profiles: unknown, library: AgentLibraryBucketMap | undefined, diagnostics: Diagnostic[]): void {
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
    validateInlineProfileLogic(profileDef, profilePath, diagnostics);
    validateProfileParams(profileDef.params, `${profilePath}.params`, diagnostics);
    const useSummary = validateProfileUse(profileDef.use, `${profilePath}.use`, library, diagnostics);
    validateCompletionGuidance(profileDef.completionGuidance, `${profilePath}.completionGuidance`, diagnostics, useSummary);
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
): ProfileUseValidationSummary {
  if (!validateRecordMap(use, path, diagnostics, 'agents profile use')) {
    return { completionScoreTermsValidCount: null };
  }

  validateUnknownKeys(use, AGENT_POLICY_PROFILE_USE_BUCKETS, path, diagnostics, 'agents profile use');
  let completionScoreTermsValidCount: number | null = 0;
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
      if (key === 'completionScoreTerms') {
        completionScoreTermsValidCount = null;
      }
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
        if (key === 'completionScoreTerms' && completionScoreTermsValidCount !== null) {
          completionScoreTermsValidCount += 1;
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

  return {
    completionScoreTermsValidCount,
  };
}

function validateCompletionGuidance(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  useSummary?: ProfileUseValidationSummary,
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_PROFILE_INVALID',
      path,
      severity: 'error',
      message: 'agents profile completionGuidance must be an object.',
      suggestion: 'Define completionGuidance with enabled and/or fallback fields.',
    });
    return;
  }

  validateUnknownKeys(value, AGENT_POLICY_COMPLETION_GUIDANCE_KEYS, path, diagnostics, 'agents profile completionGuidance');
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_PROFILE_INVALID',
      path: `${path}.enabled`,
      severity: 'error',
      message: 'agents profile completionGuidance.enabled must be a boolean.',
      suggestion: 'Set completionGuidance.enabled to true or false.',
    });
  }
  if (value.fallback !== undefined && !isAgentPolicyCompletionGuidanceFallback(value.fallback)) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_PROFILE_INVALID',
      path: `${path}.fallback`,
      severity: 'error',
      message: 'agents profile completionGuidance.fallback must be "random" or "first".',
      suggestion: 'Use completionGuidance.fallback = "random" or "first".',
    });
  }
  if (value.enabled === true && useSummary?.completionScoreTermsValidCount === 0) {
    diagnostics.push({
      code: 'CNL_VALIDATOR_AGENTS_COMPLETION_GUIDANCE_MISSING_TERMS',
      path,
      severity: 'warning',
      message: 'agents profile completionGuidance.enabled is true, but profile.use.completionScoreTerms references no valid completion score terms.',
      suggestion: 'Add at least one valid completionScoreTerms id to profile.use.completionScoreTerms or disable completionGuidance.',
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
