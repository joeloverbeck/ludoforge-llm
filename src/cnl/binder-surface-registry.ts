import type { EffectAST } from '../kernel/types.js';
import { SUPPORTED_EFFECT_KINDS, type SupportedEffectKind } from './effect-kind-registry.js';

type BinderPathSegment = string | '*';
type BinderPath = readonly BinderPathSegment[];

interface SequentialBindingScopeDefinition {
  readonly nestedEffectsPath: BinderPath;
  readonly excludedBinderPaths: readonly BinderPath[];
}

interface EffectBinderSurfaceDefinition {
  readonly declaredBinderPaths: readonly BinderPath[];
  readonly sequentiallyVisibleBinderPaths: readonly BinderPath[];
  readonly nestedSequentialBindingScopes?: readonly SequentialBindingScopeDefinition[];
  readonly bindingNameReferencerPaths: readonly BinderPath[];
  readonly bindingTemplateReferencerPaths: readonly BinderPath[];
  readonly zoneSelectorReferencerPaths: readonly BinderPath[];
}

const NO_BINDER_PATHS: readonly BinderPath[] = [];
const NO_REFERENCER_PATHS: readonly BinderPath[] = [];
const BINDING_NAME_PATH: readonly BinderPath[] = [['name']];
const AGGREGATE_BIND_PATH: readonly BinderPath[] = [['aggregate', 'bind']];
const PLAYER_CHOSEN_PATH: readonly BinderPath[] = [['player', 'chosen']];
const FILTER_OWNER_CHOSEN_PATH: readonly BinderPath[] = [['filter', 'owner', 'chosen']];
const ZONE_PATH: readonly BinderPath[] = [['zone']];
const SPACE_PATH: readonly BinderPath[] = [['space']];
const TOKEN_PATH: readonly BinderPath[] = [['token']];
const LEFT_RIGHT_PATHS: readonly BinderPath[] = [['left'], ['right']];
const FROM_TO_PATHS: readonly BinderPath[] = [['from'], ['to']];

