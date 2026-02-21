import { asTokenId } from './branded.js';
import { evalCondition } from './eval-condition.js';
import { evalValue } from './eval-value.js';
import { emitTrace } from './execution-collector.js';
import { nextInt } from './prng.js';
import { resolveZoneRef } from './resolve-zone-ref.js';
import { checkStackingConstraints } from './stacking.js';
import { EffectRuntimeError, effectRuntimeError } from './effect-error.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import type { EffectContext, EffectResult } from './effect-context.js';
import type { EffectAST, Token } from './types.js';

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
        'tokenRuntimeValidationFailed',
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
    throw effectRuntimeError('tokenRuntimeValidationFailed', `Zone state not found for selector result: ${zoneId}`, {
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
    throw effectRuntimeError('tokenRuntimeValidationFailed', `Token binding not found: ${tokenBinding}`, {
      effectType,
      tokenBinding,
      availableBindings: Object.keys(bindings).sort(),
    });
  }

  if (typeof boundValue === 'string') {
    return boundValue;
  }

  if (typeof boundValue === 'object' && boundValue !== null && 'id' in boundValue && typeof boundValue.id === 'string') {
    return boundValue.id;
  }

  throw effectRuntimeError('tokenRuntimeValidationFailed', `Token binding ${tokenBinding} must resolve to Token or TokenId`, {
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

const findTokenOccurrences = (ctx: EffectContext, tokenId: string): readonly TokenOccurrence[] => {
  const occurrences: TokenOccurrence[] = [];

  for (const [zoneId, tokens] of Object.entries(ctx.state.zones)) {
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token?.id === tokenId) {
        occurrences.push({ zoneId, index, token });
      }
    }
  }

  return occurrences;
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
      'tokenRuntimeValidationFailed',
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
  const fromZone = resolveZoneRef(effect.moveToken.from, evalCtx);
  const toZone = resolveZoneRef(effect.moveToken.to, evalCtx);
  const fromZoneId = String(fromZone);
  const toZoneId = String(toZone);
  const sourceTokens = resolveZoneTokens(ctx, fromZoneId, 'moveToken', 'from');
  const destinationTokens = resolveZoneTokens(ctx, toZoneId, 'moveToken', 'to');

  const tokenId = resolveBoundTokenId(ctx, effect.moveToken.token, 'moveToken');
  const occurrences = findTokenOccurrences(ctx, tokenId);

  if (occurrences.length === 0) {
    throw effectRuntimeError('tokenRuntimeValidationFailed', `Token not found in any zone: ${tokenId}`, {
      effectType: 'moveToken',
      tokenId,
      fromZoneId,
    });
  }

  if (occurrences.length > 1) {
    throw effectRuntimeError('tokenRuntimeValidationFailed', `Token appears in multiple zones: ${tokenId}`, {
      effectType: 'moveToken',
      tokenId,
      zones: occurrences.map((occurrence) => occurrence.zoneId).sort(),
    });
  }

  const occurrence = occurrences[0]!;
  if (occurrence.zoneId !== fromZoneId) {
    throw effectRuntimeError('tokenRuntimeValidationFailed', `Token is not in resolved from zone: ${tokenId}`, {
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
  const fromZone = resolveZoneRef(effect.moveTokenAdjacent.from, evalCtx);
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
  const zoneId = String(resolveZoneRef(effect.createToken.zone, evalCtx));
  const zoneTokens = resolveZoneTokens(ctx, zoneId, 'createToken', 'zone');

  const ordinal = ctx.state.nextTokenOrdinal;
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw effectRuntimeError('tokenRuntimeValidationFailed', 'nextTokenOrdinal must be a non-negative safe integer', {
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
  const occurrences = findTokenOccurrences(ctx, tokenId);

  if (occurrences.length === 0) {
    throw effectRuntimeError('tokenRuntimeValidationFailed', `Token not found in any zone: ${tokenId}`, {
      effectType: 'destroyToken',
      tokenId,
    });
  }

  if (occurrences.length > 1) {
    throw effectRuntimeError('tokenRuntimeValidationFailed', `Token appears in multiple zones: ${tokenId}`, {
      effectType: 'destroyToken',
      tokenId,
      zones: occurrences.map((occurrence) => occurrence.zoneId).sort(),
    });
  }

  const occurrence = occurrences[0]!;
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
  const occurrences = findTokenOccurrences(ctx, tokenId);

  if (occurrences.length === 0) {
    throw effectRuntimeError('tokenRuntimeValidationFailed', `Token not found in any zone: ${tokenId}`, {
      effectType: 'setTokenProp',
      tokenId,
    });
  }

  if (occurrences.length > 1) {
    throw effectRuntimeError('tokenRuntimeValidationFailed', `Token appears in multiple zones: ${tokenId}`, {
      effectType: 'setTokenProp',
      tokenId,
      zones: occurrences.map((occurrence) => occurrence.zoneId).sort(),
    });
  }

  const occurrence = occurrences[0]!;
  const tokenTypeDef = ctx.def.tokenTypes.find((tt) => tt.id === occurrence.token.type);

  if (tokenTypeDef !== undefined) {
    const propType = tokenTypeDef.props[prop];
    if (propType === undefined) {
      throw effectRuntimeError('tokenRuntimeValidationFailed', `Property "${prop}" is not defined on token type "${occurrence.token.type}"`, {
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
        throw effectRuntimeError('tokenRuntimeValidationFailed', `Invalid transition for "${prop}": "${currentValue}" → "${newValue}"`, {
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
    throw effectRuntimeError('tokenRuntimeValidationFailed', 'draw.count must be a non-negative integer', {
      effectType: 'draw',
      count,
    });
  }

  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const fromZone = resolveZoneRef(effect.draw.from, evalCtx);
  const toZone = resolveZoneRef(effect.draw.to, evalCtx);
  const fromZoneId = String(fromZone);
  const toZoneId = String(toZone);

  const sourceTokens = resolveZoneTokens(ctx, fromZoneId, 'draw', 'from');
  resolveZoneTokens(ctx, toZoneId, 'draw', 'to');

  if (count === 0 || sourceTokens.length === 0 || fromZoneId === toZoneId) {
    return { state: ctx.state, rng: ctx.rng, emittedEvents: [] };
  }

  const moveCount = Math.min(count, sourceTokens.length);
  const movedTokens = sourceTokens.slice(0, moveCount);
  const sourceAfter = sourceTokens.slice(moveCount);
  const destinationTokens = ctx.state.zones[toZoneId]!;
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

export const applyMoveAll = (effect: Extract<EffectAST, { readonly moveAll: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const fromZone = resolveZoneRef(effect.moveAll.from, evalCtx);
  const toZone = resolveZoneRef(effect.moveAll.to, evalCtx);
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

export const applyShuffle = (effect: Extract<EffectAST, { readonly shuffle: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const zoneId = String(resolveZoneRef(effect.shuffle.zone, evalCtx));
  const zoneTokens = resolveZoneTokens(ctx, zoneId, 'shuffle', 'zone');

  if (zoneTokens.length <= 1) {
    return { state: ctx.state, rng: ctx.rng };
  }

  const shuffledTokens = [...zoneTokens];
  let nextRng = ctx.rng;
  for (let index = shuffledTokens.length - 1; index > 0; index -= 1) {
    const [swapIndex, advancedRng] = nextInt(nextRng, 0, index);
    nextRng = advancedRng;
    if (swapIndex !== index) {
      const temp = shuffledTokens[index]!;
      shuffledTokens[index] = shuffledTokens[swapIndex]!;
      shuffledTokens[swapIndex] = temp;
    }
  }

  return {
    state: {
      ...ctx.state,
      zones: {
        ...ctx.state.zones,
        [zoneId]: shuffledTokens,
      },
    },
    rng: nextRng,
  };
};
