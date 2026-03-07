import { asTokenId } from './branded.js';
import { evalCondition } from './eval-condition.js';
import { evalValue } from './eval-value.js';
import { emitTrace } from './execution-collector.js';
import { nextInt } from './prng.js';
import { resolveZoneWithNormalization, selectorResolutionFailurePolicyForMode } from './selector-resolution-normalization.js';
import { checkStackingConstraints } from './stacking.js';
import { EffectRuntimeError, effectRuntimeError } from './effect-error.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { resolveRuntimeTokenBindingValue } from './token-binding.js';
import { getTokenStateIndexEntry } from './token-state-index.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, Rng, Token } from './types.js';

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

const enforceStacking = (ctx: EffectContext, zoneId: string, zoneContentsAfter: readonly Token[], effectType: string): void => {
  const constraints = ctx.def.stackingConstraints;
  if (constraints === undefined || constraints.length === 0) {
    return;
  }

  const tokenTypeSeatById = new Map<string, string>();
  for (const tokenType of ctx.def.tokenTypes) {
    if (typeof tokenType.seat === 'string') {
      tokenTypeSeatById.set(tokenType.id, tokenType.seat);
    }
  }
  const seatFilteredConstraints = constraints.filter(
    (constraint) => (constraint.pieceFilter.seats?.length ?? 0) > 0,
  );
  if (seatFilteredConstraints.length > 0) {
    const requiredTokenTypeIds = new Set<string>();
    const allTokenTypeIds = ctx.def.tokenTypes.map((tokenType) => tokenType.id);
    for (const constraint of seatFilteredConstraints) {
      const scopedPieceTypeIds = constraint.pieceFilter.pieceTypeIds;
      if (scopedPieceTypeIds !== undefined && scopedPieceTypeIds.length > 0) {
        for (const pieceTypeId of scopedPieceTypeIds) {
          requiredTokenTypeIds.add(pieceTypeId);
        }
      } else {
        for (const tokenTypeId of allTokenTypeIds) {
          requiredTokenTypeIds.add(tokenTypeId);
        }
      }
    }
    const missingSeatTokenTypes = [...requiredTokenTypeIds]
      .filter((tokenTypeId) => !tokenTypeSeatById.has(tokenTypeId))
      .sort((left, right) => left.localeCompare(right));
    if (missingSeatTokenTypes.length > 0) {
      throw effectRuntimeError(
        EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
        'Stacking constraint seat filters require canonical tokenType.seat mapping.',
        {
          effectType,
          zoneId,
          missingTokenTypeSeats: missingSeatTokenTypes,
        },
      );
    }
  }
  const violations = checkStackingConstraints(
    constraints,
    ctx.def.zones,
    zoneId,
    zoneContentsAfter,
    tokenTypeSeatById,
  );
  if (violations.length > 0) {
    const first = violations[0]!;
    throw new EffectRuntimeError('STACKING_VIOLATION', `Stacking violation: constraint "${first.constraintId}" (${first.description})`, {
      effectType,
      zoneId,
      constraintId: first.constraintId,
      rule: first.rule,
      matchingCount: first.matchingCount,
      ...(first.maxCount !== undefined ? { maxCount: first.maxCount } : {}),
    });
  }
};

