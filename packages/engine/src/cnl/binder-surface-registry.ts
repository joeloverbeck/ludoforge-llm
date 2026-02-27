import type { EffectAST } from '../kernel/types.js';
import {
  EFFECT_BINDER_SURFACE_CONTRACT,
  NON_EFFECT_BINDER_SURFACE_CONTRACT,
  type BinderPathSegment,
  type BinderSurfacePaths,
  type EffectBinderSurfaceDefinition,
  type NonEffectBinderSurfaceDefinition,
} from './binder-surface-contract.js';
import { SUPPORTED_EFFECT_KINDS, type SupportedEffectKind } from './effect-kind-registry.js';

export const EFFECT_BINDER_SURFACES: Readonly<Record<SupportedEffectKind, EffectBinderSurfaceDefinition>> =
  EFFECT_BINDER_SURFACE_CONTRACT;

export interface BinderDeclarationCandidate {
  readonly path: string;
  readonly value: unknown;
}

export interface StringSite {
  readonly path: string;
  readonly value: string;
}

interface ConditionalReferencerSurfaceDefinition {
  readonly id: string;
  readonly when: (node: Record<string, unknown>) => boolean;
  readonly declaredBinderPaths: BinderSurfacePaths['declaredBinderPaths'];
  readonly bindingNameReferencerPaths: BinderSurfacePaths['bindingNameReferencerPaths'];
  readonly bindingTemplateReferencerPaths: BinderSurfacePaths['bindingTemplateReferencerPaths'];
  readonly zoneSelectorReferencerPaths: BinderSurfacePaths['zoneSelectorReferencerPaths'];
}

function matchesSurfaceCondition(
  node: Record<string, unknown>,
  surface: NonEffectBinderSurfaceDefinition,
): boolean {
  for (const condition of surface.matchAll) {
    if (condition.kind === 'equals') {
      if (node[condition.key] !== condition.value) {
        return false;
      }
      continue;
    }
    if (condition.kind === 'oneOf') {
      const value = node[condition.key];
      if (typeof value !== 'string' || !condition.values.includes(value)) {
        return false;
      }
      continue;
    }
    if (condition.kind === 'record' && !isRecord(node[condition.key])) {
      return false;
    }
  }
  return true;
}

export const NON_EFFECT_BINDER_REFERENCER_SURFACES: readonly ConditionalReferencerSurfaceDefinition[] =
  NON_EFFECT_BINDER_SURFACE_CONTRACT.map((surface) => ({
    ...surface,
    when: (node) => matchesSurfaceCondition(node, surface),
  }));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectPathValues(
  node: unknown,
  segments: readonly BinderPathSegment[],
  path: string,
  into: BinderDeclarationCandidate[],
): void {
  if (segments.length === 0) {
    into.push({ path, value: node });
    return;
  }

  const segment = segments[0]!;
  const rest = segments.slice(1);
  if (segment === '*') {
    if (!Array.isArray(node)) {
      return;
    }
    for (let index = 0; index < node.length; index += 1) {
      collectPathValues(node[index], rest, `${path}.${index}`, into);
    }
    return;
  }

  if (!isRecord(node) || !(segment in node)) {
    return;
  }

  collectPathValues(node[segment], rest, `${path}.${segment}`, into);
}

function cloneDeep<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneDeep(entry)) as TValue;
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = cloneDeep(entry);
    }
    return out as TValue;
  }
  return value;
}

function collectStringSitesAtPath(
  node: unknown,
  segments: readonly BinderPathSegment[],
  path: string,
  into: StringSite[],
): void {
  if (segments.length === 0) {
    if (typeof node === 'string') {
      into.push({ path, value: node });
    }
    return;
  }

  const segment = segments[0]!;
  const rest = segments.slice(1);
  if (segment === '*') {
    if (!Array.isArray(node)) {
      return;
    }
    for (let index = 0; index < node.length; index += 1) {
      collectStringSitesAtPath(node[index], rest, `${path}.${index}`, into);
    }
    return;
  }

  if (!isRecord(node) || !(segment in node)) {
    return;
  }
  collectStringSitesAtPath(node[segment], rest, `${path}.${segment}`, into);
}

