import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { createEmptyGameSpecDoc } from './game-spec-doc.js';
import { parseGameSpec, type ParseGameSpecOptions, type ParseGameSpecResult } from './parser.js';
import { sortDiagnosticsDeterministic } from './compiler-diagnostics.js';
import { normalizeIdentifier } from './identifier-utils.js';
import type { GameSpecSourceMap, SourceSpan } from './source-map.js';

const SINGLETON_SECTIONS = [
  'metadata',
  'constants',
  'turnStructure',
  'turnOrder',
  'terminal',
  'observability',
  'agents',
  'victoryStandings',
  'verbalization',
] as const;
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
  'phaseTemplates',
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

  const visit = (sourceId: string, from?: { readonly sourceId: string; readonly importIndex: number }): void => {
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
    if (section === 'eventDecks') {
      mergeEventDeckSections(target, source, diagnostics, targetSourceMapByPath, blockOffset);
      continue;
    }
    const existingList = existing === null ? [] : [...existing];
    const incomingList = [...incoming];
    const baseIndex = existingList.length;

    assignListSection(target, section, [...existingList, ...incomingList]);
    copySectionSourceMapEntries(section, source.parsed.sourceMap, targetSourceMapByPath, blockOffset, baseIndex);
  }
}

function mergeEventDeckSections(
  target: GameSpecDoc,
  source: ParsedSource,
  diagnostics: Diagnostic[],
  targetSourceMapByPath: Record<string, SourceSpan>,
  blockOffset: number,
): void {
  const incomingDecks = source.parsed.doc.eventDecks;
  if (incomingDecks === null) {
    return;
  }

  const existingDecks = target.eventDecks === null ? [] : [...target.eventDecks];
  const deckIndexByNormalizedId = new Map<string, number>();
  for (const [index, deck] of existingDecks.entries()) {
    deckIndexByNormalizedId.set(normalizeIdentifier(deck.id), index);
  }

  for (const [incomingDeckIndex, incomingDeck] of incomingDecks.entries()) {
    const normalizedDeckId = normalizeIdentifier(incomingDeck.id);
    const existingDeckIndex = deckIndexByNormalizedId.get(normalizedDeckId);
    if (existingDeckIndex === undefined) {
      const targetDeckIndex = existingDecks.length;
      existingDecks.push(incomingDeck);
      deckIndexByNormalizedId.set(normalizedDeckId, targetDeckIndex);
      copyEventDeckSourceMapEntries(
        source.parsed.sourceMap,
        targetSourceMapByPath,
        blockOffset,
        incomingDeckIndex,
        targetDeckIndex,
        0,
        true,
      );
      continue;
    }

    const existingDeck = existingDecks[existingDeckIndex];
    if (existingDeck === undefined) {
      continue;
    }
    if (!areEventDeckDefinitionsCompatible(existingDeck, incomingDeck)) {
      diagnostics.push({
        code: 'CNL_COMPOSE_EVENT_DECK_CONFLICT',
        path: `doc.eventDecks.${incomingDeckIndex}`,
        severity: 'error',
        message: `Imported event deck "${incomingDeck.id}" redefines deck metadata inconsistently across fragments.`,
        suggestion: 'Keep draw/discard/shuffle deck metadata identical across fragments that append cards to one event deck.',
        entityId: source.sourceId,
      });
      continue;
    }

    const existingCardCount = existingDeck.cards.length;
    existingDecks[existingDeckIndex] = {
      ...existingDeck,
      cards: [...existingDeck.cards, ...incomingDeck.cards],
    };
    copyEventDeckSourceMapEntries(
      source.parsed.sourceMap,
      targetSourceMapByPath,
      blockOffset,
      incomingDeckIndex,
      existingDeckIndex,
      existingCardCount,
      false,
    );
  }

  assignListSection(target, 'eventDecks', existingDecks);
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

function copyEventDeckSourceMapEntries(
  sourceMap: GameSpecSourceMap,
  targetByPath: Record<string, SourceSpan>,
  blockOffset: number,
  sourceDeckIndex: number,
  targetDeckIndex: number,
  cardIndexOffset: number,
  includeDeckLevelEntries: boolean,
): void {
  const deckPrefix = `eventDecks[${sourceDeckIndex}]`;
  const cardPrefix = `${deckPrefix}.cards[`;

  for (const [path, span] of Object.entries(sourceMap.byPath)) {
    if (path !== deckPrefix && !path.startsWith(`${deckPrefix}.`) && !path.startsWith(cardPrefix)) {
      continue;
    }
    if (!includeDeckLevelEntries && !path.startsWith(cardPrefix)) {
      continue;
    }

    const mappedPath = remapEventDeckPath(path, sourceDeckIndex, targetDeckIndex, cardIndexOffset);
    const mappedSpan: SourceSpan = {
      ...span,
      blockIndex: span.blockIndex + blockOffset,
    };
    if (targetByPath[mappedPath] === undefined) {
      targetByPath[mappedPath] = mappedSpan;
    }
  }
}

function remapEventDeckPath(
  path: string,
  sourceDeckIndex: number,
  targetDeckIndex: number,
  cardIndexOffset: number,
): string {
  const expectedPrefix = `eventDecks[${sourceDeckIndex}]`;
  if (!path.startsWith(expectedPrefix)) {
    return path;
  }

  let mapped = `eventDecks[${targetDeckIndex}]${path.slice(expectedPrefix.length)}`;
  if (cardIndexOffset === 0) {
    return mapped;
  }

  mapped = mapped.replace(/^eventDecks\[\d+\]\.cards\[(\d+)\]/, (_match, rawIndex: string) => {
    const parsed = Number.parseInt(rawIndex, 10);
    return `eventDecks[${targetDeckIndex}].cards[${parsed + cardIndexOffset}]`;
  });
  return mapped;
}

function areEventDeckDefinitionsCompatible(
  left: NonNullable<GameSpecDoc['eventDecks']>[number],
  right: NonNullable<GameSpecDoc['eventDecks']>[number],
): boolean {
  return (
    normalizeIdentifier(left.id) === normalizeIdentifier(right.id)
    && left.drawZone === right.drawZone
    && left.discardZone === right.discardZone
    && (left.shuffleOnSetup ?? false) === (right.shuffleOnSetup ?? false)
  );
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
    case 'observability':
      mutable.observability = value as MutableGameSpecDoc['observability'];
      break;
    case 'agents':
      mutable.agents = value as MutableGameSpecDoc['agents'];
      break;
    case 'victoryStandings':
      mutable.victoryStandings = value as MutableGameSpecDoc['victoryStandings'];
      break;
    case 'verbalization':
      mutable.verbalization = value as MutableGameSpecDoc['verbalization'];
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
    case 'phaseTemplates':
      mutable.phaseTemplates = value as MutableGameSpecDoc['phaseTemplates'];
      break;
  }
}