const resolveZoneTokens = (
  ctx: EffectContext,
  zoneId: string,
  effectType: 'moveToken' | 'moveAll' | 'draw' | 'shuffle' | 'createToken',
  field: 'from' | 'to' | 'zone',
): readonly Token[] => {
  const zoneTokens = ctx.state.zones[zoneId];
  if (zoneTokens === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Zone state not found for selector result: ${zoneId}`, {
      effectType,
      field,
      zoneId,
      availableZoneIds: Object.keys(ctx.state.zones).sort(),
    });
  }

  return zoneTokens;
};

const resolveBoundTokenId = (ctx: EffectContext, tokenBinding: string, effectType: 'moveToken' | 'destroyToken' | 'setTokenProp'): string => {
  const bindings = resolveEffectBindings(ctx);
  const boundValue = bindings[tokenBinding];
  if (boundValue === undefined) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Token binding not found: ${tokenBinding}`, {
      effectType,
      tokenBinding,
      availableBindings: Object.keys(bindings).sort(),
    });
  }

  const resolved = resolveRuntimeTokenBindingValue(boundValue);
  if (resolved !== null) {
    return resolved.tokenId;
  }

  throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Token binding ${tokenBinding} must resolve to Token or TokenId`, {
    effectType,
    tokenBinding,
    actualType: typeof boundValue,
    value: boundValue,
  });
};

interface TokenOccurrence {
  readonly zoneId: string;
  readonly index: number;
  readonly token: Token;
}

const resolveTokenOccurrence = (ctx: EffectContext, tokenId: string): {
  readonly occurrence: TokenOccurrence | null;
  readonly occurrenceCount: number;
  readonly occurrenceZoneIds: readonly string[];
} => {
  const tokenState = getTokenStateIndexEntry(ctx.state, tokenId);
  if (tokenState === undefined) {
    return { occurrence: null, occurrenceCount: 0, occurrenceZoneIds: [] };
  }

  return {
    occurrence: {
      zoneId: tokenState.zoneId,
      index: tokenState.index,
      token: tokenState.token,
    },
    occurrenceCount: tokenState.occurrenceCount,
    occurrenceZoneIds: tokenState.occurrenceZoneIds,
  };
};

const resolveMoveTokenAdjacentDestination = (
  direction: string | undefined,
  ctx: EffectContext,
): string => {
  if (direction === undefined) {
    throw new EffectRuntimeError('SPATIAL_DESTINATION_REQUIRED', 'moveTokenAdjacent.direction is required', {
      effectType: 'moveTokenAdjacent',
      availableBindings: Object.keys(resolveEffectBindings(ctx)).sort(),
    });
  }

  if (!direction.startsWith('$')) {
    return direction;
  }

  const bindings = resolveEffectBindings(ctx);
  const boundDestination = bindings[direction];
  if (boundDestination === undefined) {
    throw new EffectRuntimeError('SPATIAL_DESTINATION_REQUIRED', `moveTokenAdjacent destination binding not found: ${direction}`, {
      effectType: 'moveTokenAdjacent',
      direction,
      availableBindings: Object.keys(bindings).sort(),
    });
  }

  if (typeof boundDestination !== 'string') {
    throw effectRuntimeError(
      EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
      `moveTokenAdjacent destination binding ${direction} must resolve to ZoneId string`,
      {
        effectType: 'moveTokenAdjacent',
        direction,
        actualType: typeof boundDestination,
        value: boundDestination,
      },
    );
  }

  return boundDestination;
};

export const applyMoveToken = (effect: Extract<EffectAST, { readonly moveToken: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(evalCtx.mode);
  const fromZone = resolveZoneWithNormalization(effect.moveToken.from, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
    effectType: 'moveToken',
    scope: 'from',
    resolutionFailureMessage: 'moveToken.from zone resolution failed',
    onResolutionFailure,
  });
  const toZone = resolveZoneWithNormalization(effect.moveToken.to, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
    effectType: 'moveToken',
    scope: 'to',
    resolutionFailureMessage: 'moveToken.to zone resolution failed',
    onResolutionFailure,
  });
  const fromZoneId = String(fromZone);
  const toZoneId = String(toZone);
  const sourceTokens = resolveZoneTokens(ctx, fromZoneId, 'moveToken', 'from');
  const destinationTokens = resolveZoneTokens(ctx, toZoneId, 'moveToken', 'to');

  const tokenId = resolveBoundTokenId(ctx, effect.moveToken.token, 'moveToken');
  const resolvedOccurrence = resolveTokenOccurrence(ctx, tokenId);

  if (resolvedOccurrence.occurrenceCount === 0 || resolvedOccurrence.occurrence === null) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Token not found in any zone: ${tokenId}`, {
      effectType: 'moveToken',
      tokenId,
      fromZoneId,
    });
  }

  if (resolvedOccurrence.occurrenceCount > 1) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Token appears in multiple zones: ${tokenId}`, {
      effectType: 'moveToken',
      tokenId,
      zones: [...resolvedOccurrence.occurrenceZoneIds].sort(),
    });
  }

  const occurrence = resolvedOccurrence.occurrence;
  if (occurrence.zoneId !== fromZoneId) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Token is not in resolved from zone: ${tokenId}`, {
      effectType: 'moveToken',
      tokenId,
      expectedFrom: fromZoneId,
      actualZone: occurrence.zoneId,
    });
  }

  const sourceAfter = [...sourceTokens.slice(0, occurrence.index), ...sourceTokens.slice(occurrence.index + 1)];
  const destinationBase = fromZoneId === toZoneId ? sourceAfter : destinationTokens;
  const position = effect.moveToken.position ?? 'top';

  let insertionIndex = 0;
  let nextRng = ctx.rng;
  if (position === 'bottom') {
    insertionIndex = destinationBase.length;
  } else if (position === 'random') {
    if (destinationBase.length > 0) {
      const [randomIndex, advancedRng] = nextInt(ctx.rng, 0, destinationBase.length);
      insertionIndex = randomIndex;
      nextRng = advancedRng;
    }
  }

  const destinationAfter = [
    ...destinationBase.slice(0, insertionIndex),
    occurrence.token,
    ...destinationBase.slice(insertionIndex),
  ];

  enforceStacking(ctx, toZoneId, destinationAfter, 'moveToken');

  emitTrace(ctx.collector, {
    kind: 'moveToken',
    tokenId: String(tokenId),
    from: fromZoneId,
    to: toZoneId,
    provenance: resolveTraceProvenance(ctx),
  });

  if (fromZoneId === toZoneId) {
    return {
      state: {
        ...ctx.state,
        zones: {
          ...ctx.state.zones,
          [fromZoneId]: destinationAfter,
        },
      },
      rng: nextRng,
      emittedEvents: [],
    };
  }

  return {
    state: {
      ...ctx.state,
      zones: {
        ...ctx.state.zones,
        [fromZoneId]: sourceAfter,
        [toZoneId]: destinationAfter,
      },
    },
    rng: nextRng,
    emittedEvents: [{ type: 'tokenEntered', zone: toZone }],
  };
};

