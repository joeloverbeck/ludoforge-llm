// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { findPatternMatches } from '../helpers/source-search-guard.js';

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
const FITL_PROFILE_SMOKE_SEEDS = [123] as const;
const FITL_PROFILE_SMOKE_DECISIONS = 5;

const grepMatches = (pattern: string): string => {
  return findPatternMatches(new RegExp(pattern, 'u'), ACTIVE_PROFILE_FILES);
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

    for (const seed of FITL_PROFILE_SMOKE_SEEDS) {
      const trace = runGame(def, seed, agents, FITL_PROFILE_SMOKE_DECISIONS, 4, { skipDeltas: true }, runtime);
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
