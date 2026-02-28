import type { Diagnostic } from '../kernel/diagnostics.js';
import { hasBindingIdentifier } from '../kernel/binding-identifier-contract.js';
import { buildCompilerBindingShadowWarningDiagnostic } from './compiler-diagnostic-codes.js';

export function createBindingShadowWarning(name: string, path: string): Diagnostic {
  return buildCompilerBindingShadowWarningDiagnostic(name, path);
}

export function bindingShadowWarningsForScope(name: string, path: string, scope?: readonly string[]): readonly Diagnostic[] {
  if (scope === undefined || !hasBindingIdentifier(name, scope)) {
    return [];
  }
  return [createBindingShadowWarning(name, path)];
}
