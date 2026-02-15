import type { Diagnostic } from '../kernel/diagnostics.js';

export interface SelectorBindingContract {
  readonly selector: unknown;
  readonly role: string;
  readonly path: string;
  readonly diagnosticCode: string;
}

export function collectMissingSelectorBindingDiagnostics(
  bindingScope: readonly string[],
  contracts: readonly SelectorBindingContract[],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const contract of contracts) {
    const binding = resolveSelectorBindingToken(contract.selector);
    if (binding === null || bindingScope.includes(binding)) {
      continue;
    }
    diagnostics.push({
      code: contract.diagnosticCode,
      path: contract.path,
      severity: 'error',
      message: `Action ${contract.role} binding "${binding}" is not declared in action params.`,
      suggestion: `Declare a matching action param (for example name: "$owner") or use a non-binding ${contract.role} selector.`,
    });
  }
  return diagnostics;
}

function resolveSelectorBindingToken(selector: unknown): string | null {
  if (selector === null || typeof selector === 'string' || typeof selector !== 'object') {
    return null;
  }
  return 'chosen' in selector && typeof selector.chosen === 'string' ? selector.chosen : null;
}
