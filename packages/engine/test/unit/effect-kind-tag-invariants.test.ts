// @test-class: architectural-invariant
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EFFECT_KIND_TAG } from '../../src/kernel/types-ast.js';
import type { EffectKind } from '../../src/kernel/types-ast.js';
import { registry, TAG_TO_KIND } from '../../src/kernel/effect-registry.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

/**
 * Recursively walk a structure and collect all objects that have a `_k` field
 * (i.e., tagged EffectAST nodes). For each, verify that `_k` matches the
 * property key via EFFECT_KIND_TAG.
 */
function collectTagMismatches(
  obj: unknown,
  path: string,
): readonly { path: string; kind: string; expected: number; actual: number }[] {
  if (obj === null || obj === undefined || typeof obj !== 'object') return [];

  if (Array.isArray(obj)) {
    const results: { path: string; kind: string; expected: number; actual: number }[] = [];
    for (let i = 0; i < obj.length; i++) {
      results.push(...collectTagMismatches(obj[i], `${path}[${i}]`));
    }
    return results;
  }

  const record = obj as Record<string, unknown>;
  const mismatches: { path: string; kind: string; expected: number; actual: number }[] = [];

  // Check if this object has a _k tag (i.e., it's an EffectAST node)
  if (typeof record['_k'] === 'number') {
    const actualTag = record['_k'] as number;
    // Find the property key that's an EffectKind
    for (const key of Object.keys(record)) {
      if (key === '_k') continue;
      if (key in EFFECT_KIND_TAG) {
        const expectedTag = EFFECT_KIND_TAG[key as EffectKind];
        if (actualTag !== expectedTag) {
          mismatches.push({ path, kind: key, expected: expectedTag, actual: actualTag });
        }
        break;
      }
    }
  }

  // Recurse into all values
  for (const [key, value] of Object.entries(record)) {
    if (key === '_k') continue;
    mismatches.push(...collectTagMismatches(value, `${path}.${key}`));
  }

  return mismatches;
}

/** Count all objects with a `_k` field in a structure. */
function countTaggedNodes(obj: unknown): number {
  if (obj === null || obj === undefined || typeof obj !== 'object') return 0;
  if (Array.isArray(obj)) return obj.reduce((sum, el) => sum + countTaggedNodes(el), 0);
  const record = obj as Record<string, unknown>;
  let count = typeof record['_k'] === 'number' ? 1 : 0;
  for (const value of Object.values(record)) {
    count += countTaggedNodes(value);
  }
  return count;
}

describe('EFFECT_KIND_TAG invariants', () => {
  describe('exhaustiveness', () => {
    it('EFFECT_KIND_TAG key count matches registry key count', () => {
      assert.strictEqual(
        Object.keys(EFFECT_KIND_TAG).length,
        Object.keys(registry).length,
        'EFFECT_KIND_TAG must cover all EffectKind variants',
      );
    });
  });

  describe('key parity', () => {
    it('EFFECT_KIND_TAG keys exactly match registry keys', () => {
      const tagKeys = new Set(Object.keys(EFFECT_KIND_TAG));
      const registryKeys = new Set(Object.keys(registry));
      assert.deepStrictEqual(tagKeys, registryKeys);
    });
  });

  describe('contiguity', () => {
    it('tag values are contiguous 0..N-1', () => {
      const tagValues = Object.values(EFFECT_KIND_TAG).sort((a, b) => a - b);
      assert.deepStrictEqual(
        tagValues,
        Array.from({ length: tagValues.length }, (_, i) => i),
        'EFFECT_KIND_TAG values must be contiguous starting from 0',
      );
    });
  });

  describe('TAG_TO_KIND consistency', () => {
    it('TAG_TO_KIND[EFFECT_KIND_TAG[k]] === k for every k', () => {
      for (const [kind, tag] of Object.entries(EFFECT_KIND_TAG)) {
        assert.strictEqual(
          TAG_TO_KIND[tag as number],
          kind,
          `TAG_TO_KIND[${tag}] should be "${kind}"`,
        );
      }
    });
  });

  describe('tag consistency on compiled GameDefs', () => {
    it('all FITL EffectAST nodes have _k matching their property key', () => {
      const { compiled } = compileProductionSpec();
      const gameDef = compiled.gameDef;
      const mismatches = collectTagMismatches(gameDef, 'gameDef');
      const taggedCount = countTaggedNodes(gameDef);

      assert.ok(taggedCount > 0, 'FITL GameDef should contain tagged EffectAST nodes');
      assert.deepStrictEqual(
        mismatches,
        [],
        `Found ${mismatches.length} _k tag mismatches in FITL GameDef`,
      );
    });

    it('all Texas Hold\'em EffectAST nodes have _k matching their property key', () => {
      const { compiled } = compileTexasProductionSpec();
      const gameDef = compiled.gameDef;
      const mismatches = collectTagMismatches(gameDef, 'gameDef');
      const taggedCount = countTaggedNodes(gameDef);

      assert.ok(taggedCount > 0, 'Texas Hold\'em GameDef should contain tagged EffectAST nodes');
      assert.deepStrictEqual(
        mismatches,
        [],
        `Found ${mismatches.length} _k tag mismatches in Texas Hold'em GameDef`,
      );
    });
  });

  describe('round-trip serialization', () => {
    it('JSON round-trip preserves _k fields', () => {
      const { compiled } = compileProductionSpec();
      const gameDef = compiled.gameDef;
      const serialized = JSON.stringify(gameDef);
      const deserialized = JSON.parse(serialized) as Record<string, unknown>;

      // Verify _k fields survived serialization by checking for mismatches
      const mismatches = collectTagMismatches(deserialized, 'deserialized');
      assert.deepStrictEqual(
        mismatches,
        [],
        'Round-tripped _k fields should be consistent',
      );

      // Verify tagged count is preserved
      const originalCount = countTaggedNodes(gameDef);
      const roundTrippedCount = countTaggedNodes(deserialized);
      assert.strictEqual(
        roundTrippedCount,
        originalCount,
        'Round-trip should preserve the same number of _k-tagged nodes',
      );
    });
  });
});
