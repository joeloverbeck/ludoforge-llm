import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  collectBinderSurfaceStringSites,
  collectDeclaredBinderCandidates,
  collectSequentialBindings,
  DECLARED_BINDER_EFFECT_KINDS,
  EFFECT_BINDER_SURFACES,
  MACRO_ORIGIN_CLASSIFIED_BINDER_EFFECT_KINDS,
  MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS,
  NON_EFFECT_BINDER_REFERENCER_SURFACES,
  REDUCE_MACRO_ORIGIN_BINDING_ANNOTATION_SPECS,
  REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS,
  rewriteBinderSurfaceStringsInNode,
  type MacroOriginNodeBindingAnnotationSpec,
  type RemoveByPriorityMacroOriginGroupBindField,
  type ReduceMacroOriginBindingAnnotationSpec,
} from '../../src/cnl/binder-surface-registry.js';
import { NON_EFFECT_BINDER_SURFACE_CONTRACT } from '../../src/cnl/binder-surface-contract.js';
import { SUPPORTED_EFFECT_KINDS } from '../../src/cnl/effect-kind-registry.js';

function discoverDiscriminatorKinds(
  source: string,
  typeName: string,
  key: 'ref' | 'query' | 'op',
  binderFieldPattern: RegExp,
): readonly string[] {
  const discovered = new Set<string>();
  const lines = source.split('\n');
  const typeHeader = `export type ${typeName} =`;
  let inTypeSection = false;
  let collecting = false;
  let currentDiscriminator: string | null = null;

  for (const line of lines) {
    if (!inTypeSection) {
      if (line.startsWith(typeHeader)) {
        inTypeSection = true;
      }
      continue;
    }
    if (/^export /.test(line)) {
      break;
    }
    if (/^\s*\|\s*\{/.test(line)) {
      collecting = false;
      currentDiscriminator = null;
    }
    const discriminator = line.match(new RegExp(`readonly\\s+${key}:\\s*'([^']+)'`))?.[1];
    if (discriminator !== undefined) {
      collecting = true;
      currentDiscriminator = discriminator;
      if (binderFieldPattern.test(line)) {
        discovered.add(discriminator);
      }
      continue;
    }
    if (collecting && binderFieldPattern.test(line)) {
      if (currentDiscriminator !== null) {
        discovered.add(currentDiscriminator);
      }
    }
  }
  return [...discovered].sort();
}

function discoverContractDiscriminatorKinds(key: 'ref' | 'query' | 'op'): readonly string[] {
  const discovered = new Set<string>();
  for (const surface of NON_EFFECT_BINDER_SURFACE_CONTRACT) {
    for (const condition of surface.matchAll) {
      if (condition.kind === 'equals' && condition.key === key) {
        discovered.add(condition.value);
      }
      if (condition.kind === 'oneOf' && condition.key === key) {
        for (const value of condition.values) {
          discovered.add(value);
        }
      }
    }
  }
  return [...discovered].sort();
}

describe('binder-surface-registry', () => {
  it('enforces macro-origin policy typing at compile time', () => {
    const validNodePolicy = [
      { effectKind: 'forEach', bindFields: ['bind'] },
      { effectKind: 'transferVar', bindFields: ['actualBind'] },
      { effectKind: 'evaluateSubset', bindFields: ['subsetBind', 'resultBind', 'bestSubsetBind'] },
    ] as const satisfies readonly MacroOriginNodeBindingAnnotationSpec[];
    void validNodePolicy;

    // @ts-expect-error transferVar node policy must use actualBind.
    const invalidNodePolicy = [{ effectKind: 'transferVar', bindFields: ['bind'] }] as const satisfies readonly MacroOriginNodeBindingAnnotationSpec[];
    void invalidNodePolicy;

    // @ts-expect-error node macro-origin policy must not accept empty bind field lists.
    const invalidNodePolicyEmptyFields = [{ effectKind: 'forEach', bindFields: [] }] as const satisfies readonly MacroOriginNodeBindingAnnotationSpec[];
    void invalidNodePolicyEmptyFields;

    const validReducePolicy = [
      { bindField: 'itemBind', macroOriginField: 'itemMacroOrigin' },
      { bindField: 'accBind', macroOriginField: 'accMacroOrigin' },
      { bindField: 'resultBind', macroOriginField: 'resultMacroOrigin' },
    ] as const satisfies readonly ReduceMacroOriginBindingAnnotationSpec[];
    void validReducePolicy;

    // @ts-expect-error itemBind must map to itemMacroOrigin.
    const invalidReducePolicyPair = [{ bindField: 'itemBind', macroOriginField: 'accMacroOrigin' }] as const satisfies readonly ReduceMacroOriginBindingAnnotationSpec[];
    void invalidReducePolicyPair;

    // @ts-expect-error reduce macro-origin policy must not accept non-reduce bind fields.
    const invalidReduceBindField = [{ bindField: 'bind', macroOriginField: 'itemMacroOrigin' }] as const satisfies readonly ReduceMacroOriginBindingAnnotationSpec[];
    void invalidReduceBindField;

    const validRemoveByPriorityGroupPolicy = ['bind', 'countBind'] as const satisfies readonly RemoveByPriorityMacroOriginGroupBindField[];
    void validRemoveByPriorityGroupPolicy;

    // @ts-expect-error removeByPriority group policy fields must be declared in groups.* binder paths.
    const invalidRemoveByPriorityGroupPolicy = ['remainingBind'] as const satisfies readonly RemoveByPriorityMacroOriginGroupBindField[];
    void invalidRemoveByPriorityGroupPolicy;
  });

  it('defines binder surfaces for every supported effect kind', () => {
    assert.deepEqual(
      Object.keys(EFFECT_BINDER_SURFACES).sort(),
      [...SUPPORTED_EFFECT_KINDS].sort(),
    );
  });

  it('tracks declared binder-producing effect kinds explicitly', () => {
    assert.deepEqual(
      [...DECLARED_BINDER_EFFECT_KINDS].sort(),
      ['bindValue', 'chooseN', 'chooseOne', 'evaluateSubset', 'forEach', 'let', 'reduce', 'removeByPriority', 'rollRandom', 'transferVar'],
    );
  });

  it('tracks node-level macro-origin annotation effect kinds explicitly', () => {
    assert.deepEqual(
      [...MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS]
        .map((spec) => spec.effectKind)
        .sort(),
      ['bindValue', 'chooseN', 'chooseOne', 'evaluateSubset', 'forEach', 'let', 'rollRandom', 'transferVar'],
    );
  });

  it('classifies every binder-declaring effect kind in macro-origin annotation policy', () => {
    assert.deepEqual(
      [...DECLARED_BINDER_EFFECT_KINDS].sort(),
      [...MACRO_ORIGIN_CLASSIFIED_BINDER_EFFECT_KINDS].sort(),
      'Every binder-declaring effect kind must be explicitly classified: node-level annotation spec or specialized macro-origin handling.',
    );
  });

  it('keeps node-level macro-origin annotation bind fields aligned with declared binder paths', () => {
    for (const spec of MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS) {
      const declaredLeafFields = new Set(
        EFFECT_BINDER_SURFACES[spec.effectKind].declaredBinderPaths
          .map((path) => path[path.length - 1])
          .filter((segment): segment is NonNullable<typeof segment> => typeof segment === 'string'),
      );
      for (const bindField of spec.bindFields) {
        assert.equal(
          declaredLeafFields.has(bindField),
          true,
          `${spec.effectKind}.${bindField} must be declared in EFFECT_BINDER_SURFACES`,
        );
      }
    }
  });

  it('keeps reduce macro-origin binder mappings aligned with declared binder paths', () => {
    const reduceDeclaredLeafFields = new Set(
      EFFECT_BINDER_SURFACES.reduce.declaredBinderPaths
        .map((path) => path[path.length - 1])
        .filter((segment): segment is NonNullable<typeof segment> => typeof segment === 'string'),
    );
    for (const spec of REDUCE_MACRO_ORIGIN_BINDING_ANNOTATION_SPECS) {
      assert.equal(
        reduceDeclaredLeafFields.has(spec.bindField),
        true,
        `reduce.${spec.bindField} must be declared in EFFECT_BINDER_SURFACES`,
      );
      assert.equal(spec.macroOriginField.endsWith('MacroOrigin'), true);
    }
  });

  it('keeps removeByPriority group macro-origin bind fields aligned with declared group binder paths', () => {
    const removeByPriorityGroupDeclaredLeafFields = new Set<string>(
      EFFECT_BINDER_SURFACES.removeByPriority.declaredBinderPaths
        .filter((path) => path[0] === 'groups' && path[1] === '*')
        .map((path) => path[path.length - 1])
        .filter((segment): segment is NonNullable<typeof segment> => typeof segment === 'string'),
    );
    const macroOriginPolicyFields = new Set<string>(REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS);
    const missingFromDeclaredPaths = [...macroOriginPolicyFields].filter(
      (field) => !removeByPriorityGroupDeclaredLeafFields.has(field),
    );
    const missingFromPolicy = [...removeByPriorityGroupDeclaredLeafFields].filter(
      (field) => !macroOriginPolicyFields.has(field),
    );

    assert.deepEqual(missingFromDeclaredPaths, [], [
      'removeByPriority macro-origin policy includes non-declared groups.* binder fields.',
      `Policy-only fields: ${missingFromDeclaredPaths.join(', ') || '(none)'}`,
      `Declared groups.* fields: ${[...removeByPriorityGroupDeclaredLeafFields].join(', ') || '(none)'}`,
    ].join(' '));

    assert.deepEqual(missingFromPolicy, [], [
      'removeByPriority groups.* declared binder fields are missing from macro-origin policy.',
      `Declared-only fields: ${missingFromPolicy.join(', ') || '(none)'}`,
      `Policy fields: ${[...macroOriginPolicyFields].join(', ') || '(none)'}`,
    ].join(' '));
  });

  it('defines nested sequential scope metadata for scoped exporters', () => {
    assert.deepEqual(EFFECT_BINDER_SURFACES.let.nestedSequentialBindingScopes, [
      { nestedEffectsPath: ['in'], excludedBinderPaths: [['bind']] },
    ]);
    assert.deepEqual(EFFECT_BINDER_SURFACES.reduce.nestedSequentialBindingScopes, [
      { nestedEffectsPath: ['in'], excludedBinderPaths: [['resultBind']] },
    ]);
  });

  it('tracks conceal binding template references for from.chosen parity with reveal', () => {
    assert.deepEqual(EFFECT_BINDER_SURFACES.reveal.bindingTemplateReferencerPaths, [['to', 'chosen']]);
    assert.deepEqual(EFFECT_BINDER_SURFACES.conceal.bindingTemplateReferencerPaths, [['from', 'chosen']]);
  });

  it('defines a centralized registry for non-effect binder referencer shapes', () => {
    assert.equal(NON_EFFECT_BINDER_REFERENCER_SURFACES.length > 0, true);
    assert.deepEqual(
      NON_EFFECT_BINDER_REFERENCER_SURFACES.map((surface) => surface.id).sort(),
      NON_EFFECT_BINDER_SURFACE_CONTRACT.map((surface) => surface.id).sort(),
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
    const rewritten = rewriteBinderSurfaceStringsInNode(input, {
      rewriteDeclaredBinder: (binding) => `${binding}_renamed`,
      rewriteBindingName: (binding) => binding,
      rewriteBindingTemplate: (binding) => binding,
      rewriteZoneSelector: (selector) => selector,
    });

    assert.deepEqual(rewritten, {
      chooseOne: { bind: '$choice_renamed', options: { query: 'binding', name: '$choice' } },
      setVar: { scope: 'global', var: 'picked', value: { ref: 'binding', name: '$choice' } },
    });
  });

  it('rewrites and collects non-effect binder referencers via canonical registry helpers', () => {
    const node = {
      ref: 'binding',
      name: '$choice',
      aggregate: {
        bind: '$row',
        query: {
          op: 'adjacent',
          left: '$row',
          right: '$fixed',
        },
      },
      queryNode: {
        query: 'zones',
        filter: { owner: { chosen: '$choice' } },
      },
    };
    const renamed = new Map<string, string>([
      ['$choice', '$choice_renamed'],
      ['$row', '$row_renamed'],
    ]);
    const rewritten = rewriteBinderSurfaceStringsInNode(
      node,
      {
        rewriteDeclaredBinder: (value) => renamed.get(value) ?? value,
        rewriteBindingName: (value) => renamed.get(value) ?? value,
        rewriteBindingTemplate: (value) => renamed.get(value) ?? value,
        rewriteZoneSelector: (value) => renamed.get(value) ?? value,
      },
    );
    const sites: Array<{ path: string; value: string }> = [];
    collectBinderSurfaceStringSites(rewritten, 'root', sites);

    assert.equal((rewritten as { name: string }).name, '$choice_renamed');
    assert.equal(
      (rewritten as { aggregate: { bind: string } }).aggregate.bind,
      '$row_renamed',
    );
    assert.equal(
      (
        rewritten as {
          aggregate: { query: { left: string; right: string } };
        }
      ).aggregate.query.left,
      '$row_renamed',
    );
    assert.equal(
      (
        rewritten as {
          queryNode: { filter: { owner: { chosen: string } } };
        }
      ).queryNode.filter.owner.chosen,
      '$choice_renamed',
    );
    assert.equal(
      sites.some((site) => site.path === 'root.name' && site.value === '$choice_renamed'),
      true,
    );
  });

  it('rewrites assetField row binding templates in non-effect nodes', () => {
    const rewritten = rewriteBinderSurfaceStringsInNode(
      {
        ref: 'assetField',
        row: '$row',
        tableId: 'tournament-standard::settings.blindSchedule',
        field: 'sb',
      },
      {
        rewriteDeclaredBinder: (value) => value,
        rewriteBindingName: (value) => value,
        rewriteBindingTemplate: (value) => (value === '$row' ? '$row_renamed' : value),
        rewriteZoneSelector: (value) => value,
      },
    );

    assert.deepEqual(rewritten, {
      ref: 'assetField',
      row: '$row_renamed',
      tableId: 'tournament-standard::settings.blindSchedule',
      field: 'sb',
    });
  });

  it('rewrites tokensInMapSpaces owner chosen binding templates in non-effect nodes', () => {
    const rewritten = rewriteBinderSurfaceStringsInNode(
      {
        query: 'tokensInMapSpaces',
        spaceFilter: { owner: { chosen: '$owner' } },
      },
      {
        rewriteDeclaredBinder: (value) => value,
        rewriteBindingName: (value) => value,
        rewriteBindingTemplate: (value) => (value === '$owner' ? '$owner_renamed' : value),
        rewriteZoneSelector: (value) => value,
      },
    );

    assert.deepEqual(rewritten, {
      query: 'tokensInMapSpaces',
      spaceFilter: { owner: { chosen: '$owner_renamed' } },
    });
  });

  it('rewrites nextInOrderByCondition declared bind in non-effect nodes', () => {
    const rewritten = rewriteBinderSurfaceStringsInNode(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 0,
        bind: '$seat',
        where: { op: '==', left: { ref: 'binding', name: '$seat' }, right: 1 },
      },
      {
        rewriteDeclaredBinder: (value) => (value === '$seat' ? '$seat_renamed' : value),
        rewriteBindingName: (value) => (value === '$seat' ? '$seat_renamed' : value),
        rewriteBindingTemplate: (value) => value,
        rewriteZoneSelector: (value) => value,
      },
    );

    assert.deepEqual(rewritten, {
      query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 0,
      bind: '$seat_renamed',
      where: { op: '==', left: { ref: 'binding', name: '$seat_renamed' }, right: 1 },
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
        transferVar: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pot' },
          amount: 3,
          actualBind: '$actual',
        },
      }),
      ['$actual'],
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
        let: {
          bind: 'local',
          value: 0,
          in: [{ bindValue: { bind: 'exported', value: 1 } }],
        },
      }),
      ['exported'],
    );
    assert.deepEqual(
      collectSequentialBindings({
        reduce: {
          itemBind: 'item',
          accBind: 'acc',
          over: { query: 'players' },
          initial: 0,
          next: 0,
          resultBind: 'result',
          in: [{ bindValue: { bind: 'exported', value: { ref: 'binding', name: 'result' } } }],
        },
      }),
      ['exported'],
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
    assert.deepEqual(
      collectSequentialBindings({
        if: {
          when: true,
          then: [{ bindValue: { bind: '$thenOnly', value: 1 } }],
        },
      }),
      [],
    );
    assert.deepEqual(
      collectSequentialBindings({
        if: {
          when: true,
          then: [
            { bindValue: { bind: '$shared', value: 1 } },
            { bindValue: { bind: '$thenOnly', value: 2 } },
          ],
          else: [{ bindValue: { bind: '$shared', value: 3 } }],
        },
      }),
      ['$shared'],
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

      if (currentEffectKind !== null && /\breadonly\s+(bind|[A-Za-z0-9_]*Bind)\??\s*:/.test(line)) {
        discoveredKinds.add(currentEffectKind);
      }
    }

    assert.deepEqual(
      [...discoveredKinds].sort(),
      [...DECLARED_BINDER_EFFECT_KINDS].sort(),
    );
  });

  it('fails when non-effect binder-capable discriminator nodes drift without contract updates', () => {
    const astSource = readFileSync(join(process.cwd(), 'src/kernel/types-ast.ts'), 'utf8');
    const referenceKinds = discoverDiscriminatorKinds(
      astSource,
      'Reference',
      'ref',
      /\breadonly\s+(name|row|token|zone|space|player)\??\s*:\s*(string|TokenSel|ZoneSel|PlayerSel)\b/,
    );
    const queryKinds = discoverDiscriminatorKinds(
      astSource,
      'OptionsQuery',
      'query',
      /\breadonly\s+(name|zone|bind)\??\s*:\s*(string|ZoneRef)\b|readonly\s+(spaceFilter|filter)\??\s*:\s*\{\s*readonly\s+owner\??\s*:\s*PlayerSel\b/,
    );
    const opKinds = discoverDiscriminatorKinds(
      astSource,
      'ConditionAST',
      'op',
      /\breadonly\s+(left|right|from|to|zone)\??\s*:\s*ZoneSel\b/,
    );

    assert.deepEqual(referenceKinds, discoverContractDiscriminatorKinds('ref'));
    assert.deepEqual(queryKinds, discoverContractDiscriminatorKinds('query'));
    assert.deepEqual(opKinds, discoverContractDiscriminatorKinds('op'));
  });
});
