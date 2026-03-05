import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ts from 'typescript';

import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';
import { collectCallExpressionsByIdentifier, isIdentifierExported, parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const engineRoot = findEnginePackageRoot(thisDir);
const contractsRoot = resolve(engineRoot, 'src', 'contracts');
const missingReferenceContractPath = resolve(contractsRoot, 'missing-reference-diagnostic-contract.ts');
const bindingIdentifierContractPath = resolve(contractsRoot, 'binding-identifier-contract.ts');
const editDistanceContractPath = resolve(contractsRoot, 'edit-distance-contract.ts');

const CANONICAL_MODULE_SPECIFIER = './edit-distance-contract.js';
const CANONICAL_EDIT_DISTANCE_SYMBOLS = ['levenshteinDistance', 'rankByEditDistance', 'compareByDistanceThenLex'] as const;

type ImportBinding = Readonly<{
  importedName: string;
  localName: string;
}>;

const parseSourceFile = (filePath: string): ts.SourceFile =>
  parseTypeScriptSource(readFileSync(filePath, 'utf8'), filePath);

const collectNamedImportsFromModule = (sourceFile: ts.SourceFile, moduleSpecifier: string): readonly ImportBinding[] => {
  const imports: ImportBinding[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.moduleSpecifier.text !== moduleSpecifier) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
      continue;
    }
    for (const element of namedBindings.elements) {
      imports.push({
        importedName: element.propertyName?.text ?? element.name.text,
        localName: element.name.text,
      });
    }
  }
  return imports;
};

const hasNamedImportWithoutAlias = (sourceFile: ts.SourceFile, moduleSpecifier: string, symbolName: string): boolean =>
  collectNamedImportsFromModule(sourceFile, moduleSpecifier).some(
    (binding) => binding.importedName === symbolName && binding.localName === symbolName,
  );

const collectDeclaredIdentifiers = (sourceFile: ts.SourceFile): readonly string[] => {
  const identifiers = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node)
        || ts.isClassDeclaration(node)
        || ts.isInterfaceDeclaration(node)
        || ts.isTypeAliasDeclaration(node)
        || ts.isEnumDeclaration(node))
      && node.name !== undefined
    ) {
      identifiers.add(node.name.text);
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      identifiers.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...identifiers];
};

const hasNestedLoopMathMinShape = (root: ts.Node): boolean => {
  let matched = false;

  const visit = (node: ts.Node, loopDepth: number): void => {
    if (matched) {
      return;
    }

    const isLoopNode =
      ts.isForStatement(node)
      || ts.isForInStatement(node)
      || ts.isForOfStatement(node)
      || ts.isWhileStatement(node)
      || ts.isDoStatement(node);
    const nextLoopDepth = isLoopNode ? loopDepth + 1 : loopDepth;

    if (
      nextLoopDepth >= 2
      && ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'Math'
      && node.expression.name.text === 'min'
      && node.arguments.length >= 3
    ) {
      matched = true;
      return;
    }

    ts.forEachChild(node, (child) => visit(child, nextLoopDepth));
  };

  visit(root, 0);
  return matched;
};

