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
