import type { Diagnostic } from '../kernel/diagnostics.js';
import { hasBindingIdentifier } from '../kernel/binding-identifier-contract.js';

export function createBindingShadowWarning(name: string, path: string): Diagnostic {
  return {
    code: 'CNL_COMPILER_BINDING_SHADOWED',
    path,
    severity: 'warning',
    message: `Binding "${name}" shadows an outer binding.`,
    suggestion: 'Rename the inner binding to avoid accidental capture.',
  };
}

export function bindingShadowWarningsForScope(name: string, path: string, scope?: readonly string[]): readonly Diagnostic[] {
  if (scope === undefined || !hasBindingIdentifier(name, scope)) {
    return [];
  }
  return [createBindingShadowWarning(name, path)];
}
