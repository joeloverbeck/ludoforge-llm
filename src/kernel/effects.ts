import { getMaxEffectOps, type EffectContext, type EffectResult } from './effect-context.js';
import {
  EffectBudgetExceededError,
  EffectRuntimeError,
  effectNotImplementedError,
} from './effect-error.js';
import { asTokenId } from './branded.js';
import { evalCondition } from './eval-condition.js';
import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { nextInt } from './prng.js';
import { resolvePlayerSel, resolveSingleZoneSel } from './resolve-selectors.js';
import { checkStackingConstraints } from './stacking.js';
import type { EffectAST, Token, TriggerEvent } from './types.js';

interface EffectBudgetState {
  remaining: number;
  readonly max: number;
}

const createBudgetState = (ctx: Pick<EffectContext, 'maxEffectOps'>): EffectBudgetState => {
  const maxEffectOps = getMaxEffectOps(ctx);
  if (!Number.isInteger(maxEffectOps) || maxEffectOps < 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'maxEffectOps must be a non-negative integer', { maxEffectOps });
  }

  return { remaining: maxEffectOps, max: maxEffectOps };
};

const effectTypeOf = (effect: EffectAST): string => {
  if ('setVar' in effect) return 'setVar';
  if ('addVar' in effect) return 'addVar';
  if ('moveToken' in effect) return 'moveToken';
  if ('moveAll' in effect) return 'moveAll';
  if ('moveTokenAdjacent' in effect) return 'moveTokenAdjacent';
  if ('draw' in effect) return 'draw';
  if ('shuffle' in effect) return 'shuffle';
  if ('createToken' in effect) return 'createToken';
  if ('destroyToken' in effect) return 'destroyToken';
  if ('if' in effect) return 'if';
  if ('forEach' in effect) return 'forEach';
  if ('let' in effect) return 'let';
  if ('chooseOne' in effect) return 'chooseOne';
  if ('chooseN' in effect) return 'chooseN';

  const _exhaustive: never = effect;
  return _exhaustive;
};

const consumeBudget = (budget: EffectBudgetState, effectType: string): void => {
  if (budget.remaining <= 0) {
    throw new EffectBudgetExceededError('Effect operation budget exceeded', {
      effectType,
      maxEffectOps: budget.max,
    });
  }

  budget.remaining -= 1;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const resolveEffectBindings = (ctx: EffectContext): Readonly<Record<string, unknown>> => ({
  ...ctx.moveParams,
  ...ctx.bindings,
});

const valuesMatch = (candidate: unknown, selected: unknown): boolean => {
  if (Object.is(candidate, selected)) {
    return true;
  }

  if (
    typeof selected === 'string' &&
    typeof candidate === 'object' &&
    candidate !== null &&
    'id' in candidate &&
    typeof candidate.id === 'string'
  ) {
    return candidate.id === selected;
  }

  return false;
};

const isInDomain = (selected: unknown, domain: readonly unknown[]): boolean =>
  domain.some((candidate) => valuesMatch(candidate, selected));

const enforceStacking = (ctx: EffectContext, zoneId: string, zoneContentsAfter: readonly Token[], effectType: string): void => {
  const constraints = ctx.def.stackingConstraints;
  const mapSpaces = ctx.mapSpaces;
  if (constraints === undefined || constraints.length === 0 || mapSpaces === undefined || mapSpaces.length === 0) {
    return;
  }

  const violations = checkStackingConstraints(constraints, mapSpaces, zoneId, zoneContentsAfter);
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

const expectInteger = (value: unknown, effectType: 'setVar' | 'addVar', field: 'value' | 'delta'): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `${effectType}.${field} must evaluate to a finite safe integer`, {
      effectType,
      field,
      actualType: typeof value,
      value,
    });
  }

  return value;
};

const resolveGlobalVarDef = (ctx: EffectContext, varName: string, effectType: 'setVar' | 'addVar') => {
  const variableDef = ctx.def.globalVars.find((variable) => variable.name === varName);
  if (variableDef === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Unknown global variable: ${varName}`, {
      effectType,
      scope: 'global',
      var: varName,
      availableGlobalVars: ctx.def.globalVars.map((variable) => variable.name).sort(),
    });
  }

  if (variableDef.type !== 'int') {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Variable ${varName} must be int`, {
      effectType,
      scope: 'global',
      var: varName,
      actualType: variableDef.type,
    });
  }

  return variableDef;
};

