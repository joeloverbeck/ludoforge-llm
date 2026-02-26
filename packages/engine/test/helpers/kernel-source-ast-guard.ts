import * as assert from 'node:assert/strict';
import ts from 'typescript';

export const parseTypeScriptSource = (source: string, fileName: string): ts.SourceFile =>
  ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

export const collectCallExpressionsByIdentifier = (
  sourceFile: ts.SourceFile,
  identifier: string,
): readonly ts.CallExpression[] => {
  const calls: ts.CallExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === identifier) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return calls;
};

export const collectVariableIdentifiersByInitializer = (
  sourceFile: ts.SourceFile,
  predicate: (initializer: ts.Expression) => boolean,
): readonly string[] => {
  const identifiers = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && predicate(node.initializer)) {
      identifiers.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...identifiers];
};

export const hasImportWithModuleSubstring = (sourceFile: ts.SourceFile, moduleSubstring: string): boolean => {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) {
      continue;
    }
    if (specifier.text.includes(moduleSubstring)) {
      return true;
    }
  }

  return false;
};

const hasExportModifier = (modifiers: ts.NodeArray<ts.ModifierLike> | undefined): boolean =>
  modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

const variableStatementExportsIdentifier = (statement: ts.VariableStatement, identifier: string): boolean => {
  if (!hasExportModifier(statement.modifiers)) {
    return false;
  }

  return statement.declarationList.declarations.some(
    (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === identifier,
  );
};

const declarationStatementExportsIdentifier = (
  statement:
    | ts.FunctionDeclaration
    | ts.ClassDeclaration
    | ts.InterfaceDeclaration
    | ts.TypeAliasDeclaration
    | ts.EnumDeclaration,
  identifier: string,
): boolean => {
  if (!hasExportModifier(statement.modifiers) || statement.name === undefined) {
    return false;
  }

  return statement.name.text === identifier;
};

const exportDeclarationMentionsIdentifier = (statement: ts.ExportDeclaration, identifier: string): boolean => {
  const clause = statement.exportClause;
  if (clause === undefined || !ts.isNamedExports(clause)) {
    return false;
  }

  return clause.elements.some((specifier) => {
    const localName = specifier.propertyName?.text ?? specifier.name.text;
    const exportedName = specifier.name.text;
    return localName === identifier || exportedName === identifier;
  });
};

export const isIdentifierExported = (sourceFile: ts.SourceFile, identifier: string): boolean => {
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && variableStatementExportsIdentifier(statement, identifier)) {
      return true;
    }

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      declarationStatementExportsIdentifier(statement, identifier)
    ) {
      return true;
    }

    if (ts.isExportDeclaration(statement) && exportDeclarationMentionsIdentifier(statement, identifier)) {
      return true;
    }

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression) && statement.expression.text === identifier) {
      return true;
    }
  }

  return false;
};

export const collectTopLevelNamedExports = (sourceFile: ts.SourceFile): Set<string> => {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      hasExportModifier(statement.modifiers)
    ) {
      if (statement.name !== undefined) {
        names.add(statement.name.text);
      }
      continue;
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement.modifiers)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.add(declaration.name.text);
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      for (const specifier of statement.exportClause.elements) {
        names.add(specifier.name.text);
      }
    }
  }

  return names;
};

const hasDefaultModifier = (modifiers: ts.NodeArray<ts.ModifierLike> | undefined): boolean =>
  modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false;

export type TopLevelExportSurface = Readonly<{
  namedExports: ReadonlySet<string>;
  hasExportAll: boolean;
  hasDefaultExport: boolean;
  hasExportAssignment: boolean;
}>;

export const collectTopLevelExportSurface = (sourceFile: ts.SourceFile): TopLevelExportSurface => {
  const namedExports = collectTopLevelNamedExports(sourceFile);
  let hasExportAll = false;
  let hasDefaultExport = false;
  let hasExportAssignment = false;

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause === undefined) {
        hasExportAll = true;
        continue;
      }

      if (ts.isNamedExports(statement.exportClause)) {
        for (const specifier of statement.exportClause.elements) {
          if (specifier.name.text === 'default' || specifier.propertyName?.text === 'default') {
            hasDefaultExport = true;
            break;
          }
        }
      }
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      hasExportModifier(statement.modifiers) &&
      hasDefaultModifier(statement.modifiers)
    ) {
      hasDefaultExport = true;
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      if (statement.isExportEquals) {
        hasExportAssignment = true;
      } else {
        hasDefaultExport = true;
      }
    }
  }

  return {
    namedExports,
    hasExportAll,
    hasDefaultExport,
    hasExportAssignment,
  };
};

export type ModuleExportContract = Readonly<{
  expectedNamedExports: readonly string[];
  allowExportAll?: boolean;
  allowDefaultExport?: boolean;
  allowExportAssignment?: boolean;
  forbiddenNamedExports?: readonly string[];
}>;

