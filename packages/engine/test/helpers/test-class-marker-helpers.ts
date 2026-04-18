import * as assert from 'node:assert/strict';
import { relative, sep } from 'node:path';

export type TestClass = 'architectural-invariant' | 'convergence-witness' | 'golden-trace';

export type MarkerCheck = {
  readonly testClass: TestClass;
  readonly markerLine: number;
};

export type PatternHit = {
  readonly label: string;
  readonly line: number;
};

const VALID_TEST_CLASSES = new Set<TestClass>([
  'architectural-invariant',
  'convergence-witness',
  'golden-trace',
]);

const TEST_CLASS_PATTERN = /^\/\/\s*@test-class:\s*(\S+)\s*$/gmu;
const WITNESS_PATTERN = /^\/\/\s*@witness:\s*(\S+)\s*$/gmu;
const PROFILE_VARIANT_PATTERN = /^\/\/\s*@profile-variant:\s*(\S+)\s*$/gmu;
const DETERMINISM_TERMINAL_PIN_PATTERN = /stopReason\s*===\s*['"]terminal['"]/gu;

export const toLineNumber = (text: string, index: number) => text.slice(0, index).split('\n').length;

const getMarkerMatches = (source: string, pattern: RegExp) => [...source.matchAll(pattern)];

export const getMarkerCheck = (source: string, displayPath: string): MarkerCheck => {
  const matches = getMarkerMatches(source, TEST_CLASS_PATTERN);
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

export const isPolicyProfileQualityPath = (testRoot: string, filePath: string) => {
  const segments = relative(testRoot, filePath).split(sep);
  return segments[0] === 'policy-profile-quality';
};

export const assertWitnessAdjacency = (source: string, displayPath: string, markerLine: number) => {
  const witnessMatches = getMarkerMatches(source, WITNESS_PATTERN);
  const profileVariantMatches = getMarkerMatches(source, PROFILE_VARIANT_PATTERN);
  if (profileVariantMatches.length > 0) {
    throw new Error(
      `${displayPath} declares @profile-variant outside policy-profile-quality convergence witnesses`,
    );
  }
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

export const assertProfileVariantAdjacency = (source: string, displayPath: string, markerLine: number) => {
  const profileVariantMatches = getMarkerMatches(source, PROFILE_VARIANT_PATTERN);
  const witnessMatches = getMarkerMatches(source, WITNESS_PATTERN);
  if (witnessMatches.length > 0) {
    throw new Error(
      `${displayPath} declares @witness, but policy-profile-quality convergence witnesses must use only @profile-variant`,
    );
  }
  if (profileVariantMatches.length !== 1) {
    throw new Error(
      profileVariantMatches.length === 0
        ? `${displayPath} missing @profile-variant marker`
        : `${displayPath} has ${profileVariantMatches.length} @profile-variant markers`,
    );
  }

  const profileVariantMatch = profileVariantMatches[0];
  assert.ok(profileVariantMatch !== undefined);
  const profileVariantLine = toLineNumber(source, profileVariantMatch.index ?? 0);
  if (profileVariantLine < markerLine || profileVariantLine > markerLine + 3) {
    throw new Error(
      `${displayPath} has @profile-variant on line ${profileVariantLine}, expected within 3 lines of @test-class on line ${markerLine}`,
    );
  }
};

export const assertNoProfileVariantMarker = (source: string, displayPath: string) => {
  const profileVariantMatches = getMarkerMatches(source, PROFILE_VARIANT_PATTERN);
  if (profileVariantMatches.length > 0) {
    throw new Error(`${displayPath} declares @profile-variant but is not a convergence-witness in policy-profile-quality`);
  }
};

export const assertNoDeterminismTerminalPin = (source: string, displayPath: string) => {
  const hits = getMarkerMatches(source, DETERMINISM_TERMINAL_PIN_PATTERN).map((match) => `L${toLineNumber(source, match.index ?? 0)}`);
  if (hits.length > 0) {
    throw new Error(
      `${displayPath} pins stopReason to terminal at ${hits.join(', ')}; determinism corpus must assert bounded stop-reason membership only`,
    );
  }
};

export const collectPatternHits = (
  source: string,
  patterns: ReadonlyArray<readonly [string, RegExp]>,
): readonly PatternHit[] =>
  patterns.flatMap(([label, pattern]) =>
    [...source.matchAll(pattern)].map((match) => ({
      label,
      line: toLineNumber(source, match.index ?? 0),
    })),
  );