const resolvePerPlayerVarDef = (ctx: EffectContext, varName: string, effectType: 'setVar' | 'addVar') => {
  const variableDef = ctx.def.perPlayerVars.find((variable) => variable.name === varName);
  if (variableDef === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Unknown per-player variable: ${varName}`, {
      effectType,
      scope: 'pvar',
      var: varName,
      availablePerPlayerVars: ctx.def.perPlayerVars.map((variable) => variable.name).sort(),
    });
  }

  if (variableDef.type !== 'int') {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Variable ${varName} must be int`, {
      effectType,
      scope: 'pvar',
      var: varName,
      actualType: variableDef.type,
    });
  }

  return variableDef;
};

const applySetVar = (effect: Extract<EffectAST, { readonly setVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { scope, var: variableName, player, value } = effect.setVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedValue = expectInteger(evalValue(value, evalCtx), 'setVar', 'value');

  if (scope === 'global') {
    const variableDef = resolveGlobalVarDef(ctx, variableName, 'setVar');
    const currentValue = ctx.state.globalVars[variableName];
    if (typeof currentValue !== 'number') {
      throw new EffectRuntimeError('EFFECT_RUNTIME', `Global variable state is missing: ${variableName}`, {
        effectType: 'setVar',
        scope: 'global',
        var: variableName,
        availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
      });
    }

    const nextValue = clamp(evaluatedValue, variableDef.min, variableDef.max);
    if (nextValue === currentValue) {
      return { state: ctx.state, rng: ctx.rng };
    }

    return {
      state: {
        ...ctx.state,
        globalVars: {
          ...ctx.state.globalVars,
          [variableName]: nextValue,
        },
      },
      rng: ctx.rng,
    };
  }

  if (player === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'setVar scope "pvar" requires player selector', {
      effectType: 'setVar',
      scope: 'pvar',
      var: variableName,
    });
  }

  const resolvedPlayers = resolvePlayerSel(player, evalCtx);
  if (resolvedPlayers.length !== 1) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'Per-player variable operations require exactly one resolved player', {
      effectType: 'setVar',
      scope: 'pvar',
      selector: player,
      resolvedCount: resolvedPlayers.length,
      resolvedPlayers,
    });
  }

  const playerId = resolvedPlayers[0]!;
  const variableDef = resolvePerPlayerVarDef(ctx, variableName, 'setVar');
  const playerKey = String(playerId);
  const playerVars = ctx.state.perPlayerVars[playerKey];
  if (playerVars === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Per-player vars missing for player ${playerId}`, {
      effectType: 'setVar',
      scope: 'pvar',
      playerId,
      availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
    });
  }

  const currentValue = playerVars[variableName];
  if (typeof currentValue !== 'number') {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Per-player variable state is missing: ${variableName}`, {
      effectType: 'setVar',
      scope: 'pvar',
      playerId,
      var: variableName,
      availablePlayerVars: Object.keys(playerVars).sort(),
    });
  }

  const nextValue = clamp(evaluatedValue, variableDef.min, variableDef.max);
  if (nextValue === currentValue) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: {
      ...ctx.state,
      perPlayerVars: {
        ...ctx.state.perPlayerVars,
        [playerKey]: {
          ...playerVars,
          [variableName]: nextValue,
        },
      },
    },
    rng: ctx.rng,
  };
};

