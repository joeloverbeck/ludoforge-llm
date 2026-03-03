import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function findRepoRootFile(startDir: string, fileName: string): string {
  let current = startDir;
  while (true) {
    const candidate = resolve(current, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = resolve(current, '..');
    if (parent === current) {
      throw new Error(`Could not locate ${fileName} from test directory.`);
    }
    current = parent;
  }
}

export function findEnginePackageRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    const packageJsonPath = resolve(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { readonly name?: string };
      if (parsed.name === '@ludoforge/engine') {
        return current;
      }
    }
    const parent = resolve(current, '..');
    if (parent === current) {
      throw new Error('Could not locate @ludoforge/engine package root from test directory.');
    }
    current = parent;
  }
}

export function findEnginePackageJson(startDir: string): string {
  return resolve(findEnginePackageRoot(startDir), 'package.json');
}

export function listTypeScriptFiles(rootDir: string): string[] {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = resolve(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(absolute));
      continue;
    }
    if (entry.isFile() && absolute.endsWith('.ts')) {
      files.push(absolute);
    }
  }
  return files;
}

export function findModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(
    /\bimport\s+[^'"]*?\sfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|^\s*export\s+[^'"]*?\sfrom\s*['"]([^'"]+)['"]/gmu,
  )) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      specifiers.push(specifier);
    }
  }
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gmu)) {
    const specifier = match[1];
    if (specifier) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

type ImportViolationContext = {
  readonly filePath: string;
  readonly specifier: string;
};

export function findImportBoundaryViolations(
  files: readonly string[],
  isViolation: (context: ImportViolationContext) => boolean,
): string[] {
  const violations: string[] = [];
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    for (const specifier of findModuleSpecifiers(source)) {
      if (isViolation({ filePath, specifier })) {
        violations.push(`${filePath} -> ${specifier}`);
      }
    }
  }
  return violations;
}

export function findReExportSpecifierViolations(
  files: readonly string[],
  forbiddenSpecifiers: readonly string[],
): string[] {
  const forbidden = new Set(forbiddenSpecifiers);
  const violations: string[] = [];
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(/export\s+(?:\*|\{[^}]+\})\s*from\s*['"]([^'"]+)['"]/gmu)) {
      const specifier = match[1];
      if (specifier && forbidden.has(specifier)) {
        violations.push(`${filePath}:${specifier}`);
      }
    }
  }
  return violations;
}

type CanonicalSymbolOwnerPolicy = {
  readonly moduleSubdir: readonly string[];
  readonly canonicalModuleBasename: string;
  readonly canonicalImportSpecifier: string;
  readonly symbolNames: readonly string[];
  readonly prohibitedDuplicateLiterals?: readonly string[];
};

type CanonicalSymbolOwnerReport = {
  readonly files: readonly string[];
  readonly canonicalFile: string;
  readonly exportedDefinitionFiles: readonly string[];
  readonly duplicateLiteralLocations: readonly string[];
  readonly invalidImports: readonly string[];
  readonly invalidLocalDefinitions: readonly string[];
  readonly invalidNonCanonicalExports: readonly string[];
  readonly invalidReExports: readonly string[];
};

type ParsedSpecifier = {
  readonly localName: string;
  readonly exportedOrImportedName: string;
};

function parseSpecifierList(specifierList: string): ParsedSpecifier[] {
  const parsed: ParsedSpecifier[] = [];
  for (const part of specifierList.split(',')) {
    const normalized = part.trim().replace(/^type\s+/u, '');
    if (!normalized) {
      continue;
    }
    const asMatch = normalized.match(/^(?<local>\w+)\s+as\s+(?<renamed>\w+)$/u);
    if (asMatch?.groups?.local && asMatch.groups.renamed) {
      parsed.push({
        localName: asMatch.groups.local,
        exportedOrImportedName: asMatch.groups.renamed,
      });
      continue;
    }
    const directMatch = normalized.match(/^(?<name>\w+)$/u);
    if (directMatch?.groups?.name) {
      parsed.push({
        localName: directMatch.groups.name,
        exportedOrImportedName: directMatch.groups.name,
      });
    }
  }
  return parsed;
}

