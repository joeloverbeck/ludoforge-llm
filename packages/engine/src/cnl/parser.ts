import type { Diagnostic } from '../kernel/diagnostics.js';
import { parseDocument } from 'yaml';
import { createEmptyGameSpecDoc, type GameSpecDoc } from './game-spec-doc.js';
import {
  type CanonicalSectionKey,
  resolveSectionsFromBlock,
} from './section-identifier.js';
import type { GameSpecSourceMap, SourceSpan } from './source-map.js';
import { lintYamlHardening } from './yaml-linter.js';

export interface ParseGameSpecResult {
  readonly doc: GameSpecDoc;
  readonly sourceMap: GameSpecSourceMap;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ParseGameSpecOptions {
  readonly sourceId?: string;
  readonly maxInputBytes?: number;
  readonly maxYamlBlocks?: number;
  readonly maxBlockBytes?: number;
  readonly maxDiagnostics?: number;
}

const DEFAULT_MAX_INPUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_YAML_BLOCKS = 128;
const DEFAULT_MAX_BLOCK_BYTES = 512 * 1024;
const DEFAULT_MAX_DIAGNOSTICS = 500;

export function parseGameSpec(markdown: string, options: ParseGameSpecOptions = {}): ParseGameSpecResult {
  const diagnostics: Diagnostic[] = [];
  const maxInputBytes = normalizeLimit(options.maxInputBytes, DEFAULT_MAX_INPUT_BYTES, { allowZero: false });
  const maxYamlBlocks = normalizeLimit(options.maxYamlBlocks, DEFAULT_MAX_YAML_BLOCKS, { allowZero: true });
  const maxBlockBytes = normalizeLimit(options.maxBlockBytes, DEFAULT_MAX_BLOCK_BYTES, { allowZero: false });
  const doc = createEmptyGameSpecDoc();
  const sourceMapByPath: Record<string, GameSpecSourceMap['byPath'][string]> = {};

  const inputBytes = Buffer.byteLength(markdown, 'utf8');
  if (inputBytes > maxInputBytes) {
    diagnostics.push({
      code: 'CNL_PARSER_MAX_INPUT_BYTES_EXCEEDED',
      path: 'parser.input',
      severity: 'error',
      message: `Input exceeds maxInputBytes (${inputBytes} > ${maxInputBytes}).`,
      suggestion: 'Reduce markdown size or increase parseGameSpec maxInputBytes.',
    });

    return {
      doc,
      sourceMap: { byPath: sourceMapByPath },
      diagnostics: applyDiagnosticCap(diagnostics, options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS),
    };
  }

  const extractedBlocks = extractYamlBlocks(markdown);
  const yamlBlocks = extractedBlocks.slice(0, maxYamlBlocks);
  if (extractedBlocks.length > maxYamlBlocks) {
    diagnostics.push({
      code: 'CNL_PARSER_MAX_YAML_BLOCKS_EXCEEDED',
      path: 'parser.blocks',
      severity: 'warning',
      message: `YAML block count exceeds maxYamlBlocks (${extractedBlocks.length} > ${maxYamlBlocks}); extra blocks were skipped.`,
      suggestion: 'Reduce fenced YAML blocks or increase parseGameSpec maxYamlBlocks.',
    });
  }

  for (const [index, block] of yamlBlocks.entries()) {
    const blockBytes = Buffer.byteLength(block.text, 'utf8');
    if (blockBytes > maxBlockBytes) {
      diagnostics.push({
        code: 'CNL_PARSER_MAX_BLOCK_BYTES_EXCEEDED',
        path: `yaml.block.${index}.size`,
        severity: 'error',
        message: `YAML block exceeds maxBlockBytes (${blockBytes} > ${maxBlockBytes}).`,
        suggestion: 'Split large YAML blocks or increase parseGameSpec maxBlockBytes.',
      });
      continue;
    }

    diagnostics.push(
      ...lintYamlHardening(block.text, {
        pathPrefix: `yaml.block.${index}`,
      }),
    );

    const yamlDoc = parseDocument(block.text, {
      schema: 'core',
      strict: true,
      uniqueKeys: true,
    });

    if (yamlDoc.errors.length > 0) {
      for (const error of yamlDoc.errors) {
        const line = error.linePos?.[0]?.line;
        const col = error.linePos?.[0]?.col;
        diagnostics.push({
          code: 'CNL_PARSER_YAML_PARSE_ERROR',
          path: `yaml.block.${index}.parse`,
          severity: 'error',
          message:
            line !== undefined
              ? `YAML parse error at line ${line}${col !== undefined ? `, col ${col}` : ''}: ${error.message}`
              : error.message,
        });
      }
      continue;
    }

    const parsedRoot = yamlDoc.toJSON();
    const stages = resolveSectionsFromBlock(parsedRoot);
    if (stages.issue !== undefined) {
      diagnostics.push({
        code:
          stages.issue.code === 'UNKNOWN_EXPLICIT_SECTION'
            ? 'CNL_PARSER_SECTION_UNKNOWN'
            : 'CNL_PARSER_SECTION_AMBIGUOUS',
        path: `yaml.block.${index}.section`,
        severity: 'warning',
        message: stages.issue.message,
        ...(stages.issue.alternatives !== undefined ? { alternatives: stages.issue.alternatives } : {}),
      });
      continue;
    }

    for (const resolved of stages.resolved) {
      const anchoredPaths = mergeSection(doc, resolved.section, resolved.value, diagnostics);
      const span: SourceSpan = {
        ...(options.sourceId === undefined ? {} : { sourceId: options.sourceId }),
        blockIndex: index,
        markdownLineStart: block.markdownLineStart,
        markdownColStart: 1,
        markdownLineEnd: block.markdownLineEnd,
        markdownColEnd: 1,
      };

      for (const anchoredPath of anchoredPaths) {
        if (sourceMapByPath[anchoredPath] === undefined) {
          sourceMapByPath[anchoredPath] = span;
        }
      }
    }
  }

  const cappedDiagnostics = applyDiagnosticCap(diagnostics, options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS);

  return {
    doc,
    sourceMap: { byPath: sourceMapByPath },
    diagnostics: cappedDiagnostics,
  };
}

interface ExtractedYamlBlock {
  readonly text: string;
  readonly markdownLineStart: number;
  readonly markdownLineEnd: number;
}

function extractYamlBlocks(markdown: string): readonly ExtractedYamlBlock[] {
  const blocks: ExtractedYamlBlock[] = [];
  const fencePattern = /```([A-Za-z0-9_-]*)\r?\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(markdown)) !== null) {
    const fenceLabel = (match[1] ?? '').trim().toLowerCase();
    if (fenceLabel !== '' && fenceLabel !== 'yaml' && fenceLabel !== 'yml') {
      continue;
    }

    const blockText = match[2] ?? '';
    if (fenceLabel === '' && !looksLikeYamlMapping(blockText)) {
      continue;
    }

    const markdownLineStart = countLines(markdown, match.index) + 1;
    const markdownLineEnd = markdownLineStart + countLines(blockText, blockText.length) - 1;

    blocks.push({
      text: blockText,
      markdownLineStart,
      markdownLineEnd,
    });
  }

  return blocks;
}

function looksLikeYamlMapping(blockText: string): boolean {
  const doc = parseDocument(blockText, {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
  });
  if (doc.errors.length > 0) {
    return false;
  }
  const root = doc.toJSON();
  return typeof root === 'object' && root !== null && !Array.isArray(root);
}

function mergeSection(
  doc: GameSpecDoc,
  section: CanonicalSectionKey,
  value: unknown,
  diagnostics: Diagnostic[],
): readonly string[] {
  switch (section) {
    case 'metadata':
      return mergeSingletonMetadata(doc, section, value, diagnostics);
    case 'constants':
      return mergeSingletonConstants(doc, section, value, diagnostics);
    case 'turnStructure':
      return mergeSingletonTurnStructure(doc, section, value, diagnostics);
    case 'turnOrder':
      return mergeSingletonTurnOrder(doc, section, value, diagnostics);
    case 'terminal':
      return mergeSingletonTerminal(doc, section, value, diagnostics);
    case 'dataAssets':
    case 'globalMarkerLattices':
    case 'imports':
    case 'globalVars':
    case 'perPlayerVars':
    case 'zones':
    case 'tokenTypes':
    case 'setup':
    case 'actionPipelines':
    case 'eventDecks':
    case 'actions':
    case 'triggers':
    case 'effectMacros':
    case 'conditionMacros':
      return mergeListSection(doc, section, value);
  }
}

function mergeSingletonMetadata(
  doc: GameSpecDoc,
  section: 'metadata',
  value: unknown,
  diagnostics: Diagnostic[],
): readonly string[] {
  if (doc.metadata !== null) {
    diagnostics.push(duplicateSingletonSectionDiagnostic('metadata', 'doc.metadata'));
    return [];
  }

  (doc as MutableGameSpecDoc).metadata = asObjectOrNull(value) as MutableGameSpecDoc['metadata'];
  return buildAnchoredPaths(section, value);
}

function mergeSingletonConstants(
  doc: GameSpecDoc,
  section: 'constants',
  value: unknown,
  diagnostics: Diagnostic[],
): readonly string[] {
  if (doc.constants !== null) {
    diagnostics.push(duplicateSingletonSectionDiagnostic('constants', 'doc.constants'));
    return [];
  }

  (doc as MutableGameSpecDoc).constants = asObjectOrNull(value) as MutableGameSpecDoc['constants'];
  return buildAnchoredPaths(section, value);
}

function mergeSingletonTurnStructure(
  doc: GameSpecDoc,
  section: 'turnStructure',
  value: unknown,
  diagnostics: Diagnostic[],
): readonly string[] {
  if (doc.turnStructure !== null) {
    diagnostics.push(duplicateSingletonSectionDiagnostic('turnStructure', 'doc.turnStructure'));
    return [];
  }

  (doc as MutableGameSpecDoc).turnStructure = asObjectOrNull(value) as MutableGameSpecDoc['turnStructure'];
  return buildAnchoredPaths(section, value);
}

function mergeSingletonTurnOrder(
  doc: GameSpecDoc,
  section: 'turnOrder',
  value: unknown,
  diagnostics: Diagnostic[],
): readonly string[] {
  if (doc.turnOrder !== null) {
    diagnostics.push(duplicateSingletonSectionDiagnostic('turnOrder', 'doc.turnOrder'));
    return [];
  }

  (doc as MutableGameSpecDoc).turnOrder = asObjectOrNull(value) as MutableGameSpecDoc['turnOrder'];
  return buildAnchoredPaths(section, value);
}

function mergeSingletonTerminal(
  doc: GameSpecDoc,
  section: 'terminal',
  value: unknown,
  diagnostics: Diagnostic[],
): readonly string[] {
  if (doc.terminal !== null) {
    diagnostics.push(duplicateSingletonSectionDiagnostic('terminal', 'doc.terminal'));
    return [];
  }

  (doc as MutableGameSpecDoc).terminal = asObjectOrNull(value) as MutableGameSpecDoc['terminal'];
  return buildAnchoredPaths(section, value);
}

function mergeListSection(
  doc: GameSpecDoc,
  section:
    | 'imports'
    | 'dataAssets'
    | 'globalMarkerLattices'
    | 'globalVars'
    | 'perPlayerVars'
    | 'zones'
    | 'tokenTypes'
    | 'setup'
    | 'actionPipelines'
    | 'eventDecks'
    | 'actions'
    | 'triggers'
    | 'effectMacros'
    | 'conditionMacros',
  value: unknown,
): readonly string[] {
  const existingLength = getListSectionLength(doc, section);
  const listValue = asArray(value);
  switch (section) {
    case 'imports': {
      const normalizedImports = listValue
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => ({ path: entry }));
      (doc as MutableGameSpecDoc).imports = (
        doc.imports === null ? normalizedImports : [...doc.imports, ...normalizedImports]
      ) as MutableGameSpecDoc['imports'];
      return buildAnchoredPaths(section, listValue, existingLength);
    }
    case 'dataAssets':
      (doc as MutableGameSpecDoc).dataAssets = (
        doc.dataAssets === null ? listValue : [...doc.dataAssets, ...listValue]
      ) as MutableGameSpecDoc['dataAssets'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'globalMarkerLattices':
      (doc as MutableGameSpecDoc).globalMarkerLattices = (
        doc.globalMarkerLattices === null ? listValue : [...doc.globalMarkerLattices, ...listValue]
      ) as MutableGameSpecDoc['globalMarkerLattices'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'globalVars':
      (doc as MutableGameSpecDoc).globalVars = (
        doc.globalVars === null ? listValue : [...doc.globalVars, ...listValue]
      ) as MutableGameSpecDoc['globalVars'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'perPlayerVars':
      (doc as MutableGameSpecDoc).perPlayerVars =
        (doc.perPlayerVars === null ? listValue : [...doc.perPlayerVars, ...listValue]) as MutableGameSpecDoc['perPlayerVars'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'zones':
      (doc as MutableGameSpecDoc).zones = (doc.zones === null ? listValue : [...doc.zones, ...listValue]) as MutableGameSpecDoc['zones'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'tokenTypes':
      (doc as MutableGameSpecDoc).tokenTypes = (
        doc.tokenTypes === null ? listValue : [...doc.tokenTypes, ...listValue]
      ) as MutableGameSpecDoc['tokenTypes'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'setup':
      (doc as MutableGameSpecDoc).setup = (doc.setup === null ? listValue : [...doc.setup, ...listValue]) as MutableGameSpecDoc['setup'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'actionPipelines':
      (doc as MutableGameSpecDoc).actionPipelines = (
        doc.actionPipelines === null ? listValue : [...doc.actionPipelines, ...listValue]
      ) as MutableGameSpecDoc['actionPipelines'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'eventDecks':
      (doc as MutableGameSpecDoc).eventDecks = (
        doc.eventDecks === null ? listValue : [...doc.eventDecks, ...listValue]
      ) as MutableGameSpecDoc['eventDecks'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'actions':
      (doc as MutableGameSpecDoc).actions =
        (doc.actions === null ? listValue : [...doc.actions, ...listValue]) as MutableGameSpecDoc['actions'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'triggers':
      (doc as MutableGameSpecDoc).triggers =
        (doc.triggers === null ? listValue : [...doc.triggers, ...listValue]) as MutableGameSpecDoc['triggers'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'effectMacros':
      (doc as MutableGameSpecDoc).effectMacros =
        (doc.effectMacros === null ? listValue : [...doc.effectMacros, ...listValue]) as MutableGameSpecDoc['effectMacros'];
      return buildAnchoredPaths(section, listValue, existingLength);
    case 'conditionMacros':
      (doc as MutableGameSpecDoc).conditionMacros =
        (doc.conditionMacros === null ? listValue : [...doc.conditionMacros, ...listValue]) as MutableGameSpecDoc['conditionMacros'];
      return buildAnchoredPaths(section, listValue, existingLength);
  }
}

type MutableGameSpecDoc = {
  -readonly [Key in keyof GameSpecDoc]: GameSpecDoc[Key];
};

function asObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function getListSectionLength(
  doc: GameSpecDoc,
  section:
    | 'imports'
    | 'dataAssets'
    | 'globalMarkerLattices'
    | 'globalVars'
    | 'perPlayerVars'
    | 'zones'
    | 'tokenTypes'
    | 'setup'
    | 'actionPipelines'
    | 'eventDecks'
    | 'actions'
    | 'triggers'
    | 'effectMacros'
    | 'conditionMacros',
): number {
  const current = doc[section];
  if (current === null) {
    return 0;
  }
  return current.length;
}

function buildAnchoredPaths(
  rootPath: string,
  value: unknown,
  rootArrayIndexOffset = 0,
): readonly string[] {
  const paths = new Set<string>([rootPath]);
  collectAnchoredPaths(paths, rootPath, value, true, rootArrayIndexOffset);
  return [...paths];
}

function collectAnchoredPaths(
  paths: Set<string>,
  path: string,
  value: unknown,
  isRoot: boolean,
  rootArrayIndexOffset = 0,
): void {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const nextIndex = isRoot ? rootArrayIndexOffset + index : index;
      const entryPath = `${path}[${nextIndex}]`;
      paths.add(entryPath);
      collectAnchoredPaths(paths, entryPath, entry, false);
    }
    return;
  }

  if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      paths.add(childPath);
      collectAnchoredPaths(paths, childPath, entry, false);
    }
  }
}

function countLines(text: string, endExclusive: number): number {
  if (endExclusive <= 0) {
    return 1;
  }
  let lines = 1;
  for (let index = 0; index < endExclusive; index += 1) {
    if (text[index] === '\n') {
      lines += 1;
    }
  }
  return lines;
}

function duplicateSingletonSectionDiagnostic(section: string, path: string): Diagnostic {
  return {
    code: 'CNL_PARSER_DUPLICATE_SINGLETON_SECTION',
    path,
    severity: 'error',
    message: `Duplicate singleton section "${section}" is not allowed.`,
    suggestion: `Keep exactly one "${section}" section across parsed YAML blocks/imports.`,
  };
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

function normalizeLimit(
  value: number | undefined,
  fallback: number,
  options: { readonly allowZero: boolean },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  if (options.allowZero) {
    return Math.max(0, normalized);
  }
  return Math.max(1, normalized);
}
