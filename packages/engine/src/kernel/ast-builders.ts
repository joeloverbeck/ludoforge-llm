import type { EffectKind, EffectKindMap } from './types-ast.js';

/**
 * Extract the payload type for a given effect kind.
 * Each EffectKindMap entry is `{ readonly [K]: Payload }`, so we extract the value keyed by K.
 */
export type EffectPayload<K extends EffectKind> = K extends keyof EffectKindMap[K] ? EffectKindMap[K][K] : never;

/** Generic typed effect builder — compile-time exhaustiveness via EffectKindMap. */
export function buildEffect<K extends EffectKind>(kind: K, payload: EffectPayload<K>): EffectKindMap[K] {
  return { [kind]: payload } as unknown as EffectKindMap[K];
}

type EffectBuilder<K extends EffectKind> = (payload: EffectPayload<K>) => EffectKindMap[K];

// Named convenience builders for all 34 effect kinds:

export const setVar: EffectBuilder<'setVar'> = (p) => buildEffect('setVar', p);
export const setActivePlayer: EffectBuilder<'setActivePlayer'> = (p) => buildEffect('setActivePlayer', p);
export const addVar: EffectBuilder<'addVar'> = (p) => buildEffect('addVar', p);
export const transferVar: EffectBuilder<'transferVar'> = (p) => buildEffect('transferVar', p);
export const moveToken: EffectBuilder<'moveToken'> = (p) => buildEffect('moveToken', p);
export const moveAll: EffectBuilder<'moveAll'> = (p) => buildEffect('moveAll', p);
export const moveTokenAdjacent: EffectBuilder<'moveTokenAdjacent'> = (p) => buildEffect('moveTokenAdjacent', p);
export const draw: EffectBuilder<'draw'> = (p) => buildEffect('draw', p);
export const reveal: EffectBuilder<'reveal'> = (p) => buildEffect('reveal', p);
export const conceal: EffectBuilder<'conceal'> = (p) => buildEffect('conceal', p);
export const shuffle: EffectBuilder<'shuffle'> = (p) => buildEffect('shuffle', p);
export const createToken: EffectBuilder<'createToken'> = (p) => buildEffect('createToken', p);
export const destroyToken: EffectBuilder<'destroyToken'> = (p) => buildEffect('destroyToken', p);
export const setTokenProp: EffectBuilder<'setTokenProp'> = (p) => buildEffect('setTokenProp', p);
export const ifEffect: EffectBuilder<'if'> = (p) => buildEffect('if', p);
export const forEach: EffectBuilder<'forEach'> = (p) => buildEffect('forEach', p);
export const reduce: EffectBuilder<'reduce'> = (p) => buildEffect('reduce', p);
export const removeByPriority: EffectBuilder<'removeByPriority'> = (p) => buildEffect('removeByPriority', p);
export const letEffect: EffectBuilder<'let'> = (p) => buildEffect('let', p);
export const bindValue: EffectBuilder<'bindValue'> = (p) => buildEffect('bindValue', p);
export const evaluateSubset: EffectBuilder<'evaluateSubset'> = (p) => buildEffect('evaluateSubset', p);
export const chooseOne: EffectBuilder<'chooseOne'> = (p) => buildEffect('chooseOne', p);
export const chooseN: EffectBuilder<'chooseN'> = (p) => buildEffect('chooseN', p);
export const rollRandom: EffectBuilder<'rollRandom'> = (p) => buildEffect('rollRandom', p);
export const setMarker: EffectBuilder<'setMarker'> = (p) => buildEffect('setMarker', p);
export const shiftMarker: EffectBuilder<'shiftMarker'> = (p) => buildEffect('shiftMarker', p);
export const setGlobalMarker: EffectBuilder<'setGlobalMarker'> = (p) => buildEffect('setGlobalMarker', p);
export const flipGlobalMarker: EffectBuilder<'flipGlobalMarker'> = (p) => buildEffect('flipGlobalMarker', p);
export const shiftGlobalMarker: EffectBuilder<'shiftGlobalMarker'> = (p) => buildEffect('shiftGlobalMarker', p);
export const grantFreeOperation: EffectBuilder<'grantFreeOperation'> = (p) => buildEffect('grantFreeOperation', p);
export const gotoPhaseExact: EffectBuilder<'gotoPhaseExact'> = (p) => buildEffect('gotoPhaseExact', p);
export const advancePhase: EffectBuilder<'advancePhase'> = (p) => buildEffect('advancePhase', p);
export const pushInterruptPhase: EffectBuilder<'pushInterruptPhase'> = (p) => buildEffect('pushInterruptPhase', p);
export const popInterruptPhase: EffectBuilder<'popInterruptPhase'> = (p) => buildEffect('popInterruptPhase', p);
