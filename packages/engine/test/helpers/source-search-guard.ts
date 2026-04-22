import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const resolveRepoRoot = (): string => {
  let cursor = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
};

const REPO_ROOT = resolveRepoRoot();

const resolveRepoPath = (relativePath: string): string => join(REPO_ROOT, relativePath);

const collectFiles = (rootPath: string): readonly string[] => {
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files.sort();
};

export const findPatternMatches = (
  pattern: RegExp,
  targets: readonly string[],
): string => {
  const hits: string[] = [];

  for (const target of targets) {
    const absolutePath = resolveRepoPath(target);
    if (!existsSync(absolutePath)) {
      continue;
    }
    const sourceFiles = statSync(absolutePath).isDirectory()
      ? collectFiles(absolutePath)
      : [absolutePath];

    for (const sourceFile of sourceFiles) {
      if (!existsSync(sourceFile)) {
        continue;
      }
      const source = readFileSync(sourceFile, 'utf8');
      const lines = source.split('\n');
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex]!;
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          hits.push(`${sourceFile.replace(`${REPO_ROOT}/`, '')}:${lineIndex + 1}:${line}`);
        }
      }
    }
  }

  return hits.join('\n');
};
