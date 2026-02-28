import type { Diagnostic } from './diagnostics.js';

export function hasErrorDiagnosticAtPathSince(
  diagnostics: readonly Diagnostic[],
  startIndex: number,
  path: string,
): boolean {
  return diagnostics.slice(startIndex).some((diagnostic) =>
    diagnostic.severity === 'error'
    && (diagnostic.path === path || diagnostic.path.startsWith(`${path}.`) || diagnostic.path.startsWith(`${path}[`)));
}
