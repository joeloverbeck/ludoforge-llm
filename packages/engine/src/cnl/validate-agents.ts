import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isNonEmptyTrimmedString, isNonEmptyString, isRecord, validateUnknownKeys } from './validate-spec-shared.js';

const AGENTS_SECTION_KEYS = ['parameters', 'library', 'profiles', 'bindings'] as const;
const AGENT_PARAMETER_KEYS = ['type', 'default', 'min', 'max', 'tunable', 'values', 'allowedIds'] as const;
const AGENT_LIBRARY_KEYS = [
  'stateFeatures',
  'candidateFeatures',
  'candidateAggregates',
  'pruningRules',
  'scoreTerms',
  'tieBreakers',
] as const;
const AGENT_PROFILE_KEYS = ['params', 'use'] as const;
const AGENT_PROFILE_USE_KEYS = ['pruningRules', 'scoreTerms', 'tieBreakers'] as const;

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
  validateNamedDefinitionMap(doc.agents.parameters, 'doc.agents.parameters', diagnostics, 'agents parameter map');
  validateLibrary(doc.agents.library, diagnostics);
  validateProfiles(doc.agents.profiles, diagnostics);
  validateBindings(doc.agents.bindings, diagnostics);
}

function validateLibrary(library: unknown, diagnostics: Diagnostic[]): void {
  if (!validateRecordMap(library, 'doc.agents.library', diagnostics, 'agents library')) {
    return;
  }

  validateUnknownKeys(library, AGENT_LIBRARY_KEYS, 'doc.agents.library', diagnostics, 'agents library');

  for (const key of AGENT_LIBRARY_KEYS) {
    validateNamedDefinitionMap(library[key], `doc.agents.library.${key}`, diagnostics, `agents library ${key}`);
  }
}

function validateProfiles(profiles: unknown, diagnostics: Diagnostic[]): void {
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
    validateProfileUse(profileDef.use, `${profilePath}.use`, diagnostics);
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

function validateProfileUse(use: unknown, path: string, diagnostics: Diagnostic[]): void {
  if (!validateRecordMap(use, path, diagnostics, 'agents profile use')) {
    return;
  }

  validateUnknownKeys(use, AGENT_PROFILE_USE_KEYS, path, diagnostics, 'agents profile use');
  for (const key of AGENT_PROFILE_USE_KEYS) {
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

    for (const [index, entry] of listValue.entries()) {
      if (isNonEmptyString(entry)) {
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
