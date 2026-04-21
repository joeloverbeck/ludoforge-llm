// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const ACTIVE_PROFILE_FILES = [
  'data/games/fire-in-the-lake/92-agents.md',
  'data/games/texas-holdem/92-agents.md',
] as const;
const RETIRED_PATTERNS = [
  'candidate\\.param',
  'scopes: \\[completion\\]',
  'option\\.value',
  'decision\\.',
  'preview\\.phase1',
] as const;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);

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
    return execFileSync('rg', ['-n', pattern, ...ACTIVE_PROFILE_FILES], {
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

describe('Spec 140 profile migration correctness', () => {
  it('keeps retired production profile syntax out of the active shipped agent files', () => {
    for (const pattern of RETIRED_PATTERNS) {
      assert.equal(grepMatches(pattern), '', `unexpected retired profile syntax match for ${pattern}`);
    }
  });

  it('runs the migrated FITL shipped profile corpus on the canary seeds without illegal microturn choices', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled FITL gameDef');
    }
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const agents = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'].map(
      (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );

    for (const seed of [123, 1002, 1010] as const) {
      const trace = runGame(def, seed, agents, 200, 4, { skipDeltas: true }, runtime);
      assert.ok(ALLOWED_STOP_REASONS.has(trace.stopReason));
      assert.ok(trace.decisions.length > 0);
    }
  });

  it('runs the migrated Texas shipped profile corpus on a representative seed set without illegal microturn choices', () => {
    const { parsed, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    if (compiled.gameDef === null) {
      throw new Error('Expected compiled Texas gameDef');
    }
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);

    for (const seed of [2000, 2001] as const) {
      const trace = runGame(
        def,
        seed,
        Array.from({ length: 4 }, () => new PolicyAgent({ traceLevel: 'summary' })),
        20,
        4,
        { skipDeltas: true },
        runtime,
      );
      assert.ok(ALLOWED_STOP_REASONS.has(trace.stopReason));
      assert.ok(trace.decisions.length > 0);
    }
  });
});