const applyAddVar = (effect: Extract<EffectAST, { readonly addVar: unknown }>, ctx: EffectContext): EffectResult => {
  const { scope, var: variableName, player, delta } = effect.addVar;
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedDelta = expectInteger(evalValue(delta, evalCtx), 'addVar', 'delta');

  if (scope === 'global') {
    const variableDef = resolveGlobalVarDef(ctx, variableName, 'addVar');
    const currentValue = ctx.state.globalVars[variableName];
    if (typeof currentValue !== 'number') {
      throw new EffectRuntimeError('EFFECT_RUNTIME', `Global variable state is missing: ${variableName}`, {
        effectType: 'addVar',
        scope: 'global',
        var: variableName,
        availableGlobalVars: Object.keys(ctx.state.globalVars).sort(),
      });
    }

    const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
    if (nextValue === currentValue) {
      return { state: ctx.state, rng: ctx.rng };
    }

    return {
      state: {
        ...ctx.state,
        globalVars: {
          ...ctx.state.globalVars,
          [variableName]: nextValue,
        },
      },
      rng: ctx.rng,
    };
  }

  if (player === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'addVar scope "pvar" requires player selector', {
      effectType: 'addVar',
      scope: 'pvar',
      var: variableName,
    });
  }

  const resolvedPlayers = resolvePlayerSel(player, evalCtx);
  if (resolvedPlayers.length !== 1) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'Per-player variable operations require exactly one resolved player', {
      effectType: 'addVar',
      scope: 'pvar',
      selector: player,
      resolvedCount: resolvedPlayers.length,
      resolvedPlayers,
    });
  }

  const playerId = resolvedPlayers[0]!;
  const variableDef = resolvePerPlayerVarDef(ctx, variableName, 'addVar');
  const playerKey = String(playerId);
  const playerVars = ctx.state.perPlayerVars[playerKey];
  if (playerVars === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Per-player vars missing for player ${playerId}`, {
      effectType: 'addVar',
      scope: 'pvar',
      playerId,
      availablePlayers: Object.keys(ctx.state.perPlayerVars).sort(),
    });
  }

  const currentValue = playerVars[variableName];
  if (typeof currentValue !== 'number') {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Per-player variable state is missing: ${variableName}`, {
      effectType: 'addVar',
      scope: 'pvar',
      playerId,
      var: variableName,
      availablePlayerVars: Object.keys(playerVars).sort(),
    });
  }

  const nextValue = clamp(currentValue + evaluatedDelta, variableDef.min, variableDef.max);
  if (nextValue === currentValue) {
    return { state: ctx.state, rng: ctx.rng };
  }

  return {
    state: {
      ...ctx.state,
      perPlayerVars: {
        ...ctx.state.perPlayerVars,
        [playerKey]: {
          ...playerVars,
          [variableName]: nextValue,
        },
      },
    },
    rng: ctx.rng,
  };
};

