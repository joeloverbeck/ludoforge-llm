import type { Diagnostic } from '../kernel/diagnostics.js';

export const CNL_COMPILER_DIAGNOSTIC_CODES = Object.freeze({
  CNL_COMPILER_BINDING_SHADOWED: 'CNL_COMPILER_BINDING_SHADOWED',
  CNL_COMPILER_MISSING_CAPABILITY: 'CNL_COMPILER_MISSING_CAPABILITY',
  CNL_COMPILER_ZONE_VAR_TYPE_INVALID: 'CNL_COMPILER_ZONE_VAR_TYPE_INVALID',
  CNL_COMPILER_TURN_STRUCTURE_LEGACY_FIELD_UNSUPPORTED: 'CNL_COMPILER_TURN_STRUCTURE_LEGACY_FIELD_UNSUPPORTED',
  CNL_COMPILER_ACTION_PHASE_DUPLICATE: 'CNL_COMPILER_ACTION_PHASE_DUPLICATE',
  CNL_COMPILER_ACTION_CAPABILITY_DUPLICATE: 'CNL_COMPILER_ACTION_CAPABILITY_DUPLICATE',
} as const);

export type CnlCompilerDiagnosticCode =
  (typeof CNL_COMPILER_DIAGNOSTIC_CODES)[keyof typeof CNL_COMPILER_DIAGNOSTIC_CODES];

interface BuildCompilerMissingCapabilityDiagnosticInput {
  readonly path: string;
  readonly label: string;
  readonly actual: unknown;
  readonly alternatives?: readonly string[];
}

export function buildCompilerBindingShadowWarningDiagnostic(name: string, path: string): Diagnostic {
  return {
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_SHADOWED,
    path,
    severity: 'warning',
    message: `Binding "${name}" shadows an outer binding.`,
    suggestion: 'Rename the inner binding to avoid accidental capture.',
  };
}

export function buildCompilerMissingCapabilityDiagnostic({
  path,
  label,
  actual,
  alternatives = [],
}: BuildCompilerMissingCapabilityDiagnosticInput): Diagnostic {
  return {
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
    path,
    severity: 'error',
    message: `Cannot lower ${label}: ${formatValue(actual)}.`,
    suggestion: alternatives.length > 0 ? 'Use one of the supported forms.' : 'Use a supported compiler shape.',
    ...(alternatives.length === 0 ? {} : { alternatives: [...alternatives] }),
  };
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
