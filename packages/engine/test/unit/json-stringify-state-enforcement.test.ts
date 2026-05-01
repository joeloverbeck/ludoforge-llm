// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';

// Pragmatic enforcement: this scans literal raw `JSON.stringify(state)` /
// `JSON.stringify(trace)` forms outside kernel/serde.ts. Type-aware enforcement
// via ESLint is a follow-up if production code introduces a non-state variable
// named `state` or `trace` that makes this heuristic too noisy.

const findRepoRoot = (): string => {
  let cursor = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      readdirSync(cursor);
      if (readdirSync(cursor).includes('pnpm-workspace.yaml')) {
        return cursor;
      }
    } catch {
      break;
    }
    cursor = resolve(cursor, '..');
  }
  return process.cwd();
};

const collectSourceFiles = (dir: string): readonly string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath));
    } else if (entry.isFile() && absolutePath.endsWith('.ts')) {
      files.push(absolutePath);
    }
  }
  return files;
};

const RAW_STATE_OR_TRACE_STRINGIFY_PATTERN =
  /JSON\.stringify\(\s*(?:\.\.\.)?(?:state|trace)\b/u;

describe('raw GameState/GameTrace JSON.stringify enforcement', () => {
  it('keeps raw state/trace stringify calls out of engine source outside kernel/serde.ts', () => {
    const repoRoot = findRepoRoot();
    const sourceRoot = join(repoRoot, 'packages', 'engine', 'src');
    const serdePath = join(sourceRoot, 'kernel', 'serde.ts');
    const matches = collectSourceFiles(sourceRoot)
      .filter((filePath) => filePath !== serdePath)
      .flatMap((filePath) => {
        const relativePath = relative(repoRoot, filePath);
        return readFileSync(filePath, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            RAW_STATE_OR_TRACE_STRINGIFY_PATTERN.test(line)
              ? [`${relativePath}:${index + 1}: ${line.trim()}`]
              : []);
      });

    assert.deepEqual(matches, []);
  });
});
