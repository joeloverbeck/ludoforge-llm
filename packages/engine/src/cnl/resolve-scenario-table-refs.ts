import type { Diagnostic } from '../kernel/diagnostics.js';
import type { RuntimeTableContract } from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

interface ResolveScenarioTableRefsOptions {
  readonly selectedScenarioAssetId?: string;
  readonly tableContracts: readonly RuntimeTableContract[];
  readonly diagnostics: Diagnostic[];
}

export function resolveScenarioTableRefsInDoc(
  doc: GameSpecDoc,
  options: ResolveScenarioTableRefsOptions,
): GameSpecDoc {
  const tablePathsForSelectedScenario =
    options.selectedScenarioAssetId === undefined
      ? new Set<string>()
      : new Set(
          options.tableContracts
            .filter((contract) => contract.assetId === options.selectedScenarioAssetId)
            .map((contract) => contract.tablePath),
        );

  const resolveTableId = (tableId: string, path: string): string => {
    const normalized = tableId.trim();
    if (normalized === '') {
      return tableId;
    }

    if (normalized.includes('::')) {
      const pathOnly = normalized.includes('::') ? normalized.split('::').slice(1).join('::') : normalized;
      options.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TABLE_REF_LEGACY_LITERAL,
        path,
        severity: 'error',
        message: `Legacy table reference "${tableId}" is not allowed in GameSpec.`,
        suggestion:
          pathOnly.trim() === ''
            ? 'Use a scenario-relative table path such as "settings.blindSchedule".'
            : `Use scenario-relative table path "${pathOnly.trim()}" (without scenario asset id).`,
      });
      return tableId;
    }

    if (options.selectedScenarioAssetId === undefined) {
      options.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TABLE_REF_SCENARIO_REQUIRED,
        path,
        severity: 'error',
        message: `Cannot resolve scenario-relative table reference "${tableId}" because no scenario is selected.`,
        suggestion: 'Set metadata.defaultScenarioAssetId (or define exactly one scenario data asset).',
      });
      return tableId;
    }

    if (!tablePathsForSelectedScenario.has(normalized)) {
      options.diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TABLE_REF_PATH_UNKNOWN,
        path,
        severity: 'error',
        message: `Scenario table path "${tableId}" not found in selected scenario "${options.selectedScenarioAssetId}".`,
        suggestion: 'Use a table path that exists under the selected scenario payload.',
        alternatives: [...tablePathsForSelectedScenario].sort((left, right) => left.localeCompare(right)),
      });
      return tableId;
    }

    return `${options.selectedScenarioAssetId}::${normalized}`;
  };

  const visit = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) {
      let changed = false;
      const next = node.map((entry, index) => {
        const lowered = visit(entry, `${path}.${index}`);
        if (lowered !== entry) {
          changed = true;
        }
        return lowered;
      });
      return changed ? next : node;
    }

    if (typeof node !== 'object' || node === null) {
      return node;
    }

    const source = node as Record<string, unknown>;
    let next: Record<string, unknown> | null = null;

    const rewriteTableId = (key: 'tableId', kindPath: string): void => {
      const current = (next ?? source)[key];
      if (typeof current !== 'string') {
        return;
      }
      const resolved = resolveTableId(current, `${kindPath}.${key}`);
      if (resolved !== current) {
        if (next === null) {
          next = { ...source };
        }
        next[key] = resolved;
      }
    };

    if (source.query === 'assetRows') {
      rewriteTableId('tableId', path);
    }
    if (source.ref === 'assetField') {
      rewriteTableId('tableId', path);
    }

    for (const [key, value] of Object.entries(next ?? source)) {
      const lowered = visit(value, `${path}.${key}`);
      if (lowered !== value) {
        if (next === null) {
          next = { ...source };
        }
        next[key] = lowered;
      }
    }

    return next ?? node;
  };

  return visit(doc, 'doc') as GameSpecDoc;
}
