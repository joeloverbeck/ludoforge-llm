import type { FreeOperationSequenceContextGrantLike } from './free-operation-sequence-context-contract.js';
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
  effects.some((effect) => effectContainsSequenceContextGrant(effect));

const effectContainsSequenceContextGrant = (effect: EffectAST): boolean => {
  if ('grantFreeOperation' in effect) {
    return collectSequenceContextLinkageGrantReference(effect.grantFreeOperation, '') !== null;
  }

  if ('if' in effect) {
    return effectArrayContainsSequenceContextGrant(effect.if.then)
      || (effect.if.else !== undefined && effectArrayContainsSequenceContextGrant(effect.if.else));
  }

  if ('let' in effect) {
    return effectArrayContainsSequenceContextGrant(effect.let.in);
  }

  if ('forEach' in effect) {
    return effectArrayContainsSequenceContextGrant(effect.forEach.effects)
      || (effect.forEach.in !== undefined && effectArrayContainsSequenceContextGrant(effect.forEach.in));
  }

  if ('reduce' in effect) {
    return effectArrayContainsSequenceContextGrant(effect.reduce.in);
  }

  if ('removeByPriority' in effect) {
    return effect.removeByPriority.in !== undefined
      && effectArrayContainsSequenceContextGrant(effect.removeByPriority.in);
  }

  if ('evaluateSubset' in effect) {
    return effectArrayContainsSequenceContextGrant(effect.evaluateSubset.in);
  }

  if ('rollRandom' in effect) {
    return effectArrayContainsSequenceContextGrant(effect.rollRandom.in);
  }

  return false;
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
): readonly SequenceContextLinkagePathState[] => {
  let current = incoming;
  effects.forEach((effect, index) => {
    current = walkEffectExecutionPaths(effect, `${path}[${index}]`, current);
  });
  return current;
};

const walkEffectExecutionPaths = (
  effect: EffectAST,
  path: string,
  incoming: readonly SequenceContextLinkagePathState[],
): readonly SequenceContextLinkagePathState[] => {
  if ('grantFreeOperation' in effect) {
    const reference = collectSequenceContextLinkageGrantReference(
      effect.grantFreeOperation,
      `${path}.grantFreeOperation`,
    );
    return reference === null ? incoming : appendGrantReference(incoming, reference);
  }

  if ('if' in effect) {
    const thenPaths = walkEffectArrayExecutionPaths(effect.if.then, `${path}.if.then`, incoming);
    const elsePaths = effect.if.else === undefined
      ? incoming
      : walkEffectArrayExecutionPaths(effect.if.else, `${path}.if.else`, incoming);
    return [...thenPaths, ...elsePaths];
  }

  if ('let' in effect) {
    return walkEffectArrayExecutionPaths(effect.let.in, `${path}.let.in`, incoming);
  }

  if ('reduce' in effect) {
    return walkEffectArrayExecutionPaths(effect.reduce.in, `${path}.reduce.in`, incoming);
  }

  if ('removeByPriority' in effect) {
    return effect.removeByPriority.in === undefined
      ? incoming
      : walkEffectArrayExecutionPaths(effect.removeByPriority.in, `${path}.removeByPriority.in`, incoming);
  }

  if ('rollRandom' in effect) {
    return walkEffectArrayExecutionPaths(effect.rollRandom.in, `${path}.rollRandom.in`, incoming);
  }

  if ('forEach' in effect) {
    const loopBodyPaths = walkEffectArrayExecutionPaths(effect.forEach.effects, `${path}.forEach.effects`, incoming);
    const continuationIncoming = dedupeExecutionPaths([...incoming, ...loopBodyPaths]);
    if (effect.forEach.countBind === undefined || effect.forEach.in === undefined) {
      return continuationIncoming;
    }
    return walkEffectArrayExecutionPaths(effect.forEach.in, `${path}.forEach.in`, continuationIncoming);
  }

  if ('evaluateSubset' in effect) {
    return walkEffectArrayExecutionPaths(effect.evaluateSubset.in, `${path}.evaluateSubset.in`, incoming);
  }

  return incoming;
};

export const collectEffectGrantSequenceContextExecutionPaths = (
  effects: readonly EffectAST[],
  path: string,
): readonly SequenceContextLinkagePathState[] =>
  effectArrayContainsSequenceContextGrant(effects)
    ? walkEffectArrayExecutionPaths(effects, path, [[]])
    : [[]];
