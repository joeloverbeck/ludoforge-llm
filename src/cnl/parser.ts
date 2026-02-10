import type { Diagnostic } from '../kernel/diagnostics.js';
import { createEmptyGameSpecDoc, type GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';
import { lintYamlHardening } from './yaml-linter.js';

export interface ParseGameSpecResult {
  readonly doc: GameSpecDoc;
  readonly sourceMap: GameSpecSourceMap;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ParseGameSpecOptions {
  readonly maxDiagnostics?: number;
}

const DEFAULT_MAX_DIAGNOSTICS = 500;

export function parseGameSpec(markdown: string, options: ParseGameSpecOptions = {}): ParseGameSpecResult {
  const diagnostics: Diagnostic[] = [];
  const yamlBlocks = extractYamlBlocks(markdown);

  for (const [index, block] of yamlBlocks.entries()) {
    diagnostics.push(
      ...lintYamlHardening(block, {
        pathPrefix: `yaml.block.${index}`,
      }),
    );
  }

  const cappedDiagnostics = applyDiagnosticCap(diagnostics, options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS);

  return {
    doc: createEmptyGameSpecDoc(),
    sourceMap: { byPath: {} },
    diagnostics: cappedDiagnostics,
  };
}

function extractYamlBlocks(markdown: string): readonly string[] {
  const blocks: string[] = [];
  const fencePattern = /```([A-Za-z0-9_-]*)\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(markdown)) !== null) {
    const fenceLabel = (match[1] ?? '').trim().toLowerCase();
    if (fenceLabel !== '' && fenceLabel !== 'yaml' && fenceLabel !== 'yml') {
      continue;
    }

    blocks.push(match[2] ?? '');
  }

  return blocks;
}

function applyDiagnosticCap(
  diagnostics: readonly Diagnostic[],
  maxDiagnostics: number,
): readonly Diagnostic[] {
  const normalizedCap = Number.isFinite(maxDiagnostics) ? Math.max(1, Math.floor(maxDiagnostics)) : DEFAULT_MAX_DIAGNOSTICS;
  if (diagnostics.length <= normalizedCap) {
    return diagnostics;
  }

  const kept = diagnostics.slice(0, Math.max(0, normalizedCap - 1));
  const droppedCount = diagnostics.length - kept.length;
  const truncationWarning: Diagnostic = {
    code: 'CNL_PARSER_DIAGNOSTICS_TRUNCATED',
    path: 'parser.diagnostics',
    severity: 'warning',
    message: `Diagnostic limit reached; ${droppedCount} additional diagnostic(s) were truncated.`,
    suggestion: 'Reduce YAML lint issues or increase parser maxDiagnostics when debugging.',
  };

  return [...kept, truncationWarning];
}
