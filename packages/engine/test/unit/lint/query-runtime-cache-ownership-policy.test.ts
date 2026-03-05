import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { isIdentifierExported, parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

const OWNERSHIP_SYMBOLS = [
  'QueryRuntimeCache',
  'createQueryRuntimeCache',
] as const;

const CANONICAL_SPECIFIER = './query-runtime-cache.js';
const ALLOWED_BARREL_REEXPORTS = new Set(['index.ts', 'runtime.ts']);

function hasLocalDefinition(sourceFile: ts.SourceFile, symbolName: string): boolean {
  return sourceFile.statements.some((statement) => {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name?.text === symbolName
    ) {
      return true;
    }
    if (!ts.isVariableStatement(statement)) {
      return false;
    }
    return statement.declarationList.declarations.some(
      (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === symbolName,
    );
  });
}

function isIdentifierTypeReference(typeNode: ts.TypeNode | undefined, name: string): typeNode is ts.TypeReferenceNode {
  return (
    typeNode !== undefined &&
    ts.isTypeReferenceNode(typeNode) &&
    ts.isIdentifier(typeNode.typeName) &&
    typeNode.typeName.text === name
  );
}

function isReadonlyMapStringToString(typeNode: ts.TypeNode | undefined): boolean {
  if (!isIdentifierTypeReference(typeNode, 'ReadonlyMap')) {
    return false;
  }
  const typeArguments = typeNode.typeArguments;
  if (typeArguments === undefined || typeArguments.length !== 2) {
    return false;
  }
  return (
    typeArguments[0]!.kind === ts.SyntaxKind.StringKeyword &&
    typeArguments[1]!.kind === ts.SyntaxKind.StringKeyword
  );
}

function isReadonlyMapStringToStringOrUndefined(typeNode: ts.TypeNode | undefined): boolean {
  if (typeNode === undefined || !ts.isUnionTypeNode(typeNode)) {
    return false;
  }
  const hasReadonlyMap = typeNode.types.some((member) => isReadonlyMapStringToString(member));
  const hasUndefined = typeNode.types.some((member) => member.kind === ts.SyntaxKind.UndefinedKeyword);
  return hasReadonlyMap && hasUndefined;
}

function assertQueryRuntimeCacheMethodSignature(
  sourceFile: ts.SourceFile,
  methodName: string,
  parameterTypeChecks: readonly ((typeNode: ts.TypeNode | undefined) => boolean)[],
  returnTypeCheck: (typeNode: ts.TypeNode | undefined) => boolean,
): void {
  const queryRuntimeCacheInterface = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === 'QueryRuntimeCache',
  );
  assert.notEqual(queryRuntimeCacheInterface, undefined, 'query-runtime-cache.ts must declare QueryRuntimeCache interface');
  if (queryRuntimeCacheInterface === undefined) {
    return;
  }

  const methodSignature = queryRuntimeCacheInterface.members.find(
    (member): member is ts.MethodSignature =>
      ts.isMethodSignature(member) && ts.isIdentifier(member.name) && member.name.text === methodName,
  );
  assert.notEqual(methodSignature, undefined, `QueryRuntimeCache must expose ${methodName} domain accessor`);
  if (methodSignature === undefined) {
    return;
  }

  assert.equal(
    methodSignature.parameters.length,
    parameterTypeChecks.length,
    `QueryRuntimeCache.${methodName} must define ${parameterTypeChecks.length} parameter(s)`,
  );
  for (let index = 0; index < parameterTypeChecks.length; index += 1) {
    const parameter: ts.ParameterDeclaration | undefined = methodSignature.parameters.at(index);
    assert.notEqual(parameter, undefined, `QueryRuntimeCache.${methodName} must define parameter #${index + 1}`);
    if (parameter === undefined) {
      continue;
    }
    const parameterTypeCheck = parameterTypeChecks[index];
    assert.notEqual(parameterTypeCheck, undefined, `Missing type guard for QueryRuntimeCache.${methodName} parameter #${index + 1}`);
    if (parameterTypeCheck === undefined) {
      continue;
    }
    assert.equal(
      parameterTypeCheck(parameter.type),
      true,
      `QueryRuntimeCache.${methodName} parameter #${index + 1} type must match ownership contract`,
    );
  }

  assert.equal(
    returnTypeCheck(methodSignature.type),
    true,
    `QueryRuntimeCache.${methodName} return type must match ownership contract`,
  );
}

