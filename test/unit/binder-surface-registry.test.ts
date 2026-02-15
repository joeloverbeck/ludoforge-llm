import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  collectDeclaredBinderCandidates,
  collectSequentialBindings,
  DECLARED_BINDER_EFFECT_KINDS,
  EFFECT_BINDER_SURFACES,
  rewriteDeclaredBindersInEffectNode,
} from '../../src/cnl/binder-surface-registry.js';
import { SUPPORTED_EFFECT_KINDS } from '../../src/cnl/effect-kind-registry.js';

describe('binder-surface-registry', () => {
  it('defines binder surfaces for every supported effect kind', () => {
    assert.deepEqual(
      Object.keys(EFFECT_BINDER_SURFACES).sort(),
      [...SUPPORTED_EFFECT_KINDS].sort(),
    );
  });

  it('tracks declared binder-producing effect kinds explicitly', () => {
    assert.deepEqual(
      [...DECLARED_BINDER_EFFECT_KINDS].sort(),
      ['chooseN', 'chooseOne', 'evaluateSubset', 'forEach', 'let', 'removeByPriority', 'rollRandom'],
    );
  });

  it('collects declared binder candidates with deterministic nested paths', () => {
    const candidates = collectDeclaredBinderCandidates({
      removeByPriority: {
        groups: [
          { bind: '$first', countBind: '$removedFirst' },
          { bind: '$second' },
        ],
        remainingBind: '$remaining',
      },
      chooseOne: {
        internalDecisionId: 'decision:$picked',
        bind: '$picked',
      },
    });

    assert.deepEqual(candidates, [
      { path: 'removeByPriority.groups.0.bind', value: '$first' },
      { path: 'removeByPriority.groups.1.bind', value: '$second' },
      { path: 'removeByPriority.groups.0.countBind', value: '$removedFirst' },
      { path: 'removeByPriority.remainingBind', value: '$remaining' },
      { path: 'chooseOne.bind', value: '$picked' },
    ]);
  });

  it('rewrites declared binder fields without touching non-declaration values', () => {
    const input = {
      chooseOne: { bind: '$choice', options: { query: 'binding', name: '$choice' } },
      setVar: { scope: 'global', var: 'picked', value: { ref: 'binding', name: '$choice' } },
    };
    const rewritten = rewriteDeclaredBindersInEffectNode(input, (binding) => `${binding}_renamed`);

    assert.deepEqual(rewritten, {
      chooseOne: { bind: '$choice_renamed', options: { query: 'binding', name: '$choice' } },
      setVar: { scope: 'global', var: 'picked', value: { ref: 'binding', name: '$choice' } },
    });
  });

  it('returns only sequentially-visible bindings for stage carry-over', () => {
    assert.deepEqual(
      collectSequentialBindings({
        chooseN: {
          internalDecisionId: 'decision:$targets',
          bind: '$targets',
          options: { query: 'players' },
          max: 1,
        },
      }),
      ['$targets'],
    );
    assert.deepEqual(
      collectSequentialBindings({
        removeByPriority: {
          budget: 1,
          groups: [
            {
              bind: '$tok',
              over: { query: 'players' },
              to: 'deck:none',
              countBind: '$removed',
            },
          ],
          remainingBind: '$remaining',
        },
      }),
      ['$removed', '$remaining'],
    );
    assert.deepEqual(
      collectSequentialBindings({
        forEach: {
          bind: '$tok',
          over: { query: 'players' },
          effects: [],
        },
      }),
      [],
    );
    assert.deepEqual(
      collectSequentialBindings({
        evaluateSubset: {
          source: { query: 'players' },
          subsetSize: 1,
          subsetBind: '$subset',
          compute: [],
          scoreExpr: 1,
          resultBind: '$score',
          bestSubsetBind: '$best',
          in: [],
        },
      }),
      ['$score', '$best'],
    );
  });

  it('fails when EffectAST introduces binder-capable nodes without registry updates', () => {
    const astSource = readFileSync(join(process.cwd(), 'src/kernel/types-ast.ts'), 'utf8');
    const discoveredKinds = new Set<string>();
    let currentEffectKind: string | null = null;

    for (const line of astSource.split('\n')) {
      if (/^\s*\|\s*\{/.test(line)) {
        currentEffectKind = null;
      }

      const kindMatch = line.match(/^\s*readonly\s+([A-Za-z0-9_]+)\s*:/);
      if (kindMatch !== null) {
        const kind = kindMatch[1] ?? '';
        if (SUPPORTED_EFFECT_KINDS.includes(kind as (typeof SUPPORTED_EFFECT_KINDS)[number])) {
          currentEffectKind = kind;
        }
      }

      if (currentEffectKind !== null && /\breadonly\s+(bind|[A-Za-z0-9_]*Bind)\s*:/.test(line)) {
        discoveredKinds.add(currentEffectKind);
      }
    }

    assert.deepEqual(
      [...discoveredKinds].sort(),
      [...DECLARED_BINDER_EFFECT_KINDS].sort(),
    );
  });
});
