import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  AgentParameterType,
  AgentParameterValue,
  AgentPolicyCatalog,
  CompiledAgentParameterDef,
  CompiledAgentProfile,
  GameDef,
} from '../kernel/types.js';
import type {
  GameSpecAgentLibrary,
  GameSpecAgentParameterDef,
  GameSpecAgentParameterType,
  GameSpecAgentProfileDef,
  GameSpecAgentsSection,
} from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

type ProfileUseKey = keyof CompiledAgentProfile['use'];

const AGENT_PARAMETER_TYPES: readonly AgentParameterType[] = ['number', 'integer', 'boolean', 'enum', 'idOrder'];

export function lowerAgents(
  agents: GameSpecAgentsSection | null,
  diagnostics: Diagnostic[],
): GameDef['agents'] | undefined {
  if (agents === null) {
    return undefined;
  }

  const parameterDefs = lowerParameterDefs(agents.parameters, diagnostics);
  const profiles = lowerProfiles(agents.profiles, agents.library, parameterDefs, diagnostics);
  const bindingsBySeat = lowerBindings(agents.bindings, profiles, diagnostics);

  return {
    schemaVersion: 1,
    parameterDefs,
    profiles,
    bindingsBySeat,
  } satisfies AgentPolicyCatalog;
}

function lowerParameterDefs(
  parameterDefs: GameSpecAgentsSection['parameters'],
  diagnostics: Diagnostic[],
): AgentPolicyCatalog['parameterDefs'] {
  const compiled: Record<string, CompiledAgentParameterDef> = {};

  for (const [parameterId, parameterDef] of Object.entries(parameterDefs ?? {})) {
    const compiledDef = lowerParameterDef(parameterId, parameterDef, diagnostics);
    if (compiledDef !== null) {
      compiled[parameterId] = compiledDef;
    }
  }

  return compiled;
}

function lowerParameterDef(
  parameterId: string,
  parameterDef: GameSpecAgentParameterDef,
  diagnostics: Diagnostic[],
): CompiledAgentParameterDef | null {
  const path = `doc.agents.parameters.${parameterId}`;
  if (!isAgentParameterType(parameterDef.type)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_TYPE_INVALID,
      path: `${path}.type`,
      severity: 'error',
      message: `agents parameter "${parameterId}" has unsupported type "${String(parameterDef.type)}".`,
      suggestion: `Use one of: ${AGENT_PARAMETER_TYPES.join(', ')}.`,
    });
    return null;
  }

  if (parameterDef.min !== undefined || parameterDef.max !== undefined) {
    if (!validateNumericBounds(parameterDef.type, parameterDef.min, parameterDef.max, `${path}`, diagnostics)) {
      return null;
    }
  } else if (
    parameterDef.tunable === true
    && (parameterDef.type === 'number' || parameterDef.type === 'integer')
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path,
      severity: 'error',
      message: `Tunable ${parameterDef.type} parameter "${parameterId}" must declare finite min and max bounds.`,
      suggestion: 'Provide finite min and max values for tunable numeric parameters.',
    });
    return null;
  }

  let values: readonly string[] | null | undefined;
  if (parameterDef.type === 'enum') {
    values = normalizeStringList(parameterDef.values, `${path}.values`, 'values', diagnostics);
    if (values === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_VALUES_INVALID,
        path: `${path}.values`,
        severity: 'error',
        message: `Enum parameter "${parameterId}" must declare a non-empty unique values list.`,
        suggestion: 'Provide a list of unique non-empty string values.',
      });
      return null;
    }
  }

  let allowedIds: readonly string[] | null | undefined;
  if (parameterDef.type === 'idOrder') {
    allowedIds = normalizeStringList(parameterDef.allowedIds, `${path}.allowedIds`, 'allowed ids', diagnostics);
    if (allowedIds === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_ALLOWED_IDS_INVALID,
        path: `${path}.allowedIds`,
        severity: 'error',
        message: `idOrder parameter "${parameterId}" must declare a non-empty unique allowedIds list.`,
        suggestion: 'Provide a list of unique non-empty ids that the parameter may order.',
      });
      return null;
    }
  }

  let normalizedDefault: AgentParameterValue | null | undefined;
  if (parameterDef.default !== undefined) {
    normalizedDefault = normalizeParameterValue(parameterDef, parameterDef.default, `${path}.default`, diagnostics);
    if (normalizedDefault === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_DEFAULT_INVALID,
        path: `${path}.default`,
        severity: 'error',
        message: `Default value for agents parameter "${parameterId}" does not match its declared constraints.`,
        suggestion: 'Provide a default value that matches the parameter type and declared bounds or allowed ids.',
      });
      return null;
    }
  }

  return {
    type: parameterDef.type,
    required: parameterDef.default === undefined,
    tunable: parameterDef.tunable === true,
    ...(parameterDef.min === undefined ? {} : { min: parameterDef.min }),
    ...(parameterDef.max === undefined ? {} : { max: parameterDef.max }),
    ...(values == null ? {} : { values }),
    ...(allowedIds == null ? {} : { allowedIds }),
    ...(normalizedDefault == null ? {} : { default: normalizedDefault }),
  };
}

