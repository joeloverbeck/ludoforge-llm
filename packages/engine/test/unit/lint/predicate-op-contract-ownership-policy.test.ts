import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';
import { parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';

const CANONICAL_IMPORT_SPECIFIER = '../contracts/index.js';
const OWNERSHIP_SYMBOLS = new Set(['PredicateOp', 'PREDICATE_OPERATORS', 'isPredicateOp']);

function formatLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
}

function hasOwnershipLocalDefinition(statement: ts.Statement): string | undefined {
  if (
    (ts.isFunctionDeclaration(statement)
      || ts.isClassDeclaration(statement)
      || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement)
      || ts.isEnumDeclaration(statement))
    && statement.name !== undefined
    && OWNERSHIP_SYMBOLS.has(statement.name.text)
  ) {
    return statement.name.text;
  }

  if (!ts.isVariableStatement(statement)) {
    return undefined;
  }

  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && OWNERSHIP_SYMBOLS.has(declaration.name.text)) {
      return declaration.name.text;
    }
  }

  return undefined;
}

function isPredicateOperatorTupleLiteral(node: ts.ArrayLiteralExpression): boolean {
  if (node.elements.length !== 4) {
    return false;
  }
  const expected = ['eq', 'neq', 'in', 'notIn'];
  for (let index = 0; index < expected.length; index += 1) {
    const element = node.elements[index];
    if (element === undefined || !ts.isStringLiteral(element) || element.text !== expected[index]) {
      return false;
    }
  }
  return true;
}

describe('predicate-op contract ownership policy', () => {
  it('keeps predicate-op ownership canonical across kernel/CNL with no tuple duplication, aliasing, or re-export drift', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const sourceRoots = [
      `${engineRoot}/src/kernel`,
      `${engineRoot}/src/cnl`,
    ] as const;

    const files = sourceRoots
      .flatMap((root) => listTypeScriptFiles(root))
      .sort((left, right) => left.localeCompare(right));

    const invalidImports: string[] = [];
    const invalidLocalDefinitions: string[] = [];
    const invalidExports: string[] = [];
    const duplicateTupleLiterals: string[] = [];

    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8');
      const sourceFile = parseTypeScriptSource(source, filePath);

      for (const statement of sourceFile.statements) {
        const localDefinition = hasOwnershipLocalDefinition(statement);
        if (localDefinition !== undefined) {
          invalidLocalDefinitions.push(`${formatLocation(sourceFile, statement)}:${localDefinition}`);
        }

        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
          continue;
        }
        const fromModule = statement.moduleSpecifier.text;
        const namedBindings = statement.importClause?.namedBindings;
        if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
          continue;
        }

        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          const localName = element.name.text;
          if (!OWNERSHIP_SYMBOLS.has(importedName) && !OWNERSHIP_SYMBOLS.has(localName)) {
            continue;
          }

          const hasAlias = importedName !== localName;
          if (fromModule !== CANONICAL_IMPORT_SPECIFIER || hasAlias) {
            invalidImports.push(
              `${formatLocation(sourceFile, element)}:${fromModule}:${importedName}${hasAlias ? ` as ${localName}` : ''}`,
            );
          }
        }
      }

      const visitNode = (node: ts.Node): void => {
        if (ts.isArrayLiteralExpression(node) && isPredicateOperatorTupleLiteral(node)) {
          duplicateTupleLiterals.push(formatLocation(sourceFile, node));
        }

        if (ts.isExportDeclaration(node) && node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            const localName = element.propertyName?.text ?? element.name.text;
            const exportedName = element.name.text;
            if (OWNERSHIP_SYMBOLS.has(localName) || OWNERSHIP_SYMBOLS.has(exportedName)) {
              invalidExports.push(
                `${formatLocation(sourceFile, element)}:${localName}${localName !== exportedName ? ` as ${exportedName}` : ''}`,
              );
            }
          }
        }

        ts.forEachChild(node, visitNode);
      };
      visitNode(sourceFile);
    }

    assert.deepEqual(
      duplicateTupleLiterals,
      [],
      'kernel/CNL modules must not redeclare predicate-op tuple literals; use contracts/predicate-op-contract ownership',
    );

    assert.deepEqual(
      invalidLocalDefinitions,
      [],
      'kernel/CNL modules must not locally declare predicate-op ownership symbols',
    );

    assert.deepEqual(
      invalidImports,
      [],
      `kernel/CNL modules must import predicate-op ownership symbols only from ${CANONICAL_IMPORT_SPECIFIER} without aliasing`,
    );

    assert.deepEqual(
      invalidExports,
      [],
      'kernel/CNL modules must not re-export predicate-op ownership symbols',
    );

  });
});
