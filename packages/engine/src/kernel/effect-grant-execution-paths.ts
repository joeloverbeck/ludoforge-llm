import {
  getNestedEffectSequenceContextScopes,
  ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE,
  type EffectSequenceContextScope,
} from './effect-sequence-context-scope.js';
import {
  collectSequenceContextLinkageGrantReference,
  type SequenceContextLinkageGrantReference,
} from './sequence-context-linkage-grant-reference.js';
import type { EffectAST } from './types.js';

type GrantFreeOperationEffect = Extract<
  EffectAST,
  { readonly grantFreeOperation: unknown }
>['grantFreeOperation'];

type SequenceContextLinkagePathState = readonly SequenceContextLinkageGrantReference[];
type EffectGrantExecutionPathCollector<TGrant> = (
  grant: GrantFreeOperationEffect,
  path: string,
) => TGrant | null;

const dedupeExecutionPaths = <TGrant>(
  paths: readonly (readonly TGrant[])[],
): readonly (readonly TGrant[])[] => {
  const unique = new Map<string, readonly TGrant[]>();
  paths.forEach((path) => {
    unique.set(JSON.stringify(path), path);
  });
  return [...unique.values()];
};

const effectArrayContainsCollectedGrant = <TGrant>(
  effects: readonly EffectAST[],
  collectGrant: EffectGrantExecutionPathCollector<TGrant>,
): boolean => effects.some((effect) => effectContainsCollectedGrant(
  effect,
  ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE,
  collectGrant,
));

const effectContainsCollectedGrant = <TGrant>(
  effect: EffectAST,
  scope: EffectSequenceContextScope,
  collectGrant: EffectGrantExecutionPathCollector<TGrant>,
): boolean => {
  if ('grantFreeOperation' in effect) {
    return scope.allowsPersistentSequenceContextGrants
      && collectGrant(effect.grantFreeOperation, '') !== null;
  }

  return getNestedEffectSequenceContextScopes(effect, scope).some((nestedScope) =>
    nestedScope.effects.some((entry) => effectContainsCollectedGrant(entry, nestedScope.scope, collectGrant)));
};

const appendCollectedGrant = <TGrant>(
  paths: readonly (readonly TGrant[])[],
  grant: TGrant,
): readonly (readonly TGrant[])[] => paths.map((path) => [...path, grant]);

const walkEffectArrayExecutionPaths = <TGrant>(
  effects: readonly EffectAST[],
  path: string,
  incoming: readonly (readonly TGrant[])[],
  scope: EffectSequenceContextScope,
  collectGrant: EffectGrantExecutionPathCollector<TGrant>,
): readonly (readonly TGrant[])[] => {
  let current = incoming;
  effects.forEach((effect, index) => {
    current = walkEffectExecutionPaths(effect, `${path}[${index}]`, current, scope, collectGrant);
  });
  return current;
};

const walkEffectExecutionPaths = <TGrant>(
  effect: EffectAST,
  path: string,
  incoming: readonly (readonly TGrant[])[],
  scope: EffectSequenceContextScope,
  collectGrant: EffectGrantExecutionPathCollector<TGrant>,
): readonly (readonly TGrant[])[] => {
  if ('grantFreeOperation' in effect) {
    if (!scope.allowsPersistentSequenceContextGrants) {
      return incoming;
    }
    const grant = collectGrant(
      effect.grantFreeOperation,
      `${path}.grantFreeOperation`,
    );
    return grant === null ? incoming : appendCollectedGrant(incoming, grant);
  }

  if ('if' in effect) {
    const nestedScopes = getNestedEffectSequenceContextScopes(effect, scope);
    const thenScope = nestedScopes.find((nestedScope) =>
      nestedScope.traversal.kind === 'alternative' && nestedScope.traversal.branch === 'then');
    const elseScope = nestedScopes.find((nestedScope) =>
      nestedScope.traversal.kind === 'alternative' && nestedScope.traversal.branch === 'else');
    const thenPaths = thenScope === undefined
      ? incoming
      : walkEffectArrayExecutionPaths(
          thenScope.effects,
          `${path}${thenScope.pathSuffix}`,
          incoming,
          thenScope.scope,
          collectGrant,
        );
    const elsePaths = elseScope === undefined
      ? incoming
      : walkEffectArrayExecutionPaths(
          elseScope.effects,
          `${path}${elseScope.pathSuffix}`,
          incoming,
          elseScope.scope,
          collectGrant,
        );
    return [...thenPaths, ...elsePaths];
  }

  if ('forEach' in effect) {
    const nestedScopes = getNestedEffectSequenceContextScopes(effect, scope);
    const loopBodyScope = nestedScopes.find((nestedScope) => nestedScope.traversal.kind === 'loop-body');
    const continuationScope = nestedScopes.find((nestedScope) => nestedScope.traversal.kind === 'loop-continuation');
    const loopBodyPaths = loopBodyScope === undefined
      ? incoming
      : walkEffectArrayExecutionPaths(
          loopBodyScope.effects,
          `${path}${loopBodyScope.pathSuffix}`,
          incoming,
          loopBodyScope.scope,
          collectGrant,
        );
    const continuationIncoming = dedupeExecutionPaths([...incoming, ...loopBodyPaths]);
    if (effect.forEach.countBind === undefined || continuationScope === undefined) {
      return continuationIncoming;
    }
    return walkEffectArrayExecutionPaths(
      continuationScope.effects,
      `${path}${continuationScope.pathSuffix}`,
      continuationIncoming,
      continuationScope.scope,
      collectGrant,
    );
  }

  const nestedScopes = getNestedEffectSequenceContextScopes(effect, scope);
  if (nestedScopes.length > 0) {
    let current = incoming;
    nestedScopes
      .filter((nestedScope) => nestedScope.traversal.kind === 'sequential')
      .forEach((nestedScope) => {
      current = walkEffectArrayExecutionPaths(
        nestedScope.effects,
        `${path}${nestedScope.pathSuffix}`,
        current,
        nestedScope.scope,
        collectGrant,
      );
      });
    return current;
  }

  return incoming;
};

export const collectEffectGrantExecutionPaths = <TGrant>(
  effects: readonly EffectAST[],
  path: string,
  collectGrant: EffectGrantExecutionPathCollector<TGrant>,
): readonly (readonly TGrant[])[] =>
  effectArrayContainsCollectedGrant(effects, collectGrant)
    ? walkEffectArrayExecutionPaths(effects, path, [[]], ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE, collectGrant)
    : [[]];

export const collectEffectGrantSequenceContextExecutionPaths = (
  effects: readonly EffectAST[],
  path: string,
): readonly SequenceContextLinkagePathState[] =>
  collectEffectGrantExecutionPaths(
    effects,
    path,
    collectSequenceContextLinkageGrantReference,
  );