function lowerProfiles(
  profiles: GameSpecAgentsSection['profiles'],
  library: GameSpecAgentLibrary | undefined,
  parameterDefs: AgentPolicyCatalog['parameterDefs'],
  diagnostics: Diagnostic[],
): AgentPolicyCatalog['profiles'] {
  const compiled: Record<string, CompiledAgentProfile> = {};

  for (const [profileId, profileDef] of Object.entries(profiles ?? {})) {
    const compiledProfile = lowerProfile(profileId, profileDef, library, parameterDefs, diagnostics);
    if (compiledProfile !== null) {
      compiled[profileId] = compiledProfile;
    }
  }

  return compiled;
}

function lowerProfile(
  profileId: string,
  profileDef: GameSpecAgentProfileDef,
  library: GameSpecAgentLibrary | undefined,
  parameterDefs: AgentPolicyCatalog['parameterDefs'],
  diagnostics: Diagnostic[],
): CompiledAgentProfile | null {
  const path = `doc.agents.profiles.${profileId}`;
  const compiledParams: Record<string, AgentParameterValue> = {};
  let hasError = false;

  for (const [parameterId, value] of Object.entries(profileDef.params ?? {})) {
    const parameterDef = parameterDefs[parameterId];
    if (parameterDef === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_PARAM_UNKNOWN,
        path: `${path}.params.${parameterId}`,
        severity: 'error',
        message: `Profile "${profileId}" references unknown parameter "${parameterId}".`,
        suggestion: 'Declare the parameter in doc.agents.parameters before using it in a profile.',
      });
      hasError = true;
      continue;
    }

    const normalizedValue = normalizeCompiledParameterValue(parameterDef, value, `${path}.params.${parameterId}`, diagnostics);
    if (normalizedValue === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_PARAM_VALUE_INVALID,
        path: `${path}.params.${parameterId}`,
        severity: 'error',
        message: `Profile "${profileId}" sets invalid value for parameter "${parameterId}".`,
        suggestion: 'Use a value that matches the parameter type and declared constraints.',
      });
      hasError = true;
      continue;
    }

    compiledParams[parameterId] = normalizedValue;
  }

  for (const [parameterId, parameterDef] of Object.entries(parameterDefs)) {
    if (compiledParams[parameterId] !== undefined || parameterDef.default !== undefined) {
      continue;
    }

    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_PARAM_MISSING,
      path: `${path}.params`,
      severity: 'error',
      message: `Profile "${profileId}" is missing required parameter "${parameterId}".`,
      suggestion: 'Set the parameter in profile.params or define a default in doc.agents.parameters.',
    });
    hasError = true;
  }

  const use = {
    pruningRules: lowerProfileUseIds(profileId, 'pruningRules', profileDef.use.pruningRules, library?.pruningRules, diagnostics),
    scoreTerms: lowerProfileUseIds(profileId, 'scoreTerms', profileDef.use.scoreTerms, library?.scoreTerms, diagnostics),
    tieBreakers: lowerProfileUseIds(profileId, 'tieBreakers', profileDef.use.tieBreakers, library?.tieBreakers, diagnostics),
  } satisfies CompiledAgentProfile['use'];

  if (hasError || diagnosticsContainProfileUseErrors(profileId, diagnostics)) {
    return null;
  }

  return {
    params: compiledParams,
    use,
  };
}

