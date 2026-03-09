import type { EffectAST } from './types.js';

export interface EffectSequenceContextScope {
  readonly allowsPersistentSequenceContextGrants: boolean;
}

export type NestedEffectSequenceContextTraversal =
  | { readonly kind: 'sequential'; readonly slot: 'let.in' | 'reduce.in' | 'removeByPriority.in' | 'evaluateSubset.compute' | 'evaluateSubset.in' | 'rollRandom.in' }
  | { readonly kind: 'alternative'; readonly branch: 'then' | 'else' }
  | { readonly kind: 'loop-body' }
  | { readonly kind: 'loop-continuation' };

export interface NestedEffectSequenceContextScope {
  readonly effects: readonly EffectAST[];
  readonly pathSuffix: string;
  readonly scope: EffectSequenceContextScope;
  readonly traversal: NestedEffectSequenceContextTraversal;
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
        traversal: { kind: 'alternative', branch: 'then' } as const,
      },
      ...(effect.if.else === undefined
        ? []
        : [{
            effects: effect.if.else,
            pathSuffix: '.if.else',
            scope: parentScope,
            traversal: { kind: 'alternative', branch: 'else' } as const,
          }]),
    ];
  }

  if ('let' in effect) {
    return [{
      effects: effect.let.in,
      pathSuffix: '.let.in',
      scope: parentScope,
      traversal: { kind: 'sequential', slot: 'let.in' } as const,
    }];
  }

  if ('forEach' in effect) {
    return [
      {
        effects: effect.forEach.effects,
        pathSuffix: '.forEach.effects',
        scope: parentScope,
        traversal: { kind: 'loop-body' } as const,
      },
      ...(effect.forEach.in === undefined
        ? []
        : [{
            effects: effect.forEach.in,
            pathSuffix: '.forEach.in',
            scope: parentScope,
            traversal: { kind: 'loop-continuation' } as const,
          }]),
    ];
  }

  if ('reduce' in effect) {
    return [{
      effects: effect.reduce.in,
      pathSuffix: '.reduce.in',
      scope: parentScope,
      traversal: { kind: 'sequential', slot: 'reduce.in' } as const,
    }];
  }

  if ('removeByPriority' in effect) {
    return effect.removeByPriority.in === undefined
      ? []
      : [{
          effects: effect.removeByPriority.in,
          pathSuffix: '.removeByPriority.in',
          scope: parentScope,
          traversal: { kind: 'sequential', slot: 'removeByPriority.in' } as const,
        }];
  }

  if ('evaluateSubset' in effect) {
    return [
      {
        effects: effect.evaluateSubset.compute,
        pathSuffix: '.evaluateSubset.compute',
        scope: NON_PERSISTENT_EFFECT_SEQUENCE_CONTEXT_SCOPE,
        traversal: { kind: 'sequential', slot: 'evaluateSubset.compute' } as const,
      },
      {
        effects: effect.evaluateSubset.in,
        pathSuffix: '.evaluateSubset.in',
        scope: parentScope,
        traversal: { kind: 'sequential', slot: 'evaluateSubset.in' } as const,
      },
    ];
  }

  if ('rollRandom' in effect) {
    return [{
      effects: effect.rollRandom.in,
      pathSuffix: '.rollRandom.in',
      scope: parentScope,
      traversal: { kind: 'sequential', slot: 'rollRandom.in' } as const,
    }];
  }

  return [];
};