const hasLevenshteinLikeImplementation = (sourceFile: ts.SourceFile): boolean => {
  let detected = false;

  const inspectFunctionLike = (node: ts.Node, parameters: readonly ts.ParameterDeclaration[], body: ts.ConciseBody | undefined): void => {
    if (detected || body === undefined || parameters.length < 2 || !ts.isBlock(body)) {
      return;
    }
    if (hasNestedLoopMathMinShape(node)) {
      detected = true;
    }
  };

  const visit = (node: ts.Node): void => {
    if (detected) {
      return;
    }

    if (ts.isFunctionDeclaration(node)) {
      inspectFunctionLike(node, node.parameters, node.body);
    }

    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const initializer = node.initializer;
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        inspectFunctionLike(initializer, initializer.parameters, initializer.body);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return detected;
};

describe('contracts edit-distance source guard', () => {
  it('keeps edit-distance ownership centralized in edit-distance-contract', () => {
    const contractsSourceFiles = listTypeScriptFiles(contractsRoot)
      .map((filePath) => ({
        filePath,
        sourceFile: parseSourceFile(filePath),
      }))
      .sort((left, right) => left.filePath.localeCompare(right.filePath));

    const canonicalSourceFile = contractsSourceFiles.find((entry) => entry.filePath === editDistanceContractPath)?.sourceFile;
    assert.notEqual(
      canonicalSourceFile,
      undefined,
      'contracts source guard must locate canonical edit-distance-contract.ts for ownership checks.',
    );
    if (canonicalSourceFile === undefined) {
      return;
    }

    for (const symbolName of CANONICAL_EDIT_DISTANCE_SYMBOLS) {
      assert.equal(
        isIdentifierExported(canonicalSourceFile, symbolName),
        true,
        `edit-distance-contract.ts must export canonical symbol ${symbolName}.`,
      );
    }

    const missingReferenceSourceFile = contractsSourceFiles.find(
      (entry) => entry.filePath === missingReferenceContractPath,
    )?.sourceFile;
    const bindingIdentifierSourceFile = contractsSourceFiles.find(
      (entry) => entry.filePath === bindingIdentifierContractPath,
    )?.sourceFile;

    assert.notEqual(
      missingReferenceSourceFile,
      undefined,
      'contracts source guard must locate missing-reference-diagnostic-contract.ts.',
    );
    assert.notEqual(
      bindingIdentifierSourceFile,
      undefined,
      'contracts source guard must locate binding-identifier-contract.ts.',
    );
    if (missingReferenceSourceFile === undefined || bindingIdentifierSourceFile === undefined) {
      return;
    }

    assert.equal(
      hasNamedImportWithoutAlias(missingReferenceSourceFile, CANONICAL_MODULE_SPECIFIER, 'rankByEditDistance'),
      true,
      'missing-reference-diagnostic-contract.ts must import rankByEditDistance from ./edit-distance-contract.js without aliasing.',
    );
    assert.equal(
      hasNamedImportWithoutAlias(bindingIdentifierSourceFile, CANONICAL_MODULE_SPECIFIER, 'rankByEditDistance'),
      true,
      'binding-identifier-contract.ts must import rankByEditDistance from ./edit-distance-contract.js without aliasing.',
    );

    assert.equal(
      collectCallExpressionsByIdentifier(missingReferenceSourceFile, 'rankByEditDistance').length > 0,
      true,
      'missing-reference-diagnostic-contract.ts must call rankByEditDistance.',
    );
    assert.equal(
      collectCallExpressionsByIdentifier(bindingIdentifierSourceFile, 'rankByEditDistance').length > 0,
      true,
      'binding-identifier-contract.ts must call rankByEditDistance.',
    );

    const rankByEditDistanceCallers = contractsSourceFiles
      .filter((entry) => entry.filePath !== editDistanceContractPath)
      .filter((entry) => collectCallExpressionsByIdentifier(entry.sourceFile, 'rankByEditDistance').length > 0)
      .map((entry) => entry.filePath)
      .sort((left, right) => left.localeCompare(right));
    assert.deepEqual(
      rankByEditDistanceCallers,
      [bindingIdentifierContractPath, missingReferenceContractPath].sort((left, right) => left.localeCompare(right)),
      [
        'Only canonical consumer contracts may call rankByEditDistance.',
        'Remediation: route non-canonical edit-distance usage through shared contracts policy and remove ad-hoc call sites.',
      ].join('\n'),
    );

    const invalidCanonicalSymbolDefinitions: string[] = [];
    const invalidCanonicalSymbolImports: string[] = [];
    const levenshteinLikeImplementations: string[] = [];

    for (const { filePath, sourceFile } of contractsSourceFiles) {
      if (filePath === editDistanceContractPath) {
        continue;
      }

      const declared = new Set(collectDeclaredIdentifiers(sourceFile));
      for (const symbolName of CANONICAL_EDIT_DISTANCE_SYMBOLS) {
        if (declared.has(symbolName)) {
          invalidCanonicalSymbolDefinitions.push(`${basename(filePath)}:${symbolName}`);
        }
      }

      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
          continue;
        }
        const moduleSpecifier = statement.moduleSpecifier.text;
        const namedBindings = statement.importClause?.namedBindings;
        if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
          continue;
        }
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (!CANONICAL_EDIT_DISTANCE_SYMBOLS.includes(importedName as (typeof CANONICAL_EDIT_DISTANCE_SYMBOLS)[number])) {
            continue;
          }
          if (moduleSpecifier !== CANONICAL_MODULE_SPECIFIER || element.name.text !== importedName) {
            const localName = element.name.text;
            invalidCanonicalSymbolImports.push(
              `${basename(filePath)}:${moduleSpecifier}:${importedName}${localName === importedName ? '' : ` as ${localName}`}`,
            );
          }
        }
      }

      if (hasLevenshteinLikeImplementation(sourceFile)) {
        levenshteinLikeImplementations.push(basename(filePath));
      }
    }

    assert.deepEqual(
      invalidCanonicalSymbolDefinitions,
      [],
      [
        'Non-canonical contracts must not define canonical edit-distance symbols.',
        `Found definitions: ${invalidCanonicalSymbolDefinitions.join(', ')}`,
      ].join('\n'),
    );

    assert.deepEqual(
      invalidCanonicalSymbolImports,
      [],
      [
        'Canonical edit-distance symbols must be imported from ./edit-distance-contract.js without aliasing.',
        `Found imports: ${invalidCanonicalSymbolImports.join(', ')}`,
      ].join('\n'),
    );

    assert.deepEqual(
      levenshteinLikeImplementations,
      [],
      [
        'Non-canonical contracts must not contain local Levenshtein-like implementations.',
        `Found files: ${levenshteinLikeImplementations.join(', ')}`,
      ].join('\n'),
    );
  });
});
