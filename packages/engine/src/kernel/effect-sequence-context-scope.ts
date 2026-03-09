import type { EffectAST } from './types.js';

export interface EffectSequenceContextScope {
  readonly allowsPersistentSequenceContextGrants: boolean;
}

export interface NestedEffectSequenceContextScope {
  readonly effects: readonly EffectAST[];
  readonly pathSuffix: string;
  readonly scope: EffectSequenceContextScope;
}

export const ROOT_EFFECT_SEQUENCE_CONTEXT_SCOPE: EffectSequenceContextScope = Object.freeze({
  allowsPersistentSequenceContextGrants: true,
});

const NON_PERSISTENT_EFFECT_SEQUENCE_CONTEXT_SCOPE: EffectSequenceContextScope = Object.freeze({
  allowsPersistentSequenceContextGrants: false,
});

export const getNestedEffectSequenceContextScopes = (
  effect: EffectAST,
  parentScope: EffectSequenceContextScope,
): readonly NestedEffectSequenceContextScope[] => {
  if ('if' in effect) {
    return [
      {
        effects: effect.if.then,
        pathSuffix: '.if.then',
        scope: parentScope,
      },
      ...(effect.if.else === undefined
        ? []
        : [{
            effects: effect.if.else,
            pathSuffix: '.if.else',
            scope: parentScope,
          }]),
    ];
  }

  if ('let' in effect) {
    return [{
      effects: effect.let.in,
      pathSuffix: '.let.in',
      scope: parentScope,
    }];
  }

  if ('forEach' in effect) {
    return [
      {
        effects: effect.forEach.effects,
        pathSuffix: '.forEach.effects',
        scope: parentScope,
      },
      ...(effect.forEach.in === undefined
        ? []
        : [{
            effects: effect.forEach.in,
            pathSuffix: '.forEach.in',
            scope: parentScope,
          }]),
    ];
  }

  if ('reduce' in effect) {
    return [{
      effects: effect.reduce.in,
      pathSuffix: '.reduce.in',
      scope: parentScope,
    }];
  }

  if ('removeByPriority' in effect) {
    return effect.removeByPriority.in === undefined
      ? []
      : [{
          effects: effect.removeByPriority.in,
          pathSuffix: '.removeByPriority.in',
          scope: parentScope,
        }];
  }

  if ('evaluateSubset' in effect) {
    return [
      {
        effects: effect.evaluateSubset.compute,
        pathSuffix: '.evaluateSubset.compute',
        scope: NON_PERSISTENT_EFFECT_SEQUENCE_CONTEXT_SCOPE,
      },
      {
        effects: effect.evaluateSubset.in,
        pathSuffix: '.evaluateSubset.in',
        scope: parentScope,
      },
    ];
  }

  if ('rollRandom' in effect) {
    return [{
      effects: effect.rollRandom.in,
      pathSuffix: '.rollRandom.in',
      scope: parentScope,
    }];
  }

  return [];
};