function rewriteStringLeavesAtPath(
  node: unknown,
  segments: readonly BinderPathSegment[],
  rewrite: (binding: string) => string,
): boolean {
  if (segments.length === 0) {
    return false;
  }

  const segment = segments[0]!;
  const rest = segments.slice(1);
  if (segment === '*') {
    if (!Array.isArray(node)) {
      return false;
    }
    let changed = false;
    for (let index = 0; index < node.length; index += 1) {
      const child = node[index];
      if (rest.length === 0) {
        if (typeof child === 'string') {
          const next = rewrite(child);
          if (next !== child) {
            node[index] = next;
            changed = true;
          }
        }
      } else {
        changed = rewriteStringLeavesAtPath(child, rest, rewrite) || changed;
      }
    }
    return changed;
  }

  if (!isRecord(node) || !(segment in node)) {
    return false;
  }

  if (rest.length === 0) {
    const current = node[segment];
    if (typeof current !== 'string') {
      return false;
    }
    const next = rewrite(current);
    if (next !== current) {
      node[segment] = next;
      return true;
    }
    return false;
  }

  return rewriteStringLeavesAtPath(node[segment], rest, rewrite);
}

export function collectDeclaredBinderCandidates(effectNode: Record<string, unknown>): readonly BinderDeclarationCandidate[] {
  const candidates: BinderDeclarationCandidate[] = [];
  for (const kind of SUPPORTED_EFFECT_KINDS) {
    const effectBody = effectNode[kind];
    if (!isRecord(effectBody)) {
      continue;
    }

    const binderPaths = EFFECT_BINDER_SURFACES[kind].declaredBinderPaths;
    for (const binderPath of binderPaths) {
      collectPathValues(effectBody, binderPath, kind, candidates);
    }
  }
  return candidates;
}

interface SurfaceTarget {
  readonly node: Record<string, unknown>;
  readonly surface: BinderSurfacePaths;
  readonly path: string;
}

function collectSurfaceTargets(node: Record<string, unknown>, path: string): readonly SurfaceTarget[] {
  const targets: SurfaceTarget[] = [];
  for (const kind of SUPPORTED_EFFECT_KINDS) {
    const effectBody = node[kind];
    if (!isRecord(effectBody)) {
      continue;
    }
    targets.push({
      node: effectBody,
      surface: EFFECT_BINDER_SURFACES[kind],
      path: `${path}.${kind}`,
    });
  }
  for (const surface of NON_EFFECT_BINDER_REFERENCER_SURFACES) {
    if (!surface.when(node)) {
      continue;
    }
    targets.push({
      node,
      surface,
      path,
    });
  }
  return targets;
}

interface BinderSurfaceRewriters {
  readonly rewriteDeclaredBinder: (value: string) => string;
  readonly rewriteBindingName: (value: string) => string;
  readonly rewriteBindingTemplate: (value: string) => string;
  readonly rewriteZoneSelector: (value: string) => string;
}

export function rewriteBinderSurfaceStringsInNode(
  node: Record<string, unknown>,
  rewriters: BinderSurfaceRewriters,
): Record<string, unknown> {
  let changed = false;
  let rewritten = cloneDeep(node) as Record<string, unknown>;

  for (const target of collectSurfaceTargets(rewritten, '')) {
    for (const binderPath of target.surface.declaredBinderPaths) {
      changed = rewriteStringLeavesAtPath(target.node, binderPath, rewriters.rewriteDeclaredBinder) || changed;
    }
    for (const referencerPath of target.surface.bindingNameReferencerPaths) {
      changed = rewriteStringLeavesAtPath(target.node, referencerPath, rewriters.rewriteBindingName) || changed;
    }
    for (const referencerPath of target.surface.bindingTemplateReferencerPaths) {
      changed = rewriteStringLeavesAtPath(target.node, referencerPath, rewriters.rewriteBindingTemplate) || changed;
    }
    for (const referencerPath of target.surface.zoneSelectorReferencerPaths) {
      changed = rewriteStringLeavesAtPath(target.node, referencerPath, rewriters.rewriteZoneSelector) || changed;
    }
  }

  for (const [key, value] of Object.entries(rewritten)) {
    let nextValue = value;
    if (Array.isArray(value)) {
      let arrayChanged = false;
      const rewrittenArray = value.map((entry) => {
        if (!isRecord(entry)) {
          return entry;
        }
        const rewrittenEntry = rewriteBinderSurfaceStringsInNode(entry, rewriters);
        if (rewrittenEntry !== entry) {
          arrayChanged = true;
        }
        return rewrittenEntry;
      });
      if (arrayChanged) {
        nextValue = rewrittenArray;
      }
    } else if (isRecord(value)) {
      const rewrittenValue = rewriteBinderSurfaceStringsInNode(value, rewriters);
      if (rewrittenValue !== value) {
        nextValue = rewrittenValue;
      }
    }

    if (nextValue !== value) {
      if (!changed) {
        rewritten = { ...rewritten };
      }
      changed = true;
      rewritten[key] = nextValue;
    }
  }

  return changed ? rewritten : node;
}