export const assertModuleExportContract = (
  sourceFile: ts.SourceFile,
  moduleLabel: string,
  contract: ModuleExportContract,
): TopLevelExportSurface => {
  const exportSurface = collectTopLevelExportSurface(sourceFile);
  const actualNamed = [...exportSurface.namedExports].sort();
  const expectedNamed = [...contract.expectedNamedExports].sort();

  assert.deepEqual(
    actualNamed,
    expectedNamed,
    `${moduleLabel} public exports must match the curated API contract`,
  );

  for (const forbidden of contract.forbiddenNamedExports ?? []) {
    assert.equal(
      exportSurface.namedExports.has(forbidden),
      false,
      `${moduleLabel} must not export internal identifier ${forbidden}`,
    );
  }

  assert.equal(
    exportSurface.hasExportAll,
    contract.allowExportAll ?? false,
    `${moduleLabel} must ${contract.allowExportAll === true ? 'allow' : 'forbid'} wildcard re-exports in module API contracts`,
  );
  assert.equal(
    exportSurface.hasDefaultExport,
    contract.allowDefaultExport ?? false,
    `${moduleLabel} must ${contract.allowDefaultExport === true ? 'allow' : 'forbid'} default export forms in module API contracts`,
  );
  assert.equal(
    exportSurface.hasExportAssignment,
    contract.allowExportAssignment ?? false,
    `${moduleLabel} must ${contract.allowExportAssignment === true ? 'allow' : 'forbid'} export assignment in module API contracts`,
  );

  return exportSurface;
};

export const getObjectPropertyExpression = (
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.Expression | undefined => {
  for (const property of objectLiteral.properties) {
    if (ts.isSpreadAssignment(property)) {
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property) && property.name.text === propertyName) {
      return ts.factory.createIdentifier(property.name.text);
    }

    if (ts.isPropertyAssignment(property)) {
      const name = property.name;
      const resolvedName =
        ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : undefined;
      if (resolvedName === propertyName) {
        return property.initializer;
      }
    }
  }

  return undefined;
};

export const unwrapTypeScriptExpression = (expression: ts.Expression): ts.Expression => {
  if (ts.isParenthesizedExpression(expression)) {
    return unwrapTypeScriptExpression(expression.expression);
  }
  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return unwrapTypeScriptExpression(expression.expression);
  }
  return expression;
};

export const collectTopLevelObjectLiteralInitializers = (
  sourceFile: ts.SourceFile,
): ReadonlyMap<string, ts.ObjectLiteralExpression> => {
  const initializers = new Map<string, ts.ObjectLiteralExpression>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      const unwrapped = unwrapTypeScriptExpression(node.initializer);
      if (ts.isObjectLiteralExpression(unwrapped)) {
        initializers.set(node.name.text, unwrapped);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return initializers;
};

export const resolveObjectLiteralFromExpression = (
  expression: ts.Expression,
  objectInitializers: ReadonlyMap<string, ts.ObjectLiteralExpression>,
): ts.ObjectLiteralExpression | undefined => {
  const unwrapped = unwrapTypeScriptExpression(expression);
  if (ts.isObjectLiteralExpression(unwrapped)) {
    return unwrapped;
  }
  if (ts.isIdentifier(unwrapped)) {
    return objectInitializers.get(unwrapped.text);
  }
  return undefined;
};

export const resolveObjectPropertyExpressionWithSpreads = (
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
  objectInitializers: ReadonlyMap<string, ts.ObjectLiteralExpression>,
  visitedIdentifiers: ReadonlySet<string> = new Set<string>(),
): ts.Expression | undefined => {
  const explicit = getObjectPropertyExpression(objectLiteral, propertyName);
  if (explicit !== undefined) {
    return explicit;
  }

  for (const property of objectLiteral.properties) {
    if (!ts.isSpreadAssignment(property)) {
      continue;
    }
    const spreadExpression = unwrapTypeScriptExpression(property.expression);
    if (!ts.isIdentifier(spreadExpression)) {
      continue;
    }
    if (visitedIdentifiers.has(spreadExpression.text)) {
      continue;
    }
    const nested = objectInitializers.get(spreadExpression.text);
    if (nested === undefined) {
      continue;
    }
    const nextVisited = new Set(visitedIdentifiers);
    nextVisited.add(spreadExpression.text);
    const resolved = resolveObjectPropertyExpressionWithSpreads(nested, propertyName, objectInitializers, nextVisited);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  return undefined;
};

export const resolveStringLiteralObjectPropertyWithSpreads = (
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
  objectInitializers: ReadonlyMap<string, ts.ObjectLiteralExpression>,
): string | undefined => {
  const expression = resolveObjectPropertyExpressionWithSpreads(objectLiteral, propertyName, objectInitializers);
  if (expression === undefined) {
    return undefined;
  }
  const unwrapped = unwrapTypeScriptExpression(expression);
  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return unwrapped.text;
  }
  return undefined;
};

export const expressionToText = (sourceFile: ts.SourceFile, expression: ts.Expression): string =>
  expression.getText(sourceFile);
