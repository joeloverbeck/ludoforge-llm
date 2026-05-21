// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

const AGNOSTIC_ENGINE_DIRS = ['agents', 'cnl', 'kernel', 'sim'] as const;

const FORBIDDEN_FACTION_IDENTIFIERS = new Set(['ARVN', 'arvn', 'NVA', 'nva', 'VC', 'vc', 'FITL', 'fitl']);

const FORBIDDEN_ACTION_TAG_STRINGS = new Set([
  'Advise',
  'AirLift',
  'AirStrike',
  'Ambush',
  'Assault',
  'Attack',
  'Govern',
  'Infiltrate',
  'March',
  'Patrol',
  'Raid',
  'Rally',
  'Subvert',
  'Sweep',
  'Tax',
  'Terror',
  'Train',
  'Transport',
]);

type FactionIdentifierViolation = Readonly<{
  filePath: string;
  line: number;
  identifier: string;
}>;

type ActionTagStringViolation = Readonly<{
  filePath: string;
  line: number;
  literal: string;
}>;

function lineFor(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function findFactionIdentifierViolations(
  sourceFile: ts.SourceFile,
  filePath: string,
): FactionIdentifierViolation[] {
  const violations: FactionIdentifierViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && FORBIDDEN_FACTION_IDENTIFIERS.has(node.text)) {
      violations.push({ filePath, line: lineFor(sourceFile, node), identifier: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function findActionTagStringViolations(
  sourceFile: ts.SourceFile,
  filePath: string,
): ActionTagStringViolation[] {
  const violations: ActionTagStringViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && FORBIDDEN_ACTION_TAG_STRINGS.has(node.text)) {
      violations.push({ filePath, line: lineFor(sourceFile, node), literal: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function formatViolations(
  engineRoot: string,
  violations: readonly (FactionIdentifierViolation | ActionTagStringViolation)[],
): string[] {
  return violations.map((violation) => {
    const path = relative(engineRoot, violation.filePath);
    if ('identifier' in violation) {
      return `${path}:${violation.line}: faction identifier ${violation.identifier}`;
    }
    return `${path}:${violation.line}: FITL action tag string ${violation.literal}`;
  });
}

describe('engine agnostic faction and action identifier boundary policy', () => {
  it('prevents cnl/kernel/agents/sim modules from hardcoding FITL identifiers', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const files = AGNOSTIC_ENGINE_DIRS.flatMap((segment) =>
      listTypeScriptFiles(resolve(engineRoot, 'src', segment)),
    );

    const factionViolations: FactionIdentifierViolation[] = [];
    const actionTagViolations: ActionTagStringViolation[] = [];
    for (const filePath of files) {
      const sourceFile = ts.createSourceFile(
        filePath,
        readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      factionViolations.push(...findFactionIdentifierViolations(sourceFile, filePath));
      actionTagViolations.push(...findActionTagStringViolations(sourceFile, filePath));
    }

    assert.deepEqual(
      formatViolations(engineRoot, factionViolations),
      [],
      'Agnostic engine layers must not hardcode FITL faction identifiers',
    );
    assert.deepEqual(
      formatViolations(engineRoot, actionTagViolations),
      [],
      'Agnostic engine layers must not hardcode FITL action-tag string literals',
    );
  });
});
