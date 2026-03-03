import * as assert from 'node:assert/strict';
import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { GameSpecSourceMap } from '../../src/cnl/source-map.js';
import type { RuntimeWarning } from '../../src/kernel/types.js';

export function assertNoDiagnostics(
  result: { readonly diagnostics: readonly Diagnostic[] },
  sourceMap?: GameSpecSourceMap,
): void {
  if (result.diagnostics.length === 0) return;
  const formatted = formatDiagnostics(result.diagnostics, sourceMap);
  assert.fail(`Expected 0 diagnostics, got ${result.diagnostics.length}:\n${formatted}`);
}

export function assertNoErrors(
  result: { readonly diagnostics: readonly Diagnostic[] },
): void {
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length === 0) return;
  const formatted = formatDiagnostics(errors);
  assert.fail(`Expected 0 errors, got ${errors.length}:\n${formatted}`);
}

export function assertNoWarnings(
  result: { readonly warnings: readonly RuntimeWarning[] },
): void {
  if (result.warnings.length === 0) return;
  const formatted = result.warnings
    .map((w) => `  [${w.code}] ${w.message}${w.hint ? ` (${w.hint})` : ''}`)
    .join('\n');
  assert.fail(`Expected 0 runtime warnings, got ${result.warnings.length}:\n${formatted}`);
}

export function assertDataAssetCascadeSuppression(options: {
  readonly diagnostics: readonly Diagnostic[];
  readonly cascadeCode: 'CNL_DATA_ASSET_CASCADE_ZONES_MISSING' | 'CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING';
  readonly requiredSectionPath: 'doc.zones' | 'doc.tokenTypes';
  readonly messageIncludes: string;
  readonly suggestionIncludes: string;
}): Diagnostic {
  const cascadeDiagnostic = options.diagnostics.find((diagnostic) => diagnostic.code === options.cascadeCode);
  if (cascadeDiagnostic === undefined) {
    assert.fail(`Expected cascade diagnostic ${options.cascadeCode} to be present.`);
  }
  assert.equal(
    options.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_REQUIRED_SECTION_MISSING'
        && diagnostic.path === options.requiredSectionPath,
    ),
    false,
  );
  assert.equal(cascadeDiagnostic.message.includes(options.messageIncludes), true);
  assert.equal(cascadeDiagnostic.suggestion?.includes(options.suggestionIncludes), true);
  return cascadeDiagnostic;
}

export function formatDiagnostics(
  diagnostics: readonly Diagnostic[],
  sourceMap?: GameSpecSourceMap,
): string {
  return diagnostics
    .map((d) => {
      const location = sourceMap?.byPath[d.path];
      const loc = location !== undefined ? ` (line ${location.markdownLineStart})` : '';
      const suggestion = d.suggestion !== undefined ? `\n    suggestion: ${d.suggestion}` : '';
      const snippet = d.contextSnippet !== undefined ? `\n    snippet: ${d.contextSnippet}` : '';
      return `  [${d.severity}] ${d.code} at ${d.path}${loc}\n    ${d.message}${suggestion}${snippet}`;
    })
    .join('\n');
}
