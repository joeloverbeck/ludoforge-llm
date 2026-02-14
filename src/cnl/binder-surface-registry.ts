import type { EffectAST } from '../kernel/types.js';
import { SUPPORTED_EFFECT_KINDS, type SupportedEffectKind } from './effect-kind-registry.js';

type BinderPathSegment = string | '*';
type BinderPath = readonly BinderPathSegment[];

interface EffectBinderSurfaceDefinition {
  readonly declaredBinderPaths: readonly BinderPath[];
  readonly sequentiallyVisibleBinderPaths: readonly BinderPath[];
}

const NO_BINDER_PATHS: readonly BinderPath[] = [];

export const EFFECT_BINDER_SURFACES: Readonly<Record<SupportedEffectKind, EffectBinderSurfaceDefinition>> = {
  setVar: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  addVar: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  moveToken: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  moveAll: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  moveTokenAdjacent: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  draw: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  shuffle: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  createToken: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  destroyToken: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  setTokenProp: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  if: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  forEach: {
    declaredBinderPaths: [['bind'], ['countBind']],
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
  },
  removeByPriority: {
    declaredBinderPaths: [['groups', '*', 'bind'], ['groups', '*', 'countBind'], ['remainingBind']],
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
  },
  let: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
  },
  chooseOne: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
  },
  chooseN: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
  },
  rollRandom: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
  },
  setMarker: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
  shiftMarker: { declaredBinderPaths: NO_BINDER_PATHS, sequentiallyVisibleBinderPaths: NO_BINDER_PATHS },
};

export interface BinderDeclarationCandidate {
  readonly path: string;
  readonly value: unknown;
}

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

export function rewriteDeclaredBindersInEffectNode(
  effectNode: Record<string, unknown>,
  rewrite: (binding: string) => string,
): Record<string, unknown> {
  let changed = false;
  const rewritten = cloneDeep(effectNode) as Record<string, unknown>;
  for (const kind of SUPPORTED_EFFECT_KINDS) {
    const effectBody = rewritten[kind];
    if (!isRecord(effectBody)) {
      continue;
    }

    const binderPaths = EFFECT_BINDER_SURFACES[kind].declaredBinderPaths;
    for (const binderPath of binderPaths) {
      changed = rewriteStringLeavesAtPath(effectBody, binderPath, rewrite) || changed;
    }
  }
  return changed ? rewritten : effectNode;
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

    const candidates: BinderDeclarationCandidate[] = [];
    for (const path of EFFECT_BINDER_SURFACES[kind].sequentiallyVisibleBinderPaths) {
      collectPathValues(effectBody, path, kind, candidates);
    }
    for (const candidate of candidates) {
      if (typeof candidate.value === 'string') {
        bindings.push(candidate.value);
      }
    }
  }
  return bindings;
}

export const DECLARED_BINDER_EFFECT_KINDS: readonly SupportedEffectKind[] = SUPPORTED_EFFECT_KINDS.filter(
  (kind) => EFFECT_BINDER_SURFACES[kind].declaredBinderPaths.length > 0,
);