export const applyMoveTokenAdjacent = (
  effect: Extract<EffectAST, { readonly moveTokenAdjacent: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(evalCtx.mode);
  const fromZone = resolveZoneWithNormalization(effect.moveTokenAdjacent.from, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
    effectType: 'moveTokenAdjacent',
    scope: 'from',
    resolutionFailureMessage: 'moveTokenAdjacent.from zone resolution failed',
    onResolutionFailure,
  });
  const fromZoneId = String(fromZone);
  const toZoneId = resolveMoveTokenAdjacentDestination(effect.moveTokenAdjacent.direction, ctx);
  const adjacentZones = ctx.adjacencyGraph.neighbors[fromZoneId] ?? [];

  if (!adjacentZones.some((zoneId) => String(zoneId) === toZoneId)) {
    throw new EffectRuntimeError('SPATIAL_DESTINATION_NOT_ADJACENT', 'moveTokenAdjacent destination is not adjacent', {
      effectType: 'moveTokenAdjacent',
      fromZoneId,
      toZoneId,
      adjacentZones,
    });
  }

  return applyMoveToken(
    {
      moveToken: {
        token: effect.moveTokenAdjacent.token,
        from: effect.moveTokenAdjacent.from,
        to: toZoneId,
      },
    },
    ctx,
  );
};