export const EFFECT_BINDER_SURFACES: Readonly<Record<SupportedEffectKind, EffectBinderSurfaceDefinition>> = {
  setVar: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['player', 'chosen']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  setActivePlayer: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['player', 'chosen']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  addVar: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['player', 'chosen']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  commitResource: {
    declaredBinderPaths: [['actualBind']],
    sequentiallyVisibleBinderPaths: [['actualBind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['from', 'player', 'chosen'], ['to', 'player', 'chosen']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  moveToken: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['token']],
    zoneSelectorReferencerPaths: [['from'], ['to']],
  },
  moveAll: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['from'], ['to']],
  },
  moveTokenAdjacent: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['token'], ['direction']],
    zoneSelectorReferencerPaths: [['from']],
  },
  draw: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['from'], ['to']],
  },
  reveal: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['to', 'chosen']],
    zoneSelectorReferencerPaths: [['zone']],
  },
  shuffle: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['zone']],
  },
  createToken: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['zone']],
  },
  destroyToken: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['token']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  setTokenProp: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: [['token']],
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  if: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  forEach: {
    declaredBinderPaths: [['bind'], ['countBind']],
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  reduce: {
    declaredBinderPaths: [['itemBind'], ['accBind'], ['resultBind']],
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    nestedSequentialBindingScopes: [{ nestedEffectsPath: ['in'], excludedBinderPaths: [['resultBind']] }],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  removeByPriority: {
    declaredBinderPaths: [['groups', '*', 'bind'], ['groups', '*', 'countBind'], ['remainingBind']],
    sequentiallyVisibleBinderPaths: [['groups', '*', 'countBind'], ['remainingBind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['groups', '*', 'to'], ['groups', '*', 'from']],
  },
  let: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    nestedSequentialBindingScopes: [{ nestedEffectsPath: ['in'], excludedBinderPaths: [['bind']] }],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  bindValue: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  evaluateSubset: {
    declaredBinderPaths: [['subsetBind'], ['resultBind'], ['bestSubsetBind']],
    sequentiallyVisibleBinderPaths: [['resultBind'], ['bestSubsetBind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  chooseOne: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  chooseN: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  rollRandom: {
    declaredBinderPaths: [['bind']],
    sequentiallyVisibleBinderPaths: [['bind']],
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  setMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['space']],
  },
  shiftMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: [['space']],
  },
  setGlobalMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  flipGlobalMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  shiftGlobalMarker: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  grantFreeOperation: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  gotoPhaseExact: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  advancePhase: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  pushInterruptPhase: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  popInterruptPhase: {
    declaredBinderPaths: NO_BINDER_PATHS,
    sequentiallyVisibleBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
};

export interface BinderDeclarationCandidate {
  readonly path: string;
  readonly value: unknown;
}

export interface StringSite {
  readonly path: string;
  readonly value: string;
}

interface ConditionalReferencerSurfaceDefinition {
  readonly when: (node: Record<string, unknown>) => boolean;
  readonly declaredBinderPaths: readonly BinderPath[];
  readonly bindingNameReferencerPaths: readonly BinderPath[];
  readonly bindingTemplateReferencerPaths: readonly BinderPath[];
  readonly zoneSelectorReferencerPaths: readonly BinderPath[];
}

interface BinderSurfacePaths {
  readonly declaredBinderPaths: readonly BinderPath[];
  readonly bindingNameReferencerPaths: readonly BinderPath[];
  readonly bindingTemplateReferencerPaths: readonly BinderPath[];
  readonly zoneSelectorReferencerPaths: readonly BinderPath[];
}

function isDiscriminator(node: Record<string, unknown>, key: string, expected: string): boolean {
  return node[key] === expected;
}

function isOneOfDiscriminator(node: Record<string, unknown>, key: string, expected: readonly string[]): boolean {
  const value = node[key];
  return typeof value === 'string' && expected.includes(value);
}

export const NON_EFFECT_BINDER_REFERENCER_SURFACES: readonly ConditionalReferencerSurfaceDefinition[] = [
  {
    when: (node) => isDiscriminator(node, 'ref', 'binding'),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: BINDING_NAME_PATH,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    when: (node) => isDiscriminator(node, 'query', 'binding'),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: BINDING_NAME_PATH,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    when: (node) => isRecord(node.aggregate),
    declaredBinderPaths: AGGREGATE_BIND_PATH,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    when: (node) => isOneOfDiscriminator(node, 'ref', ['tokenProp', 'tokenZone']),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: TOKEN_PATH,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    when: (node) => isDiscriminator(node, 'ref', 'pvar') && isRecord(node.player),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: PLAYER_CHOSEN_PATH,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    when: (node) => isOneOfDiscriminator(node, 'ref', ['zoneCount', 'zoneProp']),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: ZONE_PATH,
  },
  {
    when: (node) => isDiscriminator(node, 'ref', 'markerState'),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: SPACE_PATH,
  },
  {
    when: (node) => isOneOfDiscriminator(node, 'query', ['tokensInZone', 'tokensInAdjacentZones', 'adjacentZones', 'connectedZones']),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: ZONE_PATH,
  },
  {
    when: (node) => isOneOfDiscriminator(node, 'query', ['zones', 'mapSpaces']),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: FILTER_OWNER_CHOSEN_PATH,
    zoneSelectorReferencerPaths: NO_REFERENCER_PATHS,
  },
  {
    when: (node) => isDiscriminator(node, 'op', 'adjacent'),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: LEFT_RIGHT_PATHS,
  },
  {
    when: (node) => isDiscriminator(node, 'op', 'connected'),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: FROM_TO_PATHS,
  },
  {
    when: (node) => isDiscriminator(node, 'op', 'zonePropIncludes'),
    declaredBinderPaths: NO_BINDER_PATHS,
    bindingNameReferencerPaths: NO_REFERENCER_PATHS,
    bindingTemplateReferencerPaths: NO_REFERENCER_PATHS,
    zoneSelectorReferencerPaths: ZONE_PATH,
  },
];

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

export const DECLARED_BINDER_EFFECT_KINDS: readonly SupportedEffectKind[] = SUPPORTED_EFFECT_KINDS.filter(
  (kind) => EFFECT_BINDER_SURFACES[kind].declaredBinderPaths.length > 0,
);
