import type { FreeOperationSequenceContextGrantLike } from './free-operation-sequence-context-contract.js';
import {
  getNestedEffectSequenceContextScopes,
  ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE,
  type EffectSequenceContextScope,
} from './effect-sequence-context-scope.js';
import type { EffectAST } from './types.js';

export interface SequenceContextLinkageGrantReference {
  readonly chain: string;
  readonly step: number;
  readonly path: string;
  readonly captureKey?: string;
  readonly requireKey?: string;
}

type SequenceContextLinkagePathState = readonly SequenceContextLinkageGrantReference[];

const dedupeExecutionPaths = (
  paths: readonly SequenceContextLinkagePathState[],
): readonly SequenceContextLinkagePathState[] => {
  const unique = new Map<string, SequenceContextLinkagePathState>();
  paths.forEach((path) => {
    unique.set(JSON.stringify(path), path);
  });
  return [...unique.values()];
};

const effectArrayContainsSequenceContextGrant = (effects: readonly EffectAST[]): boolean =>
  effects.some((effect) => effectContainsSequenceContextGrant(effect, ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE));

const effectContainsSequenceContextGrant = (effect: EffectAST, scope: EffectSequenceContextScope): boolean => {
  if ('grantFreeOperation' in effect) {
    return scope.allowsPersistentSequenceContextGrants
      && collectSequenceContextLinkageGrantReference(effect.grantFreeOperation, '') !== null;
  }

  return getNestedEffectSequenceContextScopes(effect, scope).some((nestedScope) =>
    nestedScope.effects.some((entry) => effectContainsSequenceContextGrant(entry, nestedScope.scope)));
};

const collectSequenceContextLinkageGrantReference = (
  grant: FreeOperationSequenceContextGrantLike,
  path: string,
): SequenceContextLinkageGrantReference | null => {
  const sequence = grant.sequence;
  const sequenceContext = grant.sequenceContext;
  if (
    sequence === undefined
    || sequenceContext === undefined
    || typeof sequence.chain !== 'string'
  ) {
    return null;
  }

  const step = sequence.step;
  if (typeof step !== 'number' || !Number.isSafeInteger(step) || step < 0) {
    return null;
  }

  const captureKey =
    typeof sequenceContext.captureMoveZoneCandidatesAs === 'string'
      ? sequenceContext.captureMoveZoneCandidatesAs
      : undefined;
  const requireKey =
    typeof sequenceContext.requireMoveZoneCandidatesFrom === 'string'
      ? sequenceContext.requireMoveZoneCandidatesFrom
      : undefined;
  if (captureKey === undefined && requireKey === undefined) {
    return null;
  }

  return {
    chain: sequence.chain,
    step,
    path,
    ...(captureKey === undefined ? {} : { captureKey }),
    ...(requireKey === undefined ? {} : { requireKey }),
  };
};

const appendGrantReference = (
  paths: readonly SequenceContextLinkagePathState[],
  reference: SequenceContextLinkageGrantReference,
): readonly SequenceContextLinkagePathState[] => paths.map((path) => [...path, reference]);

const walkEffectArrayExecutionPaths = (
  effects: readonly EffectAST[],
  path: string,
  incoming: readonly SequenceContextLinkagePathState[],
  scope: EffectSequenceContextScope,
): readonly SequenceContextLinkagePathState[] => {
  let current = incoming;
  effects.forEach((effect, index) => {
    current = walkEffectExecutionPaths(effect, `${path}[${index}]`, current, scope);
  });
  return current;
};

const walkEffectExecutionPaths = (
  effect: EffectAST,
  path: string,
  incoming: readonly SequenceContextLinkagePathState[],
  scope: EffectSequenceContextScope,
): readonly SequenceContextLinkagePathState[] => {
  if ('grantFreeOperation' in effect) {
    if (!scope.allowsPersistentSequenceContextGrants) {
      return incoming;
    }
    const reference = collectSequenceContextLinkageGrantReference(
      effect.grantFreeOperation,
      `${path}.grantFreeOperation`,
    );
    return reference === null ? incoming : appendGrantReference(incoming, reference);
  }

  if ('if' in effect) {
    const nestedScopes = getNestedEffectSequenceContextScopes(effect, scope);
    const thenScope = nestedScopes.find((nestedScope) => nestedScope.pathSuffix === '.if.then');
    const elseScope = nestedScopes.find((nestedScope) => nestedScope.pathSuffix === '.if.else');
    const thenPaths = thenScope === undefined
      ? incoming
      : walkEffectArrayExecutionPaths(thenScope.effects, `${path}${thenScope.pathSuffix}`, incoming, thenScope.scope);
    const elsePaths = elseScope === undefined
      ? incoming
      : walkEffectArrayExecutionPaths(elseScope.effects, `${path}${elseScope.pathSuffix}`, incoming, elseScope.scope);
    return [...thenPaths, ...elsePaths];
  }

  if ('forEach' in effect) {
    const nestedScopes = getNestedEffectSequenceContextScopes(effect, scope);
    const loopBodyScope = nestedScopes.find((nestedScope) => nestedScope.pathSuffix === '.forEach.effects');
    const continuationScope = nestedScopes.find((nestedScope) => nestedScope.pathSuffix === '.forEach.in');
    const loopBodyPaths = loopBodyScope === undefined
      ? incoming
      : walkEffectArrayExecutionPaths(
          loopBodyScope.effects,
          `${path}${loopBodyScope.pathSuffix}`,
          incoming,
          loopBodyScope.scope,
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
    );
  }

  const nestedScopes = getNestedEffectSequenceContextScopes(effect, scope);
  if (nestedScopes.length > 0) {
    let current = incoming;
    nestedScopes.forEach((nestedScope) => {
      current = walkEffectArrayExecutionPaths(
        nestedScope.effects,
        `${path}${nestedScope.pathSuffix}`,
        current,
        nestedScope.scope,
      );
    });
    return current;
  }

  return incoming;
};

export const collectEffectGrantSequenceContextExecutionPaths = (
  effects: readonly EffectAST[],
  path: string,
): readonly SequenceContextLinkagePathState[] =>
  effectArrayContainsSequenceContextGrant(effects)
    ? walkEffectArrayExecutionPaths(effects, path, [[]], ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE)
    : [[]];