function lowerProfileUseIds(
  profileId: string,
  key: ProfileUseKey,
  authoredIds: readonly string[] | undefined,
  libraryBucket: Readonly<Record<string, unknown>> | undefined,
  diagnostics: Diagnostic[],
): readonly string[] {
  const path = `doc.agents.profiles.${profileId}.use.${key}`;
  const seen = new Set<string>();
  const lowered: string[] = [];

  for (const [index, id] of (authoredIds ?? []).entries()) {
    if (seen.has(id)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_DUPLICATE_ID,
        path: `${path}.${index}`,
        severity: 'error',
        message: `Profile "${profileId}" contains duplicate ${key} entry "${id}".`,
        suggestion: `Keep each ${key} library id unique within the profile order.`,
      });
      continue;
    }

    if (libraryBucket?.[id] === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `${path}.${index}`,
        severity: 'error',
        message: `Profile "${profileId}" references unknown ${key} id "${id}".`,
        suggestion: `Define "${id}" in doc.agents.library.${key} before referencing it from a profile.`,
      });
      continue;
    }

    seen.add(id);
    lowered.push(id);
  }

  return lowered;
}

function lowerBindings(
  bindings: GameSpecAgentsSection['bindings'],
  profiles: AgentPolicyCatalog['profiles'],
  diagnostics: Diagnostic[],
): AgentPolicyCatalog['bindingsBySeat'] {
  const compiled: Record<string, string> = {};

  for (const [seatId, profileId] of Object.entries(bindings ?? {})) {
    if (profiles[profileId] === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_BINDING_UNKNOWN_PROFILE,
        path: `doc.agents.bindings.${seatId}`,
        severity: 'error',
        message: `agents binding for seat "${seatId}" references unknown profile "${profileId}".`,
        suggestion: 'Bind each seat id to a compiled profile id.',
      });
      continue;
    }

    compiled[seatId] = profileId;
  }

  return compiled;
}

function normalizeParameterValue(
  parameterDef: GameSpecAgentParameterDef,
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): AgentParameterValue | null {
  const compiledDef: CompiledAgentParameterDef = {
    type: parameterDef.type as AgentParameterType,
    required: parameterDef.default === undefined,
    tunable: parameterDef.tunable === true,
    ...(parameterDef.min === undefined ? {} : { min: parameterDef.min }),
    ...(parameterDef.max === undefined ? {} : { max: parameterDef.max }),
    ...(parameterDef.values === undefined ? {} : { values: parameterDef.values }),
    ...(parameterDef.allowedIds === undefined ? {} : { allowedIds: parameterDef.allowedIds }),
  };
  return normalizeCompiledParameterValue(compiledDef, value, path, diagnostics);
}

function normalizeCompiledParameterValue(
  parameterDef: CompiledAgentParameterDef,
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
): AgentParameterValue | null {
  switch (parameterDef.type) {
    case 'number':
      return normalizeNumberValue(value, path, parameterDef, false, diagnostics);
    case 'integer':
      return normalizeNumberValue(value, path, parameterDef, true, diagnostics);
    case 'boolean':
      return typeof value === 'boolean' ? value : null;
    case 'enum':
      return typeof value === 'string' && parameterDef.values?.includes(value) ? value : null;
    case 'idOrder':
      return normalizeIdOrderValue(value, path, parameterDef.allowedIds, diagnostics);
  }
}

