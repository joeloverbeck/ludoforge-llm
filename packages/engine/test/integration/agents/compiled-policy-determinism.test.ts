// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } from '../../../src/cnl/index.js';
import type { AgentPolicyCatalog } from '../../../src/kernel/index.js';

describe('compiled policy descriptor determinism', () => {
  for (const fixture of productionAgentFixtures()) {
    it(`emits byte-identical compiled descriptors and fingerprints for ${fixture.label}`, () => {
      const first = compileAgentsFromEntrypoint(fixture.entrypoint);
      const second = compileAgentsFromEntrypoint(fixture.entrypoint);

      assert.equal(
        stableStringify(second.compiled),
        stableStringify(first.compiled),
        `${fixture.label} compiled policy descriptor tree should be byte-identical`,
      );
      assert.equal(
        second.catalogFingerprint,
        first.catalogFingerprint,
        `${fixture.label} policy catalog fingerprint should be deterministic`,
      );
    });
  }
});

function compileAgentsFromEntrypoint(entrypoint: string): AgentPolicyCatalog {
  const staged = runGameSpecStagesFromBundle(loadGameSpecBundleFromEntrypoint(entrypoint));
  assert.equal(staged.validation.blocked, false, `${entrypoint} validation should not block`);
  assert.equal(staged.compilation.blocked, false, `${entrypoint} compilation should not block`);
  const gameDef = staged.compilation.result?.gameDef;
  assert.ok(gameDef, `${entrypoint} should compile to a GameDef`);
  assert.ok(gameDef.agents, `${entrypoint} should compile an agent catalog`);
  return gameDef.agents;
}

function productionAgentFixtures(): readonly { readonly label: string; readonly entrypoint: string }[] {
  const repoRoot = resolveRepoRoot();
  return [
    {
      label: 'fire-in-the-lake',
      entrypoint: join(repoRoot, 'data', 'games', 'fire-in-the-lake.game-spec.md'),
    },
    {
      label: 'texas-holdem',
      entrypoint: join(repoRoot, 'data', 'games', 'texas-holdem.game-spec.md'),
    },
  ];
}

function resolveRepoRoot(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  let cursor = here;

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }

  return process.cwd();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortJsonValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
