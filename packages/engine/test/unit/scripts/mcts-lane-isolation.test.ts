import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

/**
 * Lane isolation tests for MCTS profile lanes.
 *
 * These tests verify that:
 * 1. Each profile lane (e2e:mcts:fast, e2e:mcts:default, e2e:mcts:strong)
 *    maps to exactly one test file — the correct profile-specific file.
 * 2. Each profile test file only references its intended preset.
 * 3. The combined e2e:mcts lane includes all profile files.
 *
 * These tests do NOT run any MCTS agent code — they only inspect the lane
 * manifest and test file contents.
 */

// Resolve the engine root from the known project structure.
// Tests run from dist/ but the manifest lives in scripts/ (source tree).
// From dist/test/unit/scripts/ → 4 levels up to engine root
const ENGINE_ROOT = resolve(import.meta.dirname ?? '.', '..', '..', '..', '..');

// Dynamic import using absolute path — the .mjs lives in scripts/, not dist/
const manifestUrl = pathToFileURL(resolve(ENGINE_ROOT, 'scripts', 'test-lane-manifest.mjs')).href;
const manifest = (await import(manifestUrl)) as {
  listE2eTestsForLane: (lane: string) => string[];
};

const PROFILE_LANES = ['e2e:mcts:fast', 'e2e:mcts:default', 'e2e:mcts:strong'] as const;
type ProfileLane = (typeof PROFILE_LANES)[number];

const EXPECTED_FILES: Record<ProfileLane, string> = {
  'e2e:mcts:fast': 'test/e2e/mcts/texas-holdem-mcts-fast.test.ts',
  'e2e:mcts:default': 'test/e2e/mcts/texas-holdem-mcts-default.test.ts',
  'e2e:mcts:strong': 'test/e2e/mcts/texas-holdem-mcts-strong.test.ts',
};

const PRESET_KEYWORDS: Record<string, readonly string[]> = {
  fast: ["'fast'", "resolvePreset('fast')", 'createMctsAgents('],
  default: ["'default'", "resolvePreset('default')", 'createTimeBudgetedDefaultAgents('],
  strong: ["'strong'", "resolvePreset('strong')", 'createMctsAgents('],
};

const OTHER_PRESETS: Record<string, readonly string[]> = {
  fast: ['default', 'strong'],
  default: ['fast', 'strong'],
  strong: ['fast', 'default'],
};

describe('MCTS lane isolation', () => {
  describe('lane manifest returns correct files', () => {
    for (const lane of PROFILE_LANES) {
      const profile = lane.split(':').at(-1)!;

      it(`${lane} lane maps to exactly one file: the ${profile} profile test`, () => {
        const files = manifest.listE2eTestsForLane(lane);
        assert.equal(files.length, 1, `expected exactly 1 file for ${lane}, got ${files.length}: ${JSON.stringify(files)}`);
        assert.equal(files[0], EXPECTED_FILES[lane]);
      });
    }

    it('e2e:mcts lane includes all 3 profile files', () => {
      const files = manifest.listE2eTestsForLane('e2e:mcts');
      const expectedFiles = Object.values(EXPECTED_FILES).sort();
      const actualTestFiles = files
        .filter((f) => f.endsWith('.test.ts'))
        .sort();
      for (const expected of expectedFiles) {
        assert.ok(
          actualTestFiles.includes(expected),
          `e2e:mcts lane missing ${expected}. Got: ${JSON.stringify(actualTestFiles)}`,
        );
      }
    });

    it('profile lanes are disjoint (no file appears in more than one)', () => {
      const seen = new Map<string, string>();
      for (const lane of PROFILE_LANES) {
        const files = manifest.listE2eTestsForLane(lane);
        for (const file of files) {
          assert.ok(
            !seen.has(file),
            `${file} appears in both ${seen.get(file)} and ${lane}`,
          );
          seen.set(file, lane);
        }
      }
    });
  });

  describe('test file content uses only intended preset', () => {
    for (const lane of PROFILE_LANES) {
      const profile = lane.split(':').at(-1)!;
      const filePath = resolve(ENGINE_ROOT, EXPECTED_FILES[lane]);

      it(`${profile} test file references the '${profile}' preset`, () => {
        const content = readFileSync(filePath, 'utf-8');
        const keywords = PRESET_KEYWORDS[profile] ?? [];
        const hasPreset = keywords.some((kw) => content.includes(kw));
        assert.ok(hasPreset, `${EXPECTED_FILES[lane]} should reference preset '${profile}'`);
      });

      it(`${profile} test file does not directly use other presets`, () => {
        const content = readFileSync(filePath, 'utf-8');
        for (const other of OTHER_PRESETS[profile] ?? []) {
          // Check for direct preset usage patterns: resolvePreset('X') or createMctsAgents(N, 'X')
          const directUsagePattern = new RegExp(`(?:resolvePreset|createMctsAgents)\\([^)]*'${other}'`, 'g');
          const matches = content.match(directUsagePattern);
          assert.equal(
            matches,
            null,
            `${EXPECTED_FILES[lane]} should not directly use '${other}' preset, found: ${JSON.stringify(matches)}`,
          );
        }
      });
    }
  });

  describe('helpers file does not contain test cases', () => {
    it('mcts-test-helpers.ts has no describe() or it() calls', () => {
      const helpersPath = resolve(ENGINE_ROOT, 'test/e2e/mcts/mcts-test-helpers.ts');
      const content = readFileSync(helpersPath, 'utf-8');
      assert.ok(!content.includes('describe('), 'helpers file should not contain describe() calls');
      assert.ok(!content.includes(' it('), 'helpers file should not contain it() calls');
    });
  });
});
