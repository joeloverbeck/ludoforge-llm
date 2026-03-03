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