function collectImportViolations(
  sourceFile: ts.SourceFile,
  filePath: string,
  ownershipSymbols: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const clause = statement.importClause;
    if (clause === undefined || clause.namedBindings === undefined || !ts.isNamedImports(clause.namedBindings)) {
      continue;
    }
    const fromModule = statement.moduleSpecifier.text;
    for (const specifier of clause.namedBindings.elements) {
      const importedName = specifier.propertyName?.text ?? specifier.name.text;
      const localName = specifier.name.text;
      if (!ownershipSymbols.has(importedName) && !ownershipSymbols.has(localName)) {
        continue;
      }
      const hasAlias = importedName !== localName;
      if (fromModule !== CANONICAL_SPECIFIER || hasAlias) {
        violations.push(`${filePath}:${fromModule}:${importedName}${hasAlias ? ` as ${localName}` : ''}`);
      }
    }
  }
  return violations;
}

function collectNamedReExportViolations(
  sourceFile: ts.SourceFile,
  filePath: string,
  ownershipSymbols: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) {
      continue;
    }
    const moduleSpecifier = statement.moduleSpecifier;
    if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) {
      continue;
    }
    if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) {
      continue;
    }
    const fromModule = moduleSpecifier.text;
    for (const specifier of statement.exportClause.elements) {
      const localName = specifier.propertyName?.text ?? specifier.name.text;
      const exportedName = specifier.name.text;
      if (!ownershipSymbols.has(localName) && !ownershipSymbols.has(exportedName)) {
        continue;
      }
      violations.push(
        `${filePath}:${fromModule}:${localName}${localName !== exportedName ? ` as ${exportedName}` : ''}`,
      );
    }
  }
  return violations;
}

function hasCanonicalWildcardReExport(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some(
    (statement) =>
      ts.isExportDeclaration(statement) &&
      statement.exportClause === undefined &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === CANONICAL_SPECIFIER,
  );
}

function hasBannedGenericIndexMethods(sourceFile: ts.SourceFile): string[] {
  const bannedMethods = new Set(['getIndex', 'setIndex']);
  const labels: string[] = [];
  const queryRuntimeCacheInterface = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === 'QueryRuntimeCache',
  );
  if (queryRuntimeCacheInterface === undefined) {
    return labels;
  }
  for (const member of queryRuntimeCacheInterface.members) {
    if (!ts.isMethodSignature(member) || !ts.isIdentifier(member.name)) {
      continue;
    }
    if (bannedMethods.has(member.name.text)) {
      labels.push(`QueryRuntimeCache.${member.name.text} method`);
    }
  }
  return labels;
}

