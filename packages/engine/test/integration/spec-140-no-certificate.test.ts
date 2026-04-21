// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const RETIRED_SYMBOLS = [
  'CompletionCertificate',
  'materializeCompletionCertificate',
  'emitCompletionCertificate',
  'certificateIndex',
] as const;

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

const grepMatches = (pattern: string): string => {
  try {
    return execFileSync('rg', ['-n', pattern, 'packages/engine/src'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) {
      return '';
    }
    throw error;
  }
};

describe('Spec 140 no-certificate invariant', () => {
  it('keeps retired certificate machinery out of engine source', () => {
    for (const symbol of RETIRED_SYMBOLS) {
      assert.equal(grepMatches(symbol), '', `expected no remaining engine-source references for ${symbol}`);
    }
  });
});
