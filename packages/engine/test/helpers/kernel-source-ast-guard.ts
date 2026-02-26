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

export const expressionToText = (sourceFile: ts.SourceFile, expression: ts.Expression): string =>
  expression.getText(sourceFile);
