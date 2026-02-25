import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { createEmptyGameSpecDoc } from './game-spec-doc.js';
import { parseGameSpec, type ParseGameSpecOptions, type ParseGameSpecResult } from './parser.js';
import { sortDiagnosticsDeterministic } from './compiler-diagnostics.js';
import type { GameSpecSourceMap, SourceSpan } from './source-map.js';

const SINGLETON_SECTIONS = ['metadata', 'constants', 'turnStructure', 'turnOrder', 'terminal'] as const;
const LIST_SECTIONS = [
  'dataAssets',
  'globalMarkerLattices',
  'globalVars',
  'perPlayerVars',
  'zoneVars',
  'zones',
  'tokenTypes',
  'setup',
  'actionPipelines',
  'derivedMetrics',
  'eventDecks',
  'actions',
  'triggers',
  'effectMacros',
  'conditionMacros',
] as const;

interface ParsedSource {
  readonly sourceId: string;
  readonly parsed: ParseGameSpecResult;
}

export interface ComposeGameSpecOptions {
  readonly loadSource: (sourceId: string) => string | null;
  readonly resolveImport: (importPath: string, importerSourceId: string) => string | null;
  readonly parseOptions?: Omit<ParseGameSpecOptions, 'sourceId'>;
}

export interface ComposeGameSpecResult {
  readonly doc: GameSpecDoc;
  readonly sourceMap: GameSpecSourceMap;
  readonly diagnostics: readonly Diagnostic[];
  readonly sourceOrder: readonly string[];
}

export function composeGameSpec(entrySourceId: string, options: ComposeGameSpecOptions): ComposeGameSpecResult {
  const diagnostics: Diagnostic[] = [];
  const sourceOrder: string[] = [];
  const parsedBySourceId = new Map<string, ParsedSource>();
  const visitingStack: string[] = [];
  const visitingSet = new Set<string>();

  const visit = (sourceId: string, from?: { readonly sourceId: string; readonly importIndex: number }) => {
    if (parsedBySourceId.has(sourceId)) {
      return;
    }

    if (visitingSet.has(sourceId)) {
      diagnostics.push({
        code: 'CNL_COMPOSE_IMPORT_CYCLE',
        path: from === undefined ? 'doc.imports' : `doc.imports.${from.importIndex}`,
        severity: 'error',
        message: `Import cycle detected: ${[...visitingStack, sourceId].join(' -> ')}.`,
        suggestion: 'Break the import cycle so each fragment is reachable by an acyclic import graph.',
      });
      return;
    }

    const markdown = options.loadSource(sourceId);
    if (markdown === null) {
      diagnostics.push({
        code: 'CNL_COMPOSE_IMPORT_NOT_FOUND',
        path: from === undefined ? 'doc.imports' : `doc.imports.${from.importIndex}`,
        severity: 'error',
        message: `Unable to load imported source "${sourceId}".`,
        suggestion: 'Fix the import path or provide a source resolver that can load this fragment.',
      });
      return;
    }

    visitingSet.add(sourceId);
    visitingStack.push(sourceId);

    const parsed = parseGameSpec(markdown, {
      ...options.parseOptions,
      sourceId,
    });
    diagnostics.push(...parsed.diagnostics);

    for (const [index, specifier] of (parsed.doc.imports ?? []).map((entry) => entry.path).entries()) {
      const resolved = options.resolveImport(specifier, sourceId);
      if (resolved === null) {
        diagnostics.push({
          code: 'CNL_COMPOSE_IMPORT_RESOLVE_FAILED',
          path: `doc.imports.${index}`,
          severity: 'error',
          message: `Unable to resolve import "${specifier}" from "${sourceId}".`,
          suggestion: 'Fix the import path or update import resolution for this source root.',
        });
        continue;
      }

      visit(resolved, { sourceId, importIndex: index });
    }

    visitingStack.pop();
    visitingSet.delete(sourceId);
    parsedBySourceId.set(sourceId, { sourceId, parsed });
    sourceOrder.push(sourceId);
  };

  visit(entrySourceId);

  const mergedDoc = createEmptyGameSpecDoc();
  const mergedSourceMapByPath: Record<string, SourceSpan> = {};
  let blockOffset = 0;

  for (const sourceId of sourceOrder) {
    const parsedSource = parsedBySourceId.get(sourceId);
    if (parsedSource === undefined) {
      continue;
    }

    mergeSingleSource(mergedDoc, parsedSource, diagnostics, mergedSourceMapByPath, blockOffset);
    blockOffset += Math.max(1, maxBlockIndex(parsedSource.parsed.sourceMap) + 1);
  }

  const mergedSourceMap: GameSpecSourceMap = { byPath: mergedSourceMapByPath };
  const sortedDiagnostics = sortDiagnosticsDeterministic(diagnostics, mergedSourceMap);

  return {
    doc: {
      ...mergedDoc,
      imports: null,
    },
    sourceMap: mergedSourceMap,
    diagnostics: sortedDiagnostics,
    sourceOrder,
  };
}