function normalizeNumberValue(
  value: unknown,
  path: string,
  parameterDef: Pick<CompiledAgentParameterDef, 'min' | 'max'>,
  requireInteger: boolean,
  diagnostics: Diagnostic[],
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (requireInteger && !Number.isInteger(value)) {
    return null;
  }
  if (parameterDef.min !== undefined && value < parameterDef.min) {
    return null;
  }
  if (parameterDef.max !== undefined && value > parameterDef.max) {
    return null;
  }
  if (requireInteger && !Number.isInteger(parameterDef.min) && parameterDef.min !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path,
      severity: 'error',
      message: 'Integer parameters must use integer min bounds.',
      suggestion: 'Set integer parameter min to an integer value.',
    });
    return null;
  }
  if (requireInteger && !Number.isInteger(parameterDef.max) && parameterDef.max !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path,
      severity: 'error',
      message: 'Integer parameters must use integer max bounds.',
      suggestion: 'Set integer parameter max to an integer value.',
    });
    return null;
  }
  return value;
}

function normalizeIdOrderValue(
  value: unknown,
  path: string,
  allowedIds: readonly string[] | undefined,
  diagnostics: Diagnostic[],
): readonly string[] | null {
  const normalizedAllowedIds = normalizeStringList(allowedIds, `${path}.allowedIds`, 'allowed ids', diagnostics);
  if (normalizedAllowedIds === null || !Array.isArray(value)) {
    return null;
  }

  if (value.length !== normalizedAllowedIds.length) {
    return null;
  }

  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !normalizedAllowedIds.includes(item) || seen.has(item)) {
      return null;
    }
    seen.add(item);
  }

  return [...value];
}

function validateNumericBounds(
  type: GameSpecAgentParameterType,
  min: number | undefined,
  max: number | undefined,
  path: string,
  diagnostics: Diagnostic[],
): boolean {
  if (min !== undefined && (!Number.isFinite(min) || (type === 'integer' && !Number.isInteger(min)))) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path: `${path}.min`,
      severity: 'error',
      message: `agents parameter ${type} min must be a finite${type === 'integer' ? ' integer' : ''} value.`,
      suggestion: 'Set min to a valid finite bound.',
    });
    return false;
  }
  if (max !== undefined && (!Number.isFinite(max) || (type === 'integer' && !Number.isInteger(max)))) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path: `${path}.max`,
      severity: 'error',
      message: `agents parameter ${type} max must be a finite${type === 'integer' ? ' integer' : ''} value.`,
      suggestion: 'Set max to a valid finite bound.',
    });
    return false;
  }
  if (min !== undefined && max !== undefined && min > max) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_BOUNDS_INVALID,
      path,
      severity: 'error',
      message: 'agents parameter min must be less than or equal to max.',
      suggestion: 'Swap or correct the bounds so min <= max.',
    });
    return false;
  }
  return true;
}

function normalizeStringList(
  value: readonly string[] | undefined,
  path: string,
  label: string,
  diagnostics: Diagnostic[],
): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.trim() !== entry || entry.length === 0 || seen.has(entry)) {
      diagnostics.push({
        code: label === 'allowed ids'
          ? CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_ALLOWED_IDS_INVALID
          : CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PARAMETER_VALUES_INVALID,
        path: `${path}.${index}`,
        severity: 'error',
        message: `agents parameter ${label} entries must be unique non-empty strings.`,
        suggestion: 'Use trimmed unique string ids only.',
      });
      return null;
    }
    seen.add(entry);
    normalized.push(entry);
  }

  return normalized;
}

function isAgentParameterType(value: unknown): value is AgentParameterType {
  return typeof value === 'string' && AGENT_PARAMETER_TYPES.includes(value as AgentParameterType);
}

function diagnosticsContainProfileUseErrors(profileId: string, diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.path.startsWith(`doc.agents.profiles.${profileId}.use.`)
      && diagnostic.severity === 'error',
  );
}
