import type {
  Diagnostic,
  DiagnosticMacroOrigin,
  DiagnosticSeverity,
  DiagnosticSourcePointer,
  DiagnosticSourceSpan,
} from '../kernel/diagnostics.js';
import { resolveSpanForDiagnosticPath } from './diagnostic-source-map.js';
import type { GameSpecSourceMap } from './source-map.js';

const DIAGNOSTIC_SEVERITY_RANK: Readonly<Record<DiagnosticSeverity, number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

const NO_SOURCE_ORDER = Number.POSITIVE_INFINITY;

export function getDiagnosticSeverityRank(severity: DiagnosticSeverity): number {
  return DIAGNOSTIC_SEVERITY_RANK[severity];
}

export interface DiagnosticSortKey {
  readonly sourceOrder: number;
  readonly path: string;
  readonly severityRank: number;
  readonly code: string;
}

export function getDiagnosticSortKey(
  diagnostic: Diagnostic,
  sourceMap?: GameSpecSourceMap,
): DiagnosticSortKey {
  return {
    sourceOrder: resolveSourceOrder(diagnostic.path, sourceMap),
    path: diagnostic.path,
    severityRank: getDiagnosticSeverityRank(diagnostic.severity),
    code: diagnostic.code,
  };
}

export function compareDiagnosticsDeterministic(
  left: Diagnostic,
  right: Diagnostic,
  sourceMap?: GameSpecSourceMap,
): number {
  const leftKey = getDiagnosticSortKey(left, sourceMap);
  const rightKey = getDiagnosticSortKey(right, sourceMap);

  if (leftKey.sourceOrder !== rightKey.sourceOrder) {
    return leftKey.sourceOrder - rightKey.sourceOrder;
  }

  const pathComparison = leftKey.path.localeCompare(rightKey.path);
  if (pathComparison !== 0) {
    return pathComparison;
  }

  if (leftKey.severityRank !== rightKey.severityRank) {
    return leftKey.severityRank - rightKey.severityRank;
  }

  const codeComparison = leftKey.code.localeCompare(rightKey.code);
  if (codeComparison !== 0) {
    return codeComparison;
  }

  return left.message.localeCompare(right.message);
}

export function sortDiagnosticsDeterministic(
  diagnostics: readonly Diagnostic[],
  sourceMap?: GameSpecSourceMap,
): readonly Diagnostic[] {
  return [...diagnostics].sort((left, right) => compareDiagnosticsDeterministic(left, right, sourceMap));
}

export function dedupeDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  const seen = new Set<string>();
  const deduped: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = serializeDiagnosticForDeduping(diagnostic);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(diagnostic);
  }

  return deduped;
}

export function capDiagnostics(
  diagnostics: readonly Diagnostic[],
  maxDiagnosticCount: number,
): readonly Diagnostic[] {
  if (!Number.isInteger(maxDiagnosticCount) || maxDiagnosticCount < 0) {
    throw new Error('maxDiagnosticCount must be an integer >= 0.');
  }

  if (diagnostics.length <= maxDiagnosticCount) {
    return [...diagnostics];
  }

  return diagnostics.slice(0, maxDiagnosticCount);
}

function serializeDiagnosticForDeduping(diagnostic: Diagnostic): string {
  const alternatives = diagnostic.alternatives === undefined ? '' : diagnostic.alternatives.join('\u001f');
  return [
    diagnostic.code,
    diagnostic.path,
    diagnostic.severity,
    diagnostic.message,
    diagnostic.suggestion ?? '',
    diagnostic.contextSnippet ?? '',
    alternatives,
    diagnostic.assetPath ?? '',
    diagnostic.entityId ?? '',
    serializeMacroOriginForDeduping(diagnostic.macroOrigin),
  ].join('\u001e');
}

function serializeMacroOriginForDeduping(macroOrigin: Diagnostic['macroOrigin']): string {
  if (macroOrigin === undefined) {
    return '';
  }

  return [
    serializeSourcePointerForDeduping(macroOrigin.invocation),
    serializeSourcePointerForDeduping(macroOrigin.declaration),
    serializeSourcePointerForDeduping(macroOrigin.expanded),
  ].join('\u001d');
}

function serializeSourcePointerForDeduping(pointer: DiagnosticSourcePointer | undefined): string {
  if (pointer === undefined) {
    return '';
  }

  return [pointer.path, serializeSourceSpanForDeduping(pointer.span)].join('\u001c');
}

function serializeSourceSpanForDeduping(span: DiagnosticSourceSpan | undefined): string {
  if (span === undefined) {
    return '';
  }

  return [
    span.sourceId ?? '',
    String(span.blockIndex),
    String(span.markdownLineStart),
    String(span.markdownColStart),
    String(span.markdownLineEnd),
    String(span.markdownColEnd),
  ].join('\u001b');
}

export function annotateDiagnosticWithSourceSpans(
  diagnostic: Diagnostic,
  sourceMap?: GameSpecSourceMap,
): Diagnostic {
  if (sourceMap === undefined) {
    return diagnostic;
  }

  const origin = diagnostic.macroOrigin;
  if (origin === undefined) {
    return diagnostic;
  }

  const annotatedOrigin = annotateMacroOrigin(origin, sourceMap);
  if (annotatedOrigin === origin) {
    return diagnostic;
  }

  return {
    ...diagnostic,
    macroOrigin: annotatedOrigin,
  };
}

function annotateMacroOrigin(origin: DiagnosticMacroOrigin, sourceMap: GameSpecSourceMap): DiagnosticMacroOrigin {
  const invocation = annotateSourcePointer(origin.invocation, sourceMap);
  const declaration = annotateSourcePointer(origin.declaration, sourceMap);
  const expanded = annotateSourcePointer(origin.expanded, sourceMap);
  if (invocation === origin.invocation && declaration === origin.declaration && expanded === origin.expanded) {
    return origin;
  }
  return {
    ...(invocation === undefined ? {} : { invocation }),
    ...(declaration === undefined ? {} : { declaration }),
    ...(expanded === undefined ? {} : { expanded }),
  };
}

function annotateSourcePointer(
  pointer: DiagnosticSourcePointer | undefined,
  sourceMap: GameSpecSourceMap,
): DiagnosticSourcePointer | undefined {
  if (pointer === undefined || pointer.span !== undefined) {
    return pointer;
  }

  const span = resolveSpanForDiagnosticPath(pointer.path, sourceMap);
  if (span === undefined) {
    return pointer;
  }

  return { ...pointer, span };
}

function resolveSourceOrder(path: string, sourceMap?: GameSpecSourceMap): number {
  const span = resolveSpanForDiagnosticPath(path, sourceMap);
  if (span === undefined) {
    return NO_SOURCE_ORDER;
  }

  return (
    span.blockIndex * 1_000_000_000 +
    span.markdownLineStart * 1_000_000 +
    span.markdownColStart * 1_000 +
    span.markdownLineEnd * 10 +
    span.markdownColEnd
  );
}
