import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const resolveRepoRoot = (): string => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  let cursor = here;

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }

  throw new Error('Unable to resolve repository root from test helper location.');
};

const ENGINE_TEST_FIXTURE_ROOT = join(resolveRepoRoot(), 'packages', 'engine', 'test', 'fixtures');

export const readFixtureText = (relativePath: string): string =>
  readFileSync(join(ENGINE_TEST_FIXTURE_ROOT, relativePath), 'utf8');

export const readFixtureJson = <T>(relativePath: string): T => JSON.parse(readFixtureText(relativePath)) as T;
