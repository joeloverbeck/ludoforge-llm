// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const engineRoot = process.cwd();
const repoRoot = join(engineRoot, '..', '..');
const srcRoot = join(engineRoot, 'src');
const dataRoot = join(repoRoot, 'data', 'games');
const schemaPath = join(engineRoot, 'schemas', 'GameDef.schema.json');

const listFiles = (root: string, predicate: (path: string) => boolean): readonly string[] => {
  const result: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        result.push(fullPath);
      }
    }
  };
  visit(root);
  return result.sort((left, right) => left.localeCompare(right));
};

const read = (path: string): string => readFileSync(path, 'utf8');
const display = (path: string): string => relative(repoRoot, path);

describe('completion-scope deletion enforcement', () => {
  it('keeps retired completion evaluator files and exports absent from engine source', () => {
    for (const file of ['completion-guidance-choice.ts', 'completion-guidance-eval.ts']) {
      assert.equal(existsSync(join(srcRoot, 'agents', file)), false, `${file} must stay deleted`);
    }

    const hits = listFiles(srcRoot, (path) => path.endsWith('.ts'))
      .flatMap((path) => {
        const source = read(path);
        return [
          ...source.matchAll(/\b(selectBestCompletionChooseOneValue|buildCompletionChooseCallback)\b/gu),
        ].map((match) => `${display(path)}:${match[1]}`);
      });
    assert.deepEqual(hits, []);
  });

  it('keeps executable source support for completion scope absent while allowing rejection diagnostics', () => {
    const forbiddenExecutablePatterns = [
      /\bcase\s+['"]completion['"]/u,
      /scopes\?\.\s*includes\(\s*['"]completion['"]\s*\)/u,
      /\bscopes:\s*\[\s*['"]completion['"]\s*\]/u,
      /type\s+ConsiderationScope\s*=\s*[^;\n]*['"]completion['"]/u,
      /entry\s*===\s*['"]completion['"]\s*&&\s*[^?{]*return/u,
    ];

    const hits = listFiles(srcRoot, (path) => path.endsWith('.ts'))
      .flatMap((path) => {
        const source = read(path);
        return forbiddenExecutablePatterns
          .filter((pattern) => pattern.test(source))
          .map((pattern) => `${display(path)}:${String(pattern)}`);
      });

    assert.deepEqual(hits, []);
  });

  it('keeps production data free of retired scope and ref authoring', () => {
    const retiredAuthoringPatterns = [
      /scopes:\s*\[\s*completion\s*\]/u,
      /\{\s*ref:\s*option\.value\s*\}/u,
      /\{\s*ref:\s*decision\.(?:type|name|targetKind|optionCount)\s*\}/u,
      /\{\s*ref:\s*candidate\.param\./u,
      /\{\s*ref:\s*preview\.phase1/u,
    ];

    const hits = listFiles(dataRoot, (path) => /\.(?:md|ya?ml|json)$/u.test(path))
      .flatMap((path) => {
        const source = read(path);
        return retiredAuthoringPatterns
          .filter((pattern) => pattern.test(source))
          .map((pattern) => `${display(path)}:${String(pattern)}`);
      });

    assert.deepEqual(hits, []);
  });

  it('keeps the serialized consideration scope enum at move plus microturn only', () => {
    const schema = JSON.parse(read(schemaPath)) as unknown;
    const enumLikeValues: unknown[] = [];
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== 'object') {
        return;
      }
      if ('enum' in value) {
        enumLikeValues.push((value as { readonly enum?: unknown }).enum);
      }
      if ('const' in value) {
        enumLikeValues.push((value as { readonly const?: unknown }).const);
      }
      for (const child of Object.values(value as Record<string, unknown>)) {
        visit(child);
      }
    };
    visit(schema);

    assert.equal(
      enumLikeValues.includes('move') && enumLikeValues.includes('microturn'),
      true,
      'expected GameDef schema to expose move and microturn consideration scopes',
    );
    assert.equal(
      enumLikeValues.includes('completion'),
      false,
      'completion must not remain in the consideration scope enum',
    );
  });
});
