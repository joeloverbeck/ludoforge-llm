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