function mergeSingleSource(
  target: GameSpecDoc,
  source: ParsedSource,
  diagnostics: Diagnostic[],
  targetSourceMapByPath: Record<string, SourceSpan>,
  blockOffset: number,
): void {
  for (const section of SINGLETON_SECTIONS) {
    const nextValue = source.parsed.doc[section];
    if (nextValue === null) {
      continue;
    }

    if (target[section] !== null) {
      diagnostics.push({
        code: 'CNL_COMPOSE_SINGLETON_CONFLICT',
        path: `doc.${section}`,
        severity: 'error',
        message: `Singleton section "${section}" is defined in multiple imported fragments.`,
        suggestion: `Keep "${section}" in exactly one fragment in the import graph.`,
        entityId: source.sourceId,
      });
      continue;
    }

    assignSingletonSection(target, section, nextValue);
    copySectionSourceMapEntries(section, source.parsed.sourceMap, targetSourceMapByPath, blockOffset);
  }

  for (const section of LIST_SECTIONS) {
    const existing = target[section];
    const incoming = source.parsed.doc[section];
    if (incoming === null) {
      continue;
    }
    const existingList = existing === null ? [] : [...existing];
    const incomingList = [...incoming];
    const baseIndex = existingList.length;

    assignListSection(target, section, [...existingList, ...incomingList]);
    copySectionSourceMapEntries(section, source.parsed.sourceMap, targetSourceMapByPath, blockOffset, baseIndex);
  }
}

function copySectionSourceMapEntries(
  section: (typeof SINGLETON_SECTIONS)[number] | (typeof LIST_SECTIONS)[number],
  sourceMap: GameSpecSourceMap,
  targetByPath: Record<string, SourceSpan>,
  blockOffset: number,
  listIndexOffset = 0,
): void {
  for (const [path, span] of Object.entries(sourceMap.byPath)) {
    if (path !== section && !path.startsWith(`${section}.`) && !path.startsWith(`${section}[`)) {
      continue;
    }

    const mappedPath = listIndexOffset > 0 ? remapListPath(section, path, listIndexOffset) : path;
    const mappedSpan: SourceSpan = {
      ...span,
      blockIndex: span.blockIndex + blockOffset,
    };

    if (targetByPath[mappedPath] === undefined) {
      targetByPath[mappedPath] = mappedSpan;
    }
  }
}

function remapListPath(section: string, path: string, indexOffset: number): string {
  return path.replace(new RegExp(`^${escapeRegex(section)}\\[(\\d+)\\]`), (_match, rawIndex: string) => {
    const parsed = Number.parseInt(rawIndex, 10);
    return `${section}[${parsed + indexOffset}]`;
  });
}

function maxBlockIndex(sourceMap: GameSpecSourceMap): number {
  const spans = Object.values(sourceMap.byPath);
  if (spans.length === 0) {
    return 0;
  }
  return spans.reduce((max, span) => Math.max(max, span.blockIndex), 0);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type MutableGameSpecDoc = {
  -readonly [Key in keyof GameSpecDoc]: GameSpecDoc[Key];
};

function assignSingletonSection(
  target: GameSpecDoc,
  section: (typeof SINGLETON_SECTIONS)[number],
  value: NonNullable<GameSpecDoc[(typeof SINGLETON_SECTIONS)[number]]>,
): void {
  const mutable = target as MutableGameSpecDoc;
  switch (section) {
    case 'metadata':
      mutable.metadata = value as MutableGameSpecDoc['metadata'];
      break;
    case 'constants':
      mutable.constants = value as MutableGameSpecDoc['constants'];
      break;
    case 'turnStructure':
      mutable.turnStructure = value as MutableGameSpecDoc['turnStructure'];
      break;
    case 'turnOrder':
      mutable.turnOrder = value as MutableGameSpecDoc['turnOrder'];
      break;
    case 'terminal':
      mutable.terminal = value as MutableGameSpecDoc['terminal'];
      break;
  }
}

function assignListSection(
  target: GameSpecDoc,
  section: (typeof LIST_SECTIONS)[number],
  value: readonly unknown[],
): void {
  const mutable = target as MutableGameSpecDoc;
  switch (section) {
    case 'dataAssets':
      mutable.dataAssets = value as MutableGameSpecDoc['dataAssets'];
      break;
    case 'globalMarkerLattices':
      mutable.globalMarkerLattices = value as MutableGameSpecDoc['globalMarkerLattices'];
      break;
    case 'globalVars':
      mutable.globalVars = value as MutableGameSpecDoc['globalVars'];
      break;
    case 'perPlayerVars':
      mutable.perPlayerVars = value as MutableGameSpecDoc['perPlayerVars'];
      break;
    case 'zoneVars':
      mutable.zoneVars = value as MutableGameSpecDoc['zoneVars'];
      break;
    case 'zones':
      mutable.zones = value as MutableGameSpecDoc['zones'];
      break;
    case 'tokenTypes':
      mutable.tokenTypes = value as MutableGameSpecDoc['tokenTypes'];
      break;
    case 'setup':
      mutable.setup = value as MutableGameSpecDoc['setup'];
      break;
    case 'actionPipelines':
      mutable.actionPipelines = value as MutableGameSpecDoc['actionPipelines'];
      break;
    case 'derivedMetrics':
      mutable.derivedMetrics = value as MutableGameSpecDoc['derivedMetrics'];
      break;
    case 'eventDecks':
      mutable.eventDecks = value as MutableGameSpecDoc['eventDecks'];
      break;
    case 'actions':
      mutable.actions = value as MutableGameSpecDoc['actions'];
      break;
    case 'triggers':
      mutable.triggers = value as MutableGameSpecDoc['triggers'];
      break;
    case 'effectMacros':
      mutable.effectMacros = value as MutableGameSpecDoc['effectMacros'];
      break;
    case 'conditionMacros':
      mutable.conditionMacros = value as MutableGameSpecDoc['conditionMacros'];
      break;
  }
}