const resolveZoneTokens = (
  ctx: EffectContext,
  zoneId: string,
  effectType: 'moveToken' | 'moveAll' | 'draw' | 'shuffle' | 'createToken',
  field: 'from' | 'to' | 'zone',
): readonly Token[] => {
  const zoneTokens = ctx.state.zones[zoneId];
  if (zoneTokens === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Zone state not found for selector result: ${zoneId}`, {
      effectType,
      field,
      zoneId,
      availableZoneIds: Object.keys(ctx.state.zones).sort(),
    });
  }

  return zoneTokens;
};

const resolveBoundTokenId = (ctx: EffectContext, tokenBinding: string, effectType: 'moveToken' | 'destroyToken'): string => {
  const bindings = resolveEffectBindings(ctx);
  const boundValue = bindings[tokenBinding];
  if (boundValue === undefined) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Token binding not found: ${tokenBinding}`, {
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

  throw new EffectRuntimeError('EFFECT_RUNTIME', `Token binding ${tokenBinding} must resolve to Token or TokenId`, {
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
    throw new EffectRuntimeError(
      'EFFECT_RUNTIME',
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

const applyMoveToken = (effect: Extract<EffectAST, { readonly moveToken: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const fromZone = resolveSingleZoneSel(effect.moveToken.from, evalCtx);
  const toZone = resolveSingleZoneSel(effect.moveToken.to, evalCtx);
  const fromZoneId = String(fromZone);
  const toZoneId = String(toZone);
  const sourceTokens = resolveZoneTokens(ctx, fromZoneId, 'moveToken', 'from');
  const destinationTokens = resolveZoneTokens(ctx, toZoneId, 'moveToken', 'to');

  const tokenId = resolveBoundTokenId(ctx, effect.moveToken.token, 'moveToken');
  const occurrences = findTokenOccurrences(ctx, tokenId);

  if (occurrences.length === 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Token not found in any zone: ${tokenId}`, {
      effectType: 'moveToken',
      tokenId,
      fromZoneId,
    });
  }

  if (occurrences.length > 1) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Token appears in multiple zones: ${tokenId}`, {
      effectType: 'moveToken',
      tokenId,
      zones: occurrences.map((occurrence) => occurrence.zoneId).sort(),
    });
  }

  const occurrence = occurrences[0]!;
  if (occurrence.zoneId !== fromZoneId) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Token is not in resolved from zone: ${tokenId}`, {
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

const applyMoveTokenAdjacent = (
  effect: Extract<EffectAST, { readonly moveTokenAdjacent: unknown }>,
  ctx: EffectContext,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const fromZone = resolveSingleZoneSel(effect.moveTokenAdjacent.from, evalCtx);
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

const applyCreateToken = (effect: Extract<EffectAST, { readonly createToken: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const zoneId = String(resolveSingleZoneSel(effect.createToken.zone, evalCtx));
  const zoneTokens = resolveZoneTokens(ctx, zoneId, 'createToken', 'zone');

  const ordinal = ctx.state.nextTokenOrdinal;
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'nextTokenOrdinal must be a non-negative safe integer', {
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

const applyDestroyToken = (effect: Extract<EffectAST, { readonly destroyToken: unknown }>, ctx: EffectContext): EffectResult => {
  const tokenId = resolveBoundTokenId(ctx, effect.destroyToken.token, 'destroyToken');
  const occurrences = findTokenOccurrences(ctx, tokenId);

  if (occurrences.length === 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Token not found in any zone: ${tokenId}`, {
      effectType: 'destroyToken',
      tokenId,
    });
  }

  if (occurrences.length > 1) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `Token appears in multiple zones: ${tokenId}`, {
      effectType: 'destroyToken',
      tokenId,
      zones: occurrences.map((occurrence) => occurrence.zoneId).sort(),
    });
  }

  const occurrence = occurrences[0]!;
  const sourceTokens = ctx.state.zones[occurrence.zoneId]!;
  const zoneAfter = [...sourceTokens.slice(0, occurrence.index), ...sourceTokens.slice(occurrence.index + 1)];

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

const applyDraw = (effect: Extract<EffectAST, { readonly draw: unknown }>, ctx: EffectContext): EffectResult => {
  const count = effect.draw.count;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'draw.count must be a non-negative integer', {
      effectType: 'draw',
      count,
    });
  }

  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const fromZone = resolveSingleZoneSel(effect.draw.from, evalCtx);
  const toZone = resolveSingleZoneSel(effect.draw.to, evalCtx);
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

const applyMoveAll = (effect: Extract<EffectAST, { readonly moveAll: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const fromZone = resolveSingleZoneSel(effect.moveAll.from, evalCtx);
  const toZone = resolveSingleZoneSel(effect.moveAll.to, evalCtx);
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

const applyShuffle = (effect: Extract<EffectAST, { readonly shuffle: unknown }>, ctx: EffectContext): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const zoneId = String(resolveSingleZoneSel(effect.shuffle.zone, evalCtx));
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

const applyEffectsWithBudget = (effects: readonly EffectAST[], ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  let currentState = ctx.state;
  let currentRng = ctx.rng;
  const emittedEvents: TriggerEvent[] = [];

  for (const effect of effects) {
    const result = applyEffectWithBudget(effect, { ...ctx, state: currentState, rng: currentRng }, budget);
    currentState = result.state;
    currentRng = result.rng;
    emittedEvents.push(...(result.emittedEvents ?? []));
  }

  return { state: currentState, rng: currentRng, emittedEvents };
};

const applyIf = (
  effect: Extract<EffectAST, { readonly if: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const predicate = evalCondition(effect.if.when, evalCtx);

  if (predicate) {
    return applyEffectsWithBudget(effect.if.then, ctx, budget);
  }

  if (effect.if.else !== undefined) {
    return applyEffectsWithBudget(effect.if.else, ctx, budget);
  }

  return { state: ctx.state, rng: ctx.rng };
};

const applyLet = (
  effect: Extract<EffectAST, { readonly let: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
): EffectResult => {
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const evaluatedValue = evalValue(effect.let.value, evalCtx);
  const nestedCtx: EffectContext = {
    ...ctx,
    bindings: {
      ...ctx.bindings,
      [effect.let.bind]: evaluatedValue,
    },
  };

  return applyEffectsWithBudget(effect.let.in, nestedCtx, budget);
};

const applyForEach = (
  effect: Extract<EffectAST, { readonly forEach: unknown }>,
  ctx: EffectContext,
  budget: EffectBudgetState,
): EffectResult => {
  const limit = effect.forEach.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'forEach.limit must be a positive integer', {
      effectType: 'forEach',
      limit,
    });
  }

  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const queryResult = evalQuery(effect.forEach.over, evalCtx);
  const boundedItems = queryResult.slice(0, limit);

  let currentState = ctx.state;
  let currentRng = ctx.rng;
  for (const item of boundedItems) {
    const iterationCtx: EffectContext = {
      ...ctx,
      state: currentState,
      rng: currentRng,
      bindings: {
        ...ctx.bindings,
        [effect.forEach.bind]: item,
      },
    };
    const iterationResult = applyEffectsWithBudget(effect.forEach.effects, iterationCtx, budget);
    currentState = iterationResult.state;
    currentRng = iterationResult.rng;
  }

  return { state: currentState, rng: currentRng };
};

const applyChooseOne = (effect: Extract<EffectAST, { readonly chooseOne: unknown }>, ctx: EffectContext): EffectResult => {
  if (!Object.prototype.hasOwnProperty.call(ctx.moveParams, effect.chooseOne.bind)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseOne missing move param binding: ${effect.chooseOne.bind}`, {
      effectType: 'chooseOne',
      bind: effect.chooseOne.bind,
      availableMoveParams: Object.keys(ctx.moveParams).sort(),
    });
  }

  const selected = ctx.moveParams[effect.chooseOne.bind];
  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const options = evalQuery(effect.chooseOne.options, evalCtx);
  if (!isInDomain(selected, options)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseOne selection is outside options domain: ${effect.chooseOne.bind}`, {
      effectType: 'chooseOne',
      bind: effect.chooseOne.bind,
      selected,
      optionsCount: options.length,
    });
  }

  return { state: ctx.state, rng: ctx.rng };
};

const applyChooseN = (effect: Extract<EffectAST, { readonly chooseN: unknown }>, ctx: EffectContext): EffectResult => {
  const chooseN = effect.chooseN;
  const bind = chooseN.bind;
  const hasN = 'n' in chooseN && chooseN.n !== undefined;
  const hasMax = 'max' in chooseN && chooseN.max !== undefined;
  const hasMin = 'min' in chooseN && chooseN.min !== undefined;
  let minCardinality: number;
  let maxCardinality: number;

  if (hasN && hasMax) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN must use either exact n or range max/min cardinality', {
      effectType: 'chooseN',
      bind,
      chooseN,
    });
  }

  if (hasN) {
    minCardinality = chooseN.n;
    maxCardinality = chooseN.n;
  } else if (hasMax) {
    minCardinality = hasMin ? chooseN.min : 0;
    maxCardinality = chooseN.max;
  } else {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN must use either exact n or range max/min cardinality', {
      effectType: 'chooseN',
      bind,
      chooseN,
    });
  }

  if (!Number.isSafeInteger(minCardinality) || minCardinality < 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN minimum cardinality must be a non-negative integer', {
      effectType: 'chooseN',
      bind: chooseN.bind,
      min: hasN ? chooseN.n : chooseN.min,
    });
  }

  if (!Number.isSafeInteger(maxCardinality) || maxCardinality < 0) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN maximum cardinality must be a non-negative integer', {
      effectType: 'chooseN',
      bind: chooseN.bind,
      max: hasN ? chooseN.n : chooseN.max,
    });
  }

  if (minCardinality > maxCardinality) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', 'chooseN min cannot exceed max', {
      effectType: 'chooseN',
      bind: chooseN.bind,
      min: minCardinality,
      max: maxCardinality,
    });
  }

  if (!Object.prototype.hasOwnProperty.call(ctx.moveParams, bind)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN missing move param binding: ${bind}`, {
      effectType: 'chooseN',
      bind,
      availableMoveParams: Object.keys(ctx.moveParams).sort(),
    });
  }

  const selectedValue = ctx.moveParams[bind];
  if (!Array.isArray(selectedValue)) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN move param must be an array: ${bind}`, {
      effectType: 'chooseN',
      bind,
      actualType: typeof selectedValue,
      value: selectedValue,
    });
  }

  if (selectedValue.length < minCardinality || selectedValue.length > maxCardinality) {
    throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN selection cardinality mismatch for: ${bind}`, {
      effectType: 'chooseN',
      bind,
      min: minCardinality,
      max: maxCardinality,
      actual: selectedValue.length,
    });
  }

  for (let left = 0; left < selectedValue.length; left += 1) {
    for (let right = left + 1; right < selectedValue.length; right += 1) {
      if (valuesMatch(selectedValue[left], selectedValue[right])) {
        throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN selections must be unique: ${bind}`, {
          effectType: 'chooseN',
          bind,
          duplicateValue: selectedValue[left],
        });
      }
    }
  }

  const evalCtx = { ...ctx, bindings: resolveEffectBindings(ctx) };
  const options = evalQuery(chooseN.options, evalCtx);
  for (const selected of selectedValue) {
    if (!isInDomain(selected, options)) {
      throw new EffectRuntimeError('EFFECT_RUNTIME', `chooseN selection is outside options domain: ${bind}`, {
        effectType: 'chooseN',
        bind,
        selected,
        optionsCount: options.length,
      });
    }
  }

  return { state: ctx.state, rng: ctx.rng };
};

