import type { EffectAST } from '../kernel/types.js';
import {
  EFFECT_BINDER_SURFACE_CONTRACT,
  NON_EFFECT_BINDER_SURFACE_CONTRACT,
  collectBinderPathCandidates,
  collectStringSitesAtBinderPath,
  rewriteStringLeavesAtBinderPath,
  type BinderPathStringSite,
  type BinderSurfacePaths,
  type EffectBinderSurfaceDefinition,
  type NonEffectBinderSurfaceDefinition,
} from '../contracts/index.js';
import { SUPPORTED_EFFECT_KINDS, type SupportedEffectKind } from './effect-kind-registry.js';

export const EFFECT_BINDER_SURFACES: Readonly<Record<SupportedEffectKind, EffectBinderSurfaceDefinition>> =
  EFFECT_BINDER_SURFACE_CONTRACT;

export interface BinderDeclarationCandidate {
  readonly path: string;
  readonly value: unknown;
}

export type StringSite = BinderPathStringSite;

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

export function collectDeclaredBinderCandidates(effectNode: Record<string, unknown>): readonly BinderDeclarationCandidate[] {
  const candidates: BinderDeclarationCandidate[] = [];
  for (const kind of SUPPORTED_EFFECT_KINDS) {
    const effectBody = effectNode[kind];
    if (!isRecord(effectBody)) {
      continue;
    }

    const binderPaths = EFFECT_BINDER_SURFACES[kind].declaredBinderPaths;
    for (const binderPath of binderPaths) {
      const declaredAtPath = collectBinderPathCandidates(effectBody, binderPath, kind);
      candidates.push(...declaredAtPath.map((candidate) => ({ path: candidate.path, value: candidate.value })));
    }
  }
  return candidates;
}

interface SurfaceTarget {
  readonly node: Record<string, unknown>;
  readonly surface: BinderSurfacePaths;
  readonly path: string;
}

type BinderSurfacePathGroupKind = 'declared' | 'bindingName' | 'bindingTemplate' | 'zoneSelector';

function forEachBinderSurfacePathGroup(
  surface: BinderSurfacePaths,
  visit: (pathGroupKind: BinderSurfacePathGroupKind, binderPath: readonly (string | '*')[]) => void,
): void {
  for (const binderPath of surface.declaredBinderPaths) {
    visit('declared', binderPath);
  }
  for (const binderPath of surface.bindingNameReferencerPaths) {
    visit('bindingName', binderPath);
  }
  for (const binderPath of surface.bindingTemplateReferencerPaths) {
    visit('bindingTemplate', binderPath);
  }
  for (const binderPath of surface.zoneSelectorReferencerPaths) {
    visit('zoneSelector', binderPath);
  }
}

function forEachSurfaceTarget(
  node: Record<string, unknown>,
  path: string,
  visit: (target: SurfaceTarget) => void,
): void {
  for (const kind of SUPPORTED_EFFECT_KINDS) {
    const effectBody = node[kind];
    if (!isRecord(effectBody)) {
      continue;
    }
    visit({
      node: effectBody,
      surface: EFFECT_BINDER_SURFACES[kind],
      path: `${path}.${kind}`,
    });
  }
  for (const surface of NON_EFFECT_BINDER_REFERENCER_SURFACES) {
    if (!surface.when(node)) {
      continue;
    }
    visit({
      node,
      surface,
      path,
    });
  }
}

function walkRecordTree(
  node: Record<string, unknown>,
  path: string,
  visit: (node: Record<string, unknown>, path: string) => void,
): void {
  visit(node, path);
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const entry = value[index];
        if (!isRecord(entry)) {
          continue;
        }
        walkRecordTree(entry, `${path}.${key}[${index}]`, visit);
      }
      continue;
    }
    if (isRecord(value)) {
      walkRecordTree(value, `${path}.${key}`, visit);
    }
  }
}

interface BinderSurfaceRewriters {
  readonly rewriteDeclaredBinder: (value: string) => string;
  readonly rewriteBindingName: (value: string) => string;
  readonly rewriteBindingTemplate: (value: string) => string;
  readonly rewriteZoneSelector: (value: string) => string;
}

function binderSurfacePathGroupRewriters(
  rewriters: BinderSurfaceRewriters,
): Readonly<Record<BinderSurfacePathGroupKind, (value: string) => string>> {
  return {
    declared: rewriters.rewriteDeclaredBinder,
    bindingName: rewriters.rewriteBindingName,
    bindingTemplate: rewriters.rewriteBindingTemplate,
    zoneSelector: rewriters.rewriteZoneSelector,
  };
}

export function rewriteBinderSurfaceStringsInNode(
  node: Record<string, unknown>,
  rewriters: BinderSurfaceRewriters,
): Record<string, unknown> {
  let changed = false;
  const rewritten = cloneDeep(node) as Record<string, unknown>;
  const rewriterByPathGroup = binderSurfacePathGroupRewriters(rewriters);

  walkRecordTree(rewritten, '', (currentNode, currentPath) => {
    forEachSurfaceTarget(currentNode, currentPath, (target) => {
      forEachBinderSurfacePathGroup(target.surface, (pathGroupKind, binderPath) => {
        changed = rewriteStringLeavesAtBinderPath(target.node, binderPath, rewriterByPathGroup[pathGroupKind]) || changed;
      });
    });
  });

  return changed ? rewritten : node;
}

export function collectBinderSurfaceStringSites(
  node: Record<string, unknown>,
  path: string,
  into: StringSite[],
): void {
  walkRecordTree(node, path, (currentNode, currentPath) => {
    forEachSurfaceTarget(currentNode, currentPath, (target) => {
      forEachBinderSurfacePathGroup(target.surface, (_pathGroupKind, binderPath) => {
        collectStringSitesAtBinderPath(target.node, binderPath, target.path, into);
      });
    });
  });
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
      const sequentialAtPath = collectBinderPathCandidates(effectBody, path, kind);
      candidates.push(...sequentialAtPath.map((candidate) => ({ path: candidate.path, value: candidate.value })));
    }
    for (const candidate of candidates) {
      if (typeof candidate.value === 'string') {
        bindings.push(candidate.value);
      }
    }

    for (const scopeDefinition of EFFECT_BINDER_SURFACES[kind].nestedSequentialBindingScopes ?? []) {
      const nestedScopeCandidates: BinderDeclarationCandidate[] = [];
      nestedScopeCandidates.push(
        ...collectBinderPathCandidates(effectBody, scopeDefinition.nestedEffectsPath, kind).map((candidate) => ({
          path: candidate.path,
          value: candidate.value,
        })),
      );

      const excluded = new Set<string>();
      for (const excludedPath of scopeDefinition.excludedBinderPaths) {
        const excludedCandidates: BinderDeclarationCandidate[] = [];
        excludedCandidates.push(
          ...collectBinderPathCandidates(effectBody, excludedPath, kind).map((candidate) => ({
            path: candidate.path,
            value: candidate.value,
          })),
        );
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