export function collectBinderSurfaceStringSites(
  node: Record<string, unknown>,
  path: string,
  into: StringSite[],
): void {
  for (const target of collectSurfaceTargets(node, path)) {
    for (const declaredPath of target.surface.declaredBinderPaths) {
      collectStringSitesAtPath(target.node, declaredPath, target.path, into);
    }
    for (const referencerPath of target.surface.bindingNameReferencerPaths) {
      collectStringSitesAtPath(target.node, referencerPath, target.path, into);
    }
    for (const referencerPath of target.surface.bindingTemplateReferencerPaths) {
      collectStringSitesAtPath(target.node, referencerPath, target.path, into);
    }
    for (const referencerPath of target.surface.zoneSelectorReferencerPaths) {
      collectStringSitesAtPath(target.node, referencerPath, target.path, into);
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const entry = value[index];
        if (!isRecord(entry)) {
          continue;
        }
        collectBinderSurfaceStringSites(entry, `${path}.${key}[${index}]`, into);
      }
      continue;
    }
    if (isRecord(value)) {
      collectBinderSurfaceStringSites(value, `${path}.${key}`, into);
    }
  }
}

export function collectSequentialBindings(effect: EffectAST): readonly string[] {
  const bindings: string[] = [];
  for (const kind of SUPPORTED_EFFECT_KINDS) {
    if (!(kind in effect)) {
      continue;
    }

    const effectBody = (effect as Record<string, unknown>)[kind];
    if (!isRecord(effectBody)) {
      continue;
    }

    if (kind === 'if') {
      const thenEffects = Array.isArray(effectBody.then) ? effectBody.then : [];
      const elseEffects = Array.isArray(effectBody.else) ? effectBody.else : [];
      const thenBindings = collectSequentialBindingsFromEffectArray(thenEffects);
      const elseBindingSet = new Set(collectSequentialBindingsFromEffectArray(elseEffects));
      for (const binding of thenBindings) {
        if (elseBindingSet.has(binding)) {
          bindings.push(binding);
        }
      }
      continue;
    }

    const candidates: BinderDeclarationCandidate[] = [];
    for (const path of EFFECT_BINDER_SURFACES[kind].sequentiallyVisibleBinderPaths) {
      collectPathValues(effectBody, path, kind, candidates);
    }
    for (const candidate of candidates) {
      if (typeof candidate.value === 'string') {
        bindings.push(candidate.value);
      }
    }

    for (const scopeDefinition of EFFECT_BINDER_SURFACES[kind].nestedSequentialBindingScopes ?? []) {
      const nestedScopeCandidates: BinderDeclarationCandidate[] = [];
      collectPathValues(effectBody, scopeDefinition.nestedEffectsPath, kind, nestedScopeCandidates);

      const excluded = new Set<string>();
      for (const excludedPath of scopeDefinition.excludedBinderPaths) {
        const excludedCandidates: BinderDeclarationCandidate[] = [];
        collectPathValues(effectBody, excludedPath, kind, excludedCandidates);
        for (const candidate of excludedCandidates) {
          if (typeof candidate.value === 'string') {
            excluded.add(candidate.value);
          }
        }
      }

      for (const candidate of nestedScopeCandidates) {
        if (!Array.isArray(candidate.value)) {
          continue;
        }
        for (const entry of candidate.value) {
          if (!isRecord(entry)) {
            continue;
          }
          for (const nestedBinding of collectSequentialBindings(entry as EffectAST)) {
            if (!excluded.has(nestedBinding)) {
              bindings.push(nestedBinding);
            }
          }
        }
      }
    }
  }
  return bindings;
}

function collectSequentialBindingsFromEffectArray(effects: readonly unknown[]): readonly string[] {
  const sequential: string[] = [];
  const seen = new Set<string>();
  for (const entry of effects) {
    if (!isRecord(entry)) {
      continue;
    }
    for (const binding of collectSequentialBindings(entry as EffectAST)) {
      if (seen.has(binding)) {
        continue;
      }
      seen.add(binding);
      sequential.push(binding);
    }
  }
  return sequential;
}

export const DECLARED_BINDER_EFFECT_KINDS: readonly SupportedEffectKind[] = SUPPORTED_EFFECT_KINDS.filter(
  (kind) => EFFECT_BINDER_SURFACES[kind].declaredBinderPaths.length > 0,
);

type LastPathSegment<TPath extends readonly unknown[]> = TPath extends readonly [...readonly unknown[], infer TLast]
  ? TLast
  : never;