const dispatchEffect = (effect: EffectAST, ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  if ('setVar' in effect) {
    return applySetVar(effect, ctx);
  }

  if ('addVar' in effect) {
    return applyAddVar(effect, ctx);
  }

  if ('moveToken' in effect) {
    return applyMoveToken(effect, ctx);
  }

  if ('moveAll' in effect) {
    return applyMoveAll(effect, ctx);
  }

  if ('moveTokenAdjacent' in effect) {
    return applyMoveTokenAdjacent(effect, ctx);
  }

  if ('draw' in effect) {
    return applyDraw(effect, ctx);
  }

  if ('shuffle' in effect) {
    return applyShuffle(effect, ctx);
  }

  if ('createToken' in effect) {
    return applyCreateToken(effect, ctx);
  }

  if ('destroyToken' in effect) {
    return applyDestroyToken(effect, ctx);
  }

  if ('if' in effect) {
    return applyIf(effect, ctx, budget);
  }

  if ('forEach' in effect) {
    return applyForEach(effect, ctx, budget);
  }

  if ('let' in effect) {
    return applyLet(effect, ctx, budget);
  }

  if ('chooseOne' in effect) {
    return applyChooseOne(effect, ctx);
  }

  if ('chooseN' in effect) {
    return applyChooseN(effect, ctx);
  }

  throw effectNotImplementedError(effectTypeOf(effect), { effect });
};

const applyEffectWithBudget = (effect: EffectAST, ctx: EffectContext, budget: EffectBudgetState): EffectResult => {
  const effectType = effectTypeOf(effect);
  consumeBudget(budget, effectType);
  const result = dispatchEffect(effect, ctx, budget);
  return {
    state: result.state,
    rng: result.rng,
    emittedEvents: result.emittedEvents ?? [],
  };
};

export function applyEffect(effect: EffectAST, ctx: EffectContext): EffectResult {
  const budget = createBudgetState(ctx);
  return applyEffectWithBudget(effect, ctx, budget);
}

export function applyEffects(effects: readonly EffectAST[], ctx: EffectContext): EffectResult {
  const budget = createBudgetState(ctx);
  return applyEffectsWithBudget(effects, ctx, budget);
}
