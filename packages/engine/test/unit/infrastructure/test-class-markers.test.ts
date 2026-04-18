// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

type TestClass = 'architectural-invariant' | 'convergence-witness' | 'golden-trace';

type MarkerCheck = {
  readonly testClass: TestClass;
  readonly markerLine: number;
};

type PatternHit = {
  readonly label: string;
  readonly line: number;
};

const VALID_TEST_CLASSES = new Set<TestClass>([
  'architectural-invariant',
  'convergence-witness',
  'golden-trace',
]);

const TEST_FILE_PATTERN = /\.test\.m?ts$/u;
const TEST_CLASS_PATTERN = /^\/\/\s*@test-class:\s*(\S+)\s*$/gmu;
const WITNESS_PATTERN = /^\/\/\s*@witness:\s*(\S+)\s*$/gmu;

const ARCHITECTURAL_SHAPE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'legalMoves quantifier',
    new RegExp(['for', '\\s*\\(', '\\s*const\\s+\\w+\\s+of\\s+legalMoves\\s*\\('].join(''), 'gu'),
  ],
  [
    'enumerateLegalMoves quantifier',
    new RegExp(['for', '\\s*\\(', '\\s*const\\s+\\w+\\s+of\\s+enumerateLegalMoves\\s*\\('].join(''), 'gu'),
  ],
  [
    'move forEach quantifier',
    new RegExp(['\\.forEach\\s*\\(', '\\s*\\(?\\s*move\\b'].join(''), 'gu'),
  ],
];

const CONVERGENCE_SHAPE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'exact trace length pin',
    new RegExp(['assert\\.equal\\s*\\(', '\\s*trace\\.moves', '\\.length\\s*,\\s*\\d+\\s*\\)'].join(''), 'gu'),
  ],
  [
    'indexed activePlayer pin',
    new RegExp(['assert\\.equal\\s*\\(', '\\s*trace\\.moves\\[\\d+\\]', '\\.activePlayer\\s*,'].join(''), 'gu'),
  ],
  [
    'activePlayer literal comparison',
    new RegExp(['activePlayer', '\\s*===\\s*\\d+'].join(''), 'gu'),
  ],
];

const thisDir = dirname(fileURLToPath(import.meta.url));
const engineRoot = resolve(thisDir, '..', '..', '..', '..');
const sourceTestRoot = resolve(engineRoot, 'test');

const toLineNumber = (text: string, index: number) => text.slice(0, index).split('\n').length;

const formatFailureGroup = (title: string, details: readonly string[]) =>
  details.length === 0 ? '' : `${title}\n${details.map((detail) => `- ${detail}`).join('\n')}\n`;

const isExcludedPath = (filePath: string) => {
  const segments = relative(sourceTestRoot, filePath).split(sep);
  return segments.includes('helpers') || segments.includes('fixtures') || segments.includes('dist');
};

const listCorpusFiles = async (): Promise<readonly string[]> => {
  const entries = await readdir(sourceTestRoot, { recursive: true, withFileTypes: true }) as Array<
    { readonly name: string; isFile: () => boolean; parentPath?: string }
  >;

  return entries
    .filter((entry) => entry.isFile() && TEST_FILE_PATTERN.test(entry.name))
    .map((entry) => resolve(entry.parentPath ?? sourceTestRoot, entry.name))
    .filter((filePath) => !isExcludedPath(filePath))
    .sort((left, right) => left.localeCompare(right));
};

const getMarkerCheck = (source: string, displayPath: string): MarkerCheck => {
  const matches = [...source.matchAll(TEST_CLASS_PATTERN)];
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `${displayPath} missing @test-class marker`
        : `${displayPath} has ${matches.length} @test-class markers`,
    );
  }

  const match = matches[0];
  assert.ok(match !== undefined);
  const rawClass = match[1];
  if (!VALID_TEST_CLASSES.has(rawClass as TestClass)) {
    throw new Error(`${displayPath} has invalid @test-class value "${rawClass}"`);
  }

  return {
    testClass: rawClass as TestClass,
    markerLine: toLineNumber(source, match.index ?? 0),
  };
};

const assertWitnessAdjacency = (source: string, displayPath: string, markerLine: number) => {
  const witnessMatches = [...source.matchAll(WITNESS_PATTERN)];
  if (witnessMatches.length !== 1) {
    throw new Error(
      witnessMatches.length === 0
        ? `${displayPath} missing @witness marker`
        : `${displayPath} has ${witnessMatches.length} @witness markers`,
    );
  }

  const witnessMatch = witnessMatches[0];
  assert.ok(witnessMatch !== undefined);
  const witnessLine = toLineNumber(source, witnessMatch.index ?? 0);
  if (witnessLine < markerLine || witnessLine > markerLine + 3) {
    throw new Error(
      `${displayPath} has @witness on line ${witnessLine}, expected within 3 lines of @test-class on line ${markerLine}`,
    );
  }
};

const collectPatternHits = (source: string, patterns: ReadonlyArray<readonly [string, RegExp]>): readonly PatternHit[] =>
  patterns.flatMap(([label, pattern]) =>
    [...source.matchAll(pattern)].map((match) => ({
      label,
      line: toLineNumber(source, match.index ?? 0),
    })),
  );

describe('test class markers', () => {
  it('enforces marker presence, witness adjacency, and best-effort mixed-shape discipline across the engine test corpus', async () => {
    const files = await listCorpusFiles();

    const missingMarkers: string[] = [];
    const invalidClasses: string[] = [];
    const missingWitnesses: string[] = [];
    const mixedShapes: string[] = [];

    for (const filePath of files) {
      const source = await readFile(filePath, 'utf8');
      const displayPath = relative(engineRoot, filePath);

      let markerCheck: MarkerCheck;
      try {
        markerCheck = getMarkerCheck(source, displayPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('invalid @test-class value')) {
          invalidClasses.push(message);
        } else {
          missingMarkers.push(message);
        }
        continue;
      }

      if (markerCheck.testClass === 'convergence-witness') {
        try {
          assertWitnessAdjacency(source, displayPath, markerCheck.markerLine);
        } catch (error) {
          missingWitnesses.push(error instanceof Error ? error.message : String(error));
        }
      }

      const architecturalHits = collectPatternHits(source, ARCHITECTURAL_SHAPE_PATTERNS);
      const convergenceHits = collectPatternHits(source, CONVERGENCE_SHAPE_PATTERNS);
      if (architecturalHits.length > 0 && convergenceHits.length > 0) {
        mixedShapes.push(
          `${displayPath} mixes architectural [${architecturalHits.map((hit) => `${hit.label}@L${hit.line}`).join(', ')}] `
            + `with convergence [${convergenceHits.map((hit) => `${hit.label}@L${hit.line}`).join(', ')}]`,
        );
      }
    }

    const failureReport = [
      formatFailureGroup('missing or duplicate @test-class markers', missingMarkers),
      formatFailureGroup('invalid @test-class values', invalidClasses),
      formatFailureGroup('missing or misplaced @witness markers', missingWitnesses),
      formatFailureGroup('mixed architectural/convergence assertion shapes', mixedShapes),
    ]
      .filter(Boolean)
      .join('\n');

    assert.equal(
      failureReport,
      '',
      [
        'Spec 133 marker discipline failed.',
        'The mixed-shape check is intentionally best-effort and currently keys only on move-legality quantifiers plus trajectory-pin assertions to avoid noisy false positives.',
        failureReport,
      ].filter(Boolean).join('\n\n'),
    );
  });
});
