// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const VARIANT_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;
const SEEDS = [1001, 1020, 1049, 1054] as const;
const MAX_TURNS = 200;
const PLAYER_COUNT = 4;

const resolveRepoRoot = (): string => {
  let cursor = fileURLToPath(new URL('.', import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
};

interface DiagnosticModule {
  readonly runNoLegalMovesDiagnostic: (options: {
    readonly seed: number;
    readonly maxTurns: number;
  }) => {
    readonly trace: ReturnType<typeof runGame>;
    readonly captured: {
      readonly decisions: readonly { readonly kind?: string }[];
    };
  };
}

const createAgents = () =>
  VARIANT_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));

describe('diagnose-nolegalmoves runGame parity', () => {
  const repoRoot = resolveRepoRoot();
  const scriptPath = join(repoRoot, 'campaigns', 'fitl-arvn-agent-evolution', 'diagnose-nolegalmoves.mjs');
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);

  it('diagnostic CLI source contains no hand-rolled simulator loop calls', () => {
    const source = readFileSync(scriptPath, 'utf8');

    assert.doesNotMatch(source, /\bpublishMicroturn\b/);
    assert.doesNotMatch(source, /\bapplyPublishedDecision\b/);
    assert.doesNotMatch(source, /\badvanceAutoresolvable\b/);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: diagnostic-via-hook matches direct runGame`, async () => {
      const diagnostic = await import(pathToFileURL(scriptPath).href) as DiagnosticModule;
      const directTrace = runGame(
        def,
        seed,
        createAgents(),
        MAX_TURNS,
        PLAYER_COUNT,
        { traceRetention: 'full', snapshotDepth: 'standard' },
        createGameDefRuntime(def),
      );
      const diagnosticTrace = diagnostic.runNoLegalMovesDiagnostic({ seed, maxTurns: MAX_TURNS }).trace;

      assert.equal(diagnosticTrace.stopReason, directTrace.stopReason);
      assert.equal(diagnosticTrace.finalState.stateHash, directTrace.finalState.stateHash);
      assert.equal(diagnosticTrace.decisions.length, directTrace.decisions.length);
      assert.equal(
        diagnosticTrace.probeHoleRecoveries.length,
        directTrace.probeHoleRecoveries.length,
      );
    });
  }
});
