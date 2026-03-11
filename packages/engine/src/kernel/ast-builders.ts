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

// Named convenience builders for all 34 effect kinds:

export const setVar = (p: EffectPayload<'setVar'>) => buildEffect('setVar', p);
export const setActivePlayer = (p: EffectPayload<'setActivePlayer'>) => buildEffect('setActivePlayer', p);
export const addVar = (p: EffectPayload<'addVar'>) => buildEffect('addVar', p);
export const transferVar = (p: EffectPayload<'transferVar'>) => buildEffect('transferVar', p);
export const moveToken = (p: EffectPayload<'moveToken'>) => buildEffect('moveToken', p);
export const moveAll = (p: EffectPayload<'moveAll'>) => buildEffect('moveAll', p);
export const moveTokenAdjacent = (p: EffectPayload<'moveTokenAdjacent'>) => buildEffect('moveTokenAdjacent', p);
export const draw = (p: EffectPayload<'draw'>) => buildEffect('draw', p);
export const reveal = (p: EffectPayload<'reveal'>) => buildEffect('reveal', p);
export const conceal = (p: EffectPayload<'conceal'>) => buildEffect('conceal', p);
export const shuffle = (p: EffectPayload<'shuffle'>) => buildEffect('shuffle', p);
export const createToken = (p: EffectPayload<'createToken'>) => buildEffect('createToken', p);
export const destroyToken = (p: EffectPayload<'destroyToken'>) => buildEffect('destroyToken', p);
export const setTokenProp = (p: EffectPayload<'setTokenProp'>) => buildEffect('setTokenProp', p);
export const ifEffect = (p: EffectPayload<'if'>) => buildEffect('if', p);
export const forEach = (p: EffectPayload<'forEach'>) => buildEffect('forEach', p);
export const reduce = (p: EffectPayload<'reduce'>) => buildEffect('reduce', p);
export const removeByPriority = (p: EffectPayload<'removeByPriority'>) => buildEffect('removeByPriority', p);
export const letEffect = (p: EffectPayload<'let'>) => buildEffect('let', p);
export const bindValue = (p: EffectPayload<'bindValue'>) => buildEffect('bindValue', p);
export const evaluateSubset = (p: EffectPayload<'evaluateSubset'>) => buildEffect('evaluateSubset', p);
export const chooseOne = (p: EffectPayload<'chooseOne'>) => buildEffect('chooseOne', p);
export const chooseN = (p: EffectPayload<'chooseN'>) => buildEffect('chooseN', p);
export const rollRandom = (p: EffectPayload<'rollRandom'>) => buildEffect('rollRandom', p);
export const setMarker = (p: EffectPayload<'setMarker'>) => buildEffect('setMarker', p);
export const shiftMarker = (p: EffectPayload<'shiftMarker'>) => buildEffect('shiftMarker', p);
export const setGlobalMarker = (p: EffectPayload<'setGlobalMarker'>) => buildEffect('setGlobalMarker', p);
export const flipGlobalMarker = (p: EffectPayload<'flipGlobalMarker'>) => buildEffect('flipGlobalMarker', p);
export const shiftGlobalMarker = (p: EffectPayload<'shiftGlobalMarker'>) => buildEffect('shiftGlobalMarker', p);
export const grantFreeOperation = (p: EffectPayload<'grantFreeOperation'>) => buildEffect('grantFreeOperation', p);
export const gotoPhaseExact = (p: EffectPayload<'gotoPhaseExact'>) => buildEffect('gotoPhaseExact', p);
export const advancePhase = (p: EffectPayload<'advancePhase'>) => buildEffect('advancePhase', p);
export const pushInterruptPhase = (p: EffectPayload<'pushInterruptPhase'>) => buildEffect('pushInterruptPhase', p);
export const popInterruptPhase = (p: EffectPayload<'popInterruptPhase'>) => buildEffect('popInterruptPhase', p);