function hasLocalDefinition(source: string, symbolName: string): boolean {
  const declarationPattern = new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?(?:function|const|let|var|class|type|interface|enum)\\s+${symbolName}\\b`,
    'u',
  );
  return declarationPattern.test(source);
}

function hasExportedDefinition(source: string, symbolName: string): boolean {
  const exportedDeclarationPattern = new RegExp(
    `(?:^|\\n)\\s*export\\s+(?:async\\s+)?(?:function|const|let|var|class|type|interface|enum)\\s+${symbolName}\\b`,
    'u',
  );
  if (exportedDeclarationPattern.test(source)) {
    return true;
  }
  for (const match of source.matchAll(/export\s*\{([^}]+)\}(?!\s*from)/gmu)) {
    const specifiers = match[1];
    if (!specifiers) {
      continue;
    }
    for (const parsed of parseSpecifierList(specifiers)) {
      if (parsed.localName === symbolName || parsed.exportedOrImportedName === symbolName) {
        return true;
      }
    }
  }
  return false;
}

export function analyzeCanonicalSymbolOwnerPolicy(
  startDir: string,
  policy: CanonicalSymbolOwnerPolicy,
): CanonicalSymbolOwnerReport {
  const engineRoot = findEnginePackageRoot(startDir);
  const moduleDir = resolve(engineRoot, ...policy.moduleSubdir);
  const files = listTypeScriptFiles(moduleDir);
  const canonicalFile = resolve(moduleDir, policy.canonicalModuleBasename);
  const symbols = new Set(policy.symbolNames);
  const duplicateLiteralLocations: string[] = [];
  const invalidImports: string[] = [];
  const invalidLocalDefinitions: string[] = [];
  const invalidNonCanonicalExports: string[] = [];
  const invalidReExports: string[] = [];

  const exportedDefinitionFiles = files.filter((file) => {
    const source = readFileSync(file, 'utf8');
    return policy.symbolNames.some((symbolName) => hasExportedDefinition(source, symbolName));
  });

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const isCanonicalFile = file === canonicalFile;

    if (!isCanonicalFile) {
      for (const literal of policy.prohibitedDuplicateLiterals ?? []) {
        if (source.includes(literal)) {
          duplicateLiteralLocations.push(`${file}:${literal}`);
        }
      }
      for (const symbolName of policy.symbolNames) {
        if (hasLocalDefinition(source, symbolName)) {
          invalidLocalDefinitions.push(`${file}:${symbolName}`);
        }
        if (hasExportedDefinition(source, symbolName)) {
          invalidNonCanonicalExports.push(`${file}:${symbolName}`);
        }
      }
    }

    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gmu)) {
      const specifierList = match[1];
      const fromModule = match[2];
      if (!specifierList || !fromModule) {
        continue;
      }
      for (const parsed of parseSpecifierList(specifierList)) {
        if (!symbols.has(parsed.localName)) {
          continue;
        }
        const hasAlias = parsed.localName !== parsed.exportedOrImportedName;
        if (fromModule !== policy.canonicalImportSpecifier || hasAlias) {
          invalidImports.push(
            `${file}:${fromModule}:${parsed.localName}${hasAlias ? ` as ${parsed.exportedOrImportedName}` : ''}`,
          );
        }
      }
    }

    if (!isCanonicalFile) {
      for (const match of source.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gmu)) {
        const specifierList = match[1];
        const fromModule = match[2];
        if (!specifierList || !fromModule) {
          continue;
        }
        for (const parsed of parseSpecifierList(specifierList)) {
          if (!symbols.has(parsed.localName) && !symbols.has(parsed.exportedOrImportedName)) {
            continue;
          }
          invalidReExports.push(
            `${file}:${fromModule}:${parsed.localName}${parsed.localName !== parsed.exportedOrImportedName ? ` as ${parsed.exportedOrImportedName}` : ''}`,
          );
        }
      }
      for (const match of source.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/gmu)) {
        const fromModule = match[1];
        if (fromModule === policy.canonicalImportSpecifier) {
          invalidReExports.push(`${file}:export*:${fromModule}`);
        }
      }
    }
  }

  return {
    files,
    canonicalFile,
    exportedDefinitionFiles,
    duplicateLiteralLocations,
    invalidImports,
    invalidLocalDefinitions,
    invalidNonCanonicalExports,
    invalidReExports,
  };
}