describe('query-runtime-cache ownership policy', () => {
  it('keeps query runtime cache ownership contracts on query-runtime-cache.ts without alias/re-export drift', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const kernelDir = resolve(engineRoot, 'src', 'kernel');
    const canonicalFile = resolve(kernelDir, 'query-runtime-cache.ts');
    const files = listTypeScriptFiles(kernelDir);
    const ownershipSymbols = new Set<string>(OWNERSHIP_SYMBOLS);

    const missingCanonicalExports: string[] = [];
    const invalidLocalDefinitions: string[] = [];
    const invalidImports: string[] = [];
    const invalidNamedReExports: string[] = [];
    const invalidWildcardReExports: string[] = [];
    const bannedCanonicalExports: string[] = [];

    const canonicalSource = readFileSync(canonicalFile, 'utf8');
    const canonicalSourceFile = parseTypeScriptSource(canonicalSource, canonicalFile);
    if (isIdentifierExported(canonicalSourceFile, 'QUERY_RUNTIME_CACHE_INDEX_KEYS')) {
      bannedCanonicalExports.push('QUERY_RUNTIME_CACHE_INDEX_KEYS export');
    }
    if (isIdentifierExported(canonicalSourceFile, 'QueryRuntimeCacheIndexKey')) {
      bannedCanonicalExports.push('QueryRuntimeCacheIndexKey export');
    }
    bannedCanonicalExports.push(...hasBannedGenericIndexMethods(canonicalSourceFile));
    for (const symbolName of OWNERSHIP_SYMBOLS) {
      if (!isIdentifierExported(canonicalSourceFile, symbolName)) {
        missingCanonicalExports.push(symbolName);
      }
    }
    assertQueryRuntimeCacheMethodSignature(
      canonicalSourceFile,
      'getTokenZoneByTokenIdIndex',
      [(typeNode) => isIdentifierTypeReference(typeNode, 'GameState')],
      isReadonlyMapStringToStringOrUndefined,
    );
    assertQueryRuntimeCacheMethodSignature(
      canonicalSourceFile,
      'setTokenZoneByTokenIdIndex',
      [(typeNode) => isIdentifierTypeReference(typeNode, 'GameState'), isReadonlyMapStringToString],
      (typeNode) => typeNode?.kind === ts.SyntaxKind.VoidKeyword,
    );

    for (const filePath of files) {
      if (filePath === canonicalFile) {
        continue;
      }
      const source = readFileSync(filePath, 'utf8');
      const sourceFile = parseTypeScriptSource(source, filePath);
      const fileName = filePath.split('/').at(-1) ?? filePath;

      for (const symbolName of OWNERSHIP_SYMBOLS) {
        if (hasLocalDefinition(sourceFile, symbolName)) {
          invalidLocalDefinitions.push(`${filePath}:${symbolName}`);
        }
      }

      invalidImports.push(...collectImportViolations(sourceFile, filePath, ownershipSymbols));
      invalidNamedReExports.push(...collectNamedReExportViolations(sourceFile, filePath, ownershipSymbols));
      if (hasCanonicalWildcardReExport(sourceFile) && !ALLOWED_BARREL_REEXPORTS.has(fileName)) {
        invalidWildcardReExports.push(`${filePath}:export*:${CANONICAL_SPECIFIER}`);
      }
    }

    const indexSource = readFileSync(resolve(kernelDir, 'index.ts'), 'utf8');
    const indexSourceFile = parseTypeScriptSource(indexSource, resolve(kernelDir, 'index.ts'));
    const runtimeSource = readFileSync(resolve(kernelDir, 'runtime.ts'), 'utf8');
    const runtimeSourceFile = parseTypeScriptSource(runtimeSource, resolve(kernelDir, 'runtime.ts'));

    assert.deepEqual(
      missingCanonicalExports,
      [],
      'query-runtime-cache.ts must export all canonical query runtime cache ownership symbols',
    );
    assert.deepEqual(
      bannedCanonicalExports,
      [],
      'query-runtime-cache.ts must not export generic key-based runtime cache API surface',
    );
    assert.deepEqual(
      invalidLocalDefinitions,
      [],
      'non-canonical kernel modules must not define query runtime cache ownership symbols locally',
    );
    assert.deepEqual(
      invalidImports,
      [],
      'kernel modules must import query runtime cache ownership symbols only from ./query-runtime-cache.js without aliasing',
    );
    assert.deepEqual(
      invalidNamedReExports,
      [],
      'non-canonical kernel modules must not named-re-export query runtime cache ownership symbols',
    );
    assert.deepEqual(
      invalidWildcardReExports,
      [],
      'only kernel barrels may wildcard re-export ./query-runtime-cache.js',
    );
    assert.equal(
      hasCanonicalWildcardReExport(indexSourceFile),
      true,
      'kernel/index.ts must expose query-runtime-cache.ts through direct canonical re-export',
    );
    assert.equal(
      hasCanonicalWildcardReExport(runtimeSourceFile),
      true,
      'kernel/runtime.ts must expose query-runtime-cache.ts through direct canonical re-export',
    );
  });
});