type DeclaredBinderLeafField<TEffectKind extends SupportedEffectKind> = Extract<
  LastPathSegment<(typeof EFFECT_BINDER_SURFACE_CONTRACT)[TEffectKind]['declaredBinderPaths'][number]>,
  string
>;

interface MacroOriginNodeBindFieldByEffectKind {
  readonly forEach: Extract<DeclaredBinderLeafField<'forEach'>, 'bind'>;
  readonly let: Extract<DeclaredBinderLeafField<'let'>, 'bind'>;
  readonly bindValue: Extract<DeclaredBinderLeafField<'bindValue'>, 'bind'>;
  readonly chooseOne: Extract<DeclaredBinderLeafField<'chooseOne'>, 'bind'>;
  readonly chooseN: Extract<DeclaredBinderLeafField<'chooseN'>, 'bind'>;
  readonly rollRandom: Extract<DeclaredBinderLeafField<'rollRandom'>, 'bind'>;
  readonly transferVar: Extract<DeclaredBinderLeafField<'transferVar'>, 'actualBind'>;
  readonly evaluateSubset: Extract<DeclaredBinderLeafField<'evaluateSubset'>, 'subsetBind' | 'resultBind' | 'bestSubsetBind'>;
}

type MacroOriginNodeBindingEffectKind = keyof MacroOriginNodeBindFieldByEffectKind;

export type MacroOriginNodeBindingAnnotationSpec = {
  readonly [TEffectKind in MacroOriginNodeBindingEffectKind]: {
    readonly effectKind: TEffectKind;
    readonly bindFields: readonly [
      MacroOriginNodeBindFieldByEffectKind[TEffectKind],
      ...MacroOriginNodeBindFieldByEffectKind[TEffectKind][],
    ];
  };
}[MacroOriginNodeBindingEffectKind];

type StripBindSuffix<TField extends string> = TField extends `${infer TStem}Bind` ? TStem : never;

type ReduceMacroOriginBindField = DeclaredBinderLeafField<'reduce'>;

type ReduceMacroOriginFieldByBindField<TBindField extends ReduceMacroOriginBindField> =
  `${StripBindSuffix<TBindField>}MacroOrigin`;

export type ReduceMacroOriginBindingAnnotationSpec = {
  readonly [TBindField in ReduceMacroOriginBindField]: {
    readonly bindField: TBindField;
    readonly macroOriginField: ReduceMacroOriginFieldByBindField<TBindField>;
  };
}[ReduceMacroOriginBindField];

export type RemoveByPriorityMacroOriginGroupBindField = Extract<
  (typeof EFFECT_BINDER_SURFACE_CONTRACT)['removeByPriority']['declaredBinderPaths'][number],
  readonly ['groups', '*', string]
>[2];

export const MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS = [
  { effectKind: 'forEach', bindFields: ['bind'] },
  { effectKind: 'let', bindFields: ['bind'] },
  { effectKind: 'bindValue', bindFields: ['bind'] },
  { effectKind: 'chooseOne', bindFields: ['bind'] },
  { effectKind: 'chooseN', bindFields: ['bind'] },
  { effectKind: 'rollRandom', bindFields: ['bind'] },
  { effectKind: 'transferVar', bindFields: ['actualBind'] },
  { effectKind: 'evaluateSubset', bindFields: ['subsetBind', 'resultBind', 'bestSubsetBind'] },
] as const satisfies readonly MacroOriginNodeBindingAnnotationSpec[];

export const MACRO_ORIGIN_SPECIALIZED_BINDER_EFFECT_KINDS = [
  'reduce',
  'removeByPriority',
] as const satisfies readonly SupportedEffectKind[];

export const MACRO_ORIGIN_CLASSIFIED_BINDER_EFFECT_KINDS: readonly SupportedEffectKind[] = [
  ...new Set<SupportedEffectKind>([
    ...MACRO_ORIGIN_NODE_BINDING_ANNOTATION_SPECS.map((spec) => spec.effectKind),
    ...MACRO_ORIGIN_SPECIALIZED_BINDER_EFFECT_KINDS,
  ]),
];

export const REDUCE_MACRO_ORIGIN_BINDING_ANNOTATION_SPECS = [
  { bindField: 'itemBind', macroOriginField: 'itemMacroOrigin' },
  { bindField: 'accBind', macroOriginField: 'accMacroOrigin' },
  { bindField: 'resultBind', macroOriginField: 'resultMacroOrigin' },
] as const satisfies readonly ReduceMacroOriginBindingAnnotationSpec[];

export const REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS = [
  'bind',
  'countBind',
] as const satisfies readonly RemoveByPriorityMacroOriginGroupBindField[];