export const applyCreateToken = (effect: Extract<EffectAST, { readonly createToken: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(evalCtx.mode);
  const zoneId = String(
    resolveZoneWithNormalization(effect.createToken.zone, evalCtx, {
      code: EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
      effectType: 'createToken',
      scope: 'zone',
      resolutionFailureMessage: 'createToken.zone resolution failed',
      onResolutionFailure,
    }),
  );
  const zoneTokens = resolveZoneTokens(ctx, zoneId, 'createToken', 'zone');

  const ordinal = ctx.state.nextTokenOrdinal;
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, 'nextTokenOrdinal must be a non-negative safe integer', {
      effectType: 'createToken',
      nextTokenOrdinal: ordinal,
    });
  }

  const evaluatedProps: Record<string, number | string | boolean> = {};
  if (effect.createToken.props !== undefined) {
    for (const [propName, valueExpr] of Object.entries(effect.createToken.props)) {
      evaluatedProps[propName] = evalValue(valueExpr, evalCtx);
    }
  }

  const createdToken: Token = {
    id: asTokenId(`tok_${effect.createToken.type}_${ordinal}`),
    type: effect.createToken.type,
    props: evaluatedProps,
  };

  const zoneAfterCreation = [createdToken, ...zoneTokens];
  enforceStacking(ctx, zoneId, zoneAfterCreation, 'createToken');
  emitTrace(ctx.collector, {
    kind: 'createToken',
    tokenId: String(createdToken.id),
    type: createdToken.type,
    zone: zoneId,
    provenance: resolveTraceProvenance(ctx),
  });

  return {
    state: {
      ...ctx.state,
      zones: {
        ...ctx.state.zones,
        [zoneId]: zoneAfterCreation,
      },
      nextTokenOrdinal: ordinal + 1,
    },
    rng: ctx.rng,
  };
};

export const applyDestroyToken = (effect: Extract<EffectAST, { readonly destroyToken: unknown }>, ctx: EffectContext): EffectResult => {
  const tokenId = resolveBoundTokenId(ctx, effect.destroyToken.token, 'destroyToken');
  const resolvedOccurrence = resolveTokenOccurrence(ctx, tokenId);

  if (resolvedOccurrence.occurrenceCount === 0 || resolvedOccurrence.occurrence === null) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Token not found in any zone: ${tokenId}`, {
      effectType: 'destroyToken',
      tokenId,
    });
  }

  if (resolvedOccurrence.occurrenceCount > 1) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Token appears in multiple zones: ${tokenId}`, {
      effectType: 'destroyToken',
      tokenId,
      zones: [...resolvedOccurrence.occurrenceZoneIds].sort(),
    });
  }

  const occurrence = resolvedOccurrence.occurrence;
  const sourceTokens = ctx.state.zones[occurrence.zoneId]!;
  const zoneAfter = [...sourceTokens.slice(0, occurrence.index), ...sourceTokens.slice(occurrence.index + 1)];

  emitTrace(ctx.collector, {
    kind: 'destroyToken',
    tokenId: String(tokenId),
    type: occurrence.token.type,
    zone: occurrence.zoneId,
    provenance: resolveTraceProvenance(ctx),
  });

  return {
    state: {
      ...ctx.state,
      zones: {
        ...ctx.state.zones,
        [occurrence.zoneId]: zoneAfter,
      },
    },
    rng: ctx.rng,
  };
};

export const applySetTokenProp = (effect: Extract<EffectAST, { readonly setTokenProp: unknown }>, ctx: EffectContext): EffectResult => {
  const { token: tokenBinding, prop, value } = effect.setTokenProp;
  const tokenId = resolveBoundTokenId(ctx, tokenBinding, 'setTokenProp');
  const resolvedOccurrence = resolveTokenOccurrence(ctx, tokenId);

  if (resolvedOccurrence.occurrenceCount === 0 || resolvedOccurrence.occurrence === null) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Token not found in any zone: ${tokenId}`, {
      effectType: 'setTokenProp',
      tokenId,
    });
  }

  if (resolvedOccurrence.occurrenceCount > 1) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Token appears in multiple zones: ${tokenId}`, {
      effectType: 'setTokenProp',
      tokenId,
      zones: [...resolvedOccurrence.occurrenceZoneIds].sort(),
    });
  }

  const occurrence = resolvedOccurrence.occurrence;
  const tokenTypeDef = ctx.def.tokenTypes.find((tt) => tt.id === occurrence.token.type);

  if (tokenTypeDef !== undefined) {
    const propType = tokenTypeDef.props[prop];
    if (propType === undefined) {
      throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Property "${prop}" is not defined on token type "${occurrence.token.type}"`, {
        effectType: 'setTokenProp',
        tokenId,
        prop,
        tokenType: occurrence.token.type,
        availableProps: Object.keys(tokenTypeDef.props).sort(),
      });
    }
  }

  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedValue = evalValue(value, evalCtx);

  if (tokenTypeDef?.transitions !== undefined && tokenTypeDef.transitions.length > 0) {
    const transitionsForProp = tokenTypeDef.transitions.filter((t) => t.prop === prop);
    if (transitionsForProp.length > 0) {
      const currentValue = String(occurrence.token.props[prop] ?? '');
      const newValue = String(evaluatedValue);
      const isValid = transitionsForProp.some((t) => t.from === currentValue && t.to === newValue);
      if (!isValid) {
        throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, `Invalid transition for "${prop}": "${currentValue}" → "${newValue}"`, {
          effectType: 'setTokenProp',
          tokenId,
          prop,
          currentValue,
          newValue,
          validTransitions: transitionsForProp.map((t) => `${t.from} → ${t.to}`),
        });
      }
    }
  }

  const oldValue = occurrence.token.props[prop];

  const updatedToken: Token = {
    ...occurrence.token,
    props: {
      ...occurrence.token.props,
      [prop]: evaluatedValue as number | string | boolean,
    },
  };

  emitTrace(ctx.collector, {
    kind: 'setTokenProp',
    tokenId: String(tokenId),
    prop,
    oldValue,
    newValue: evaluatedValue,
    provenance: resolveTraceProvenance(ctx),
  });

  const sourceTokens = ctx.state.zones[occurrence.zoneId]!;
  const zoneAfter = [...sourceTokens.slice(0, occurrence.index), updatedToken, ...sourceTokens.slice(occurrence.index + 1)];

  return {
    state: {
      ...ctx.state,
      zones: {
        ...ctx.state.zones,
        [occurrence.zoneId]: zoneAfter,
      },
    },
    rng: ctx.rng,
  };
};

export const applyDraw = (effect: Extract<EffectAST, { readonly draw: unknown }>, ctx: EffectContext): EffectResult => {
  const count = effect.draw.count;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED, 'draw.count must be a non-negative integer', {
      effectType: 'draw',
      count,
    });
  }

  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(evalCtx.mode);
  const fromZone = resolveZoneWithNormalization(effect.draw.from, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
    effectType: 'draw',
    scope: 'from',
    resolutionFailureMessage: 'draw.from zone resolution failed',
    onResolutionFailure,
  });
  const toZone = resolveZoneWithNormalization(effect.draw.to, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
    effectType: 'draw',
    scope: 'to',
    resolutionFailureMessage: 'draw.to zone resolution failed',
    onResolutionFailure,
  });
  const fromZoneId = String(fromZone);
  const toZoneId = String(toZone);

  let sourceTokens = resolveZoneTokens(ctx, fromZoneId, 'draw', 'from');
  resolveZoneTokens(ctx, toZoneId, 'draw', 'to');

  if (count === 0 || fromZoneId === toZoneId) {
    return { state: ctx.state, rng: ctx.rng, emittedEvents: [] };
  }

  const zoneDef = ctx.def.zones.find(z => z.id === fromZoneId);
  const behavior = zoneDef?.behavior;
  let currentState = ctx.state;
  let currentRng = ctx.rng;

  // Auto-reshuffle: if source is a deck with reshuffleFrom and insufficient tokens
  if (
    behavior?.type === 'deck' &&
    behavior.reshuffleFrom !== undefined &&
    sourceTokens.length < count
  ) {
    const reshuffleZoneId = String(behavior.reshuffleFrom);
    const reshuffleTokens = currentState.zones[reshuffleZoneId];
    if (reshuffleTokens !== undefined && reshuffleTokens.length > 0) {
      const combined = [...sourceTokens, ...reshuffleTokens];
      const shuffled = shuffleTokenArray(combined, currentRng);
      currentRng = shuffled.rng;
      currentState = {
        ...currentState,
        zones: {
          ...currentState.zones,
          [fromZoneId]: shuffled.tokens,
          [reshuffleZoneId]: [],
        },
      };
      sourceTokens = shuffled.tokens;
      for (const reshuffledToken of reshuffleTokens) {
        emitTrace(ctx.collector, {
          kind: 'moveToken',
          tokenId: String(reshuffledToken.id),
          from: reshuffleZoneId,
          to: fromZoneId,
          provenance: resolveTraceProvenance(ctx),
        });
      }
      emitTrace(ctx.collector, {
        kind: 'shuffle',
        zone: fromZoneId,
        provenance: resolveTraceProvenance(ctx),
      });
    }
  }

  if (sourceTokens.length === 0) {
    return { state: currentState, rng: currentRng, emittedEvents: [] };
  }

  const moveCount = Math.min(count, sourceTokens.length);
  let movedTokens: readonly Token[];
  let sourceAfter: readonly Token[];

  if (behavior?.type === 'deck') {
    switch (behavior.drawFrom) {
      case 'bottom': {
        const splitPoint = sourceTokens.length - moveCount;
        movedTokens = sourceTokens.slice(splitPoint);
        sourceAfter = sourceTokens.slice(0, splitPoint);
        break;
      }
      case 'random': {
        const indices: number[] = [];
        const available = [...Array(sourceTokens.length).keys()];
        let drawRng = currentRng;
        for (let i = 0; i < moveCount; i += 1) {
          const [picked, advancedRng] = nextInt(drawRng, 0, available.length - 1);
          drawRng = advancedRng;
          indices.push(available[picked]!);
          available.splice(picked, 1);
        }
        currentRng = drawRng;
        movedTokens = indices.map(idx => sourceTokens[idx]!);
        const pickedSet = new Set(indices);
        sourceAfter = sourceTokens.filter((_, idx) => !pickedSet.has(idx));
        break;
      }
      default: {
        // 'top' — default behavior, same as non-deck zones
        movedTokens = sourceTokens.slice(0, moveCount);
        sourceAfter = sourceTokens.slice(moveCount);
        break;
      }
    }
  } else {
    movedTokens = sourceTokens.slice(0, moveCount);
    sourceAfter = sourceTokens.slice(moveCount);
  }

  const destinationTokens = currentState.zones[toZoneId]!;
  const destinationAfter = [...movedTokens, ...destinationTokens];

  for (const movedToken of movedTokens) {
    emitTrace(ctx.collector, {
      kind: 'moveToken',
      tokenId: String(movedToken.id),
      from: fromZoneId,
      to: toZoneId,
      provenance: resolveTraceProvenance(ctx),
    });
  }

  return {
    state: {
      ...currentState,
      zones: {
        ...currentState.zones,
        [fromZoneId]: sourceAfter,
        [toZoneId]: destinationAfter,
      },
    },
    rng: currentRng,
    emittedEvents: movedTokens.map(() => ({ type: 'tokenEntered', zone: toZone })),
  };
};

export const applyMoveAll = (effect: Extract<EffectAST, { readonly moveAll: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(evalCtx.mode);
  const fromZone = resolveZoneWithNormalization(effect.moveAll.from, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
    effectType: 'moveAll',
    scope: 'from',
    resolutionFailureMessage: 'moveAll.from zone resolution failed',
    onResolutionFailure,
  });
  const toZone = resolveZoneWithNormalization(effect.moveAll.to, evalCtx, {
    code: EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
    effectType: 'moveAll',
    scope: 'to',
    resolutionFailureMessage: 'moveAll.to zone resolution failed',
    onResolutionFailure,
  });
  const fromZoneId = String(fromZone);
  const toZoneId = String(toZone);
  const sourceTokens = resolveZoneTokens(ctx, fromZoneId, 'moveAll', 'from');
  const destinationTokens = resolveZoneTokens(ctx, toZoneId, 'moveAll', 'to');

  if (fromZoneId === toZoneId || sourceTokens.length === 0) {
    return { state: ctx.state, rng: ctx.rng, emittedEvents: [] };
  }

  let movedTokens: readonly Token[] = sourceTokens;
  let sourceAfter: readonly Token[] = [];

  if (effect.moveAll.filter !== undefined) {
    const filteredMoved: Token[] = [];
    const filteredRemaining: Token[] = [];
    const baseBindings = resolveEffectBindings(ctx);

    for (const token of sourceTokens) {
      const filterEvalCtx = {
        ...ctx,
        bindings: {
          ...baseBindings,
          $token: token,
        },
      };

      if (evalCondition(effect.moveAll.filter, filterEvalCtx)) {
        filteredMoved.push(token);
      } else {
        filteredRemaining.push(token);
      }
    }

    movedTokens = filteredMoved;
    sourceAfter = filteredRemaining;
  }

  if (movedTokens.length === 0) {
    return { state: ctx.state, rng: ctx.rng, emittedEvents: [] };
  }

  if (effect.moveAll.filter === undefined) {
    sourceAfter = [];
  }

  const destinationAfter = [...movedTokens, ...destinationTokens];
  enforceStacking(ctx, toZoneId, destinationAfter, 'moveAll');

  for (const movedToken of movedTokens) {
    emitTrace(ctx.collector, {
      kind: 'moveToken',
      tokenId: String(movedToken.id),
      from: fromZoneId,
      to: toZoneId,
      provenance: resolveTraceProvenance(ctx),
    });
  }

  return {
    state: {
      ...ctx.state,
      zones: {
        ...ctx.state.zones,
        [fromZoneId]: sourceAfter,
        [toZoneId]: destinationAfter,
      },
    },
    rng: ctx.rng,
    emittedEvents: movedTokens.map(() => ({ type: 'tokenEntered', zone: toZone })),
  };
};

export function shuffleTokenArray(tokens: readonly Token[], rng: Rng): { readonly tokens: readonly Token[]; readonly rng: Rng } {
  if (tokens.length <= 1) {
    return { tokens, rng };
  }
  const shuffled = [...tokens];
  let nextRng = rng;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const [swapIndex, advancedRng] = nextInt(nextRng, 0, index);
    nextRng = advancedRng;
    if (swapIndex !== index) {
      const temp = shuffled[index]!;
      shuffled[index] = shuffled[swapIndex]!;
      shuffled[swapIndex] = temp;
    }
  }
  return { tokens: shuffled, rng: nextRng };
}

export const applyShuffle = (effect: Extract<EffectAST, { readonly shuffle: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const onResolutionFailure = selectorResolutionFailurePolicyForMode(evalCtx.mode);
  const zoneId = String(
    resolveZoneWithNormalization(effect.shuffle.zone, evalCtx, {
      code: EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
      effectType: 'shuffle',
      scope: 'zone',
      resolutionFailureMessage: 'shuffle.zone resolution failed',
      onResolutionFailure,
    }),
  );
  const zoneTokens = resolveZoneTokens(ctx, zoneId, 'shuffle', 'zone');

  if (zoneTokens.length <= 1) {
    return { state: ctx.state, rng: ctx.rng };
  }

  const result = shuffleTokenArray(zoneTokens, ctx.rng);

  emitTrace(ctx.collector, {
    kind: 'shuffle',
    zone: zoneId,
    provenance: resolveTraceProvenance(ctx),
  });

  return {
    state: {
      ...ctx.state,
      zones: {
        ...ctx.state.zones,
        [zoneId]: result.tokens,
      },
    },
    rng: result.rng,
  };
};
