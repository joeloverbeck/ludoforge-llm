import { rebaseIterationPath, withIterationSegment, emptyScope } from './decision-scope.js';
import type { EffectCursor, EffectResult } from './effect-context.js';
import { createEvalContext } from './eval-context.js';
import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { typeMismatchError } from './eval-error.js';
import { buildEffectEnvFromCompiledCtx, createCompiledExecutionContext } from './effect-compiler-runtime.js';
import { applyEffectsWithBudgetState, consumeEffectBudget, createEffectBudgetState } from './effect-dispatch.js';
import type { MutableGameState } from './state-draft.js';
import {
  type AddVarPattern,
  type AdvancePhasePattern,
  type BindValuePattern,
  type CompilableConditionPattern,
  type CreateTokenPattern,
  type DestroyTokenPattern,
  type DrawPattern,
  type FlipGlobalMarkerPattern,
  type ForEachPlayersPattern,
  type GotoPhaseExactPattern,
  type IfPattern,
  type LetPattern,
  type LogicalConditionPattern,
  type MoveAllPattern,
  type MoveTokenAdjacentPattern,
  type MoveTokenPattern,
  type PatternDescriptor,
  type PopInterruptPhasePattern,
  type SetActivePlayerPattern,
  type SetGlobalMarkerPattern,
  type SetMarkerPattern,
  type SetTokenPropPattern,
  type SetVarPattern,
  type ShufflePattern,
  type ShiftGlobalMarkerPattern,
  type ShiftMarkerPattern,
  type SimpleComparisonPattern,
  type SimpleNumericValuePattern,
  type SimpleValuePattern,
  type TransferVarPattern,
} from './effect-compiler-patterns.js';
import type { CompiledEffectContext, CompiledEffectFn } from './effect-compiler-types.js';
import { effectRuntimeError } from './effect-error.js';
import {
  applyFlipGlobalMarker,
  applySetGlobalMarker,
  applySetMarker,
  applyShiftGlobalMarker,
  applyShiftMarker,
} from './effects-choice.js';
import { applyTransferVar } from './effects-resource.js';
import {
  applyCreateToken,
  applyDestroyToken,
  applyDraw,
  applyMoveAll,
  applyMoveToken,
  applyMoveTokenAdjacent,
  applySetTokenProp,
  applyShuffle,
} from './effects-token.js';
import { applyAdvancePhase, applyGotoPhaseExact, applyPopInterruptPhase } from './effects-turn-flow.js';
import { applySetActivePlayer } from './effects-var.js';
import {
  advancePhase as advancePhaseBuilder,
  createToken as createTokenBuilder,
  destroyToken as destroyTokenBuilder,
  draw as drawBuilder,
  gotoPhaseExact as gotoPhaseExactBuilder,
  moveAll as moveAllBuilder,
  moveToken as moveTokenBuilder,
  moveTokenAdjacent as moveTokenAdjacentBuilder,
  popInterruptPhase as popInterruptPhaseBuilder,
  setActivePlayer as setActivePlayerBuilder,
  setTokenProp as setTokenPropBuilder,
  shuffle as shuffleBuilder,
} from './ast-builders.js';
import { toEffectEnv, toEffectCursor } from './effect-context.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { resolveRef } from './resolve-ref.js';
import {
  readScopedIntVarValue,
  readScopedVarValue,
  resolveRuntimeScopedEndpoint,
  resolveScopedVarDef,
  toScopedVarWrite,
  writeScopedVarsMutable,
  writeScopedVarsToState,
} from './scoped-var-runtime-access.js';
import { toTraceVarChangePayload, toVarChangedEvent } from './scoped-var-runtime-mapping.js';
import { emitVarChangeTraceIfChanged } from './var-change-trace.js';
import { clampIntVarValue } from './var-runtime-utils.js';
import { resolveControlFlowIterationLimit } from './control-flow-limit.js';
import { EFFECT_KIND_TAG, VALUE_EXPR_TAG } from './types.js';
import type { EffectAST, GameState, IntVariableDef, NumericValueExpr, Reference, Rng, TriggerEvent, ValueExpr } from './types.js';

export interface CompiledEffectFragment {
  readonly execute: CompiledEffectFn;
  readonly nodeCount: number;
}

export type CompiledValueAccessor = (
  state: GameState,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
) => unknown;

export type CompiledConditionEvaluator = (
  state: GameState,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
) => boolean;

export type BodyCompiler = (effects: readonly EffectAST[]) => CompiledEffectFragment | null;

const expectInteger = (value: unknown, effectType: 'setVar' | 'addVar', field: 'value' | 'delta'): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED, `${effectType}.${field} must evaluate to a finite safe integer`, {
      effectType,
      field,
      actualType: typeof value,
      value,
    });
  }

  return value;
};

const expectBoolean = (value: unknown, effectType: 'setVar', field: 'value'): boolean => {
  if (typeof value !== 'boolean') {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED, `${effectType}.${field} must evaluate to boolean`, {
      effectType,
      field,
      actualType: typeof value,
      value,
    });
  }

  return value;
};

const expectOrderingNumber = (value: unknown, side: 'left' | 'right', condition: SimpleComparisonPattern): number => {
  if (typeof value !== 'number') {
    throw typeMismatchError(`${condition.op} requires numeric ${side}`, {
      condition,
      side,
      actualType: typeof value,
      value,
    });
  }
  return value;
};

const resolveCompiledBindings = (
  bindings: Readonly<Record<string, unknown>>,
  ctx: Pick<CompiledEffectContext, 'moveParams'>,
): Readonly<Record<string, unknown>> => {
  const moveParams = ctx.moveParams;
  for (const key in moveParams) {
    void key;
    return { ...moveParams, ...bindings };
  }
  return bindings;
};

const createCompiledEvalContext = (
  state: GameState,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
): ReturnType<typeof createEvalContext> => createEvalContext({
  def: ctx.def,
  adjacencyGraph: ctx.adjacencyGraph,
  runtimeTableIndex: ctx.runtimeTableIndex,
  state,
  activePlayer: ctx.activePlayer,
  actorPlayer: ctx.actorPlayer,
  bindings: resolveCompiledBindings(bindings, ctx),
  resources: ctx.resources,
});

const evalCompiledValue = (
  expr: ValueExpr | NumericValueExpr,
  state: GameState,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
): unknown => evalValue(expr, createCompiledEvalContext(state, bindings, ctx));

const toReference = (
  pattern: Exclude<SimpleValuePattern | SimpleNumericValuePattern, { readonly kind: 'literal' | 'binding' }>,
): Reference => {
  if (pattern.kind === 'gvar') {
    return { _t: VALUE_EXPR_TAG.REF, ref: 'gvar', var: pattern.varName } as Reference;
  }

  return {
    _t: VALUE_EXPR_TAG.REF,
    ref: 'pvar',
    player: pattern.player,
    var: pattern.varName,
  } as Reference;
};

const emitVarChangeArtifacts = (
  state: GameState,
  ctx: CompiledEffectContext,
  endpoint: Parameters<typeof toTraceVarChangePayload>[0],
  oldValue: number | boolean,
  newValue: number | boolean,
): ReturnType<typeof toVarChangedEvent> | undefined => {
  const evalCtx = createCompiledExecutionContext(state, { state: state.rng }, {}, ctx);
  const tracePayload = toTraceVarChangePayload(endpoint, oldValue, newValue);
  if (!emitVarChangeTraceIfChanged(evalCtx, tracePayload)) {
    return undefined;
  }

  return toVarChangedEvent(endpoint, oldValue, newValue);
};

const countEffectNodes = (effects: readonly EffectAST[]): number => {
  let total = 0;
  for (const effect of effects) {
    total += 1;
    if ('if' in effect) {
      total += countEffectNodes(effect.if.then);
      if (effect.if.else !== undefined) {
        total += countEffectNodes(effect.if.else);
      }
    }
    if ('forEach' in effect) {
      total += countEffectNodes(effect.forEach.effects);
      if (effect.forEach.in !== undefined) {
        total += countEffectNodes(effect.forEach.in);
      }
    }
    if ('let' in effect) {
      total += countEffectNodes(effect.let.in);
    }
  }
  return total;
};

const executeEffectList = (
  effects: readonly EffectAST[],
  fragment: CompiledEffectFragment | null,
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
): EffectResult => {
  if (fragment !== null) {
    return fragment.execute(state, rng, bindings, ctx);
  }

  const env = buildEffectEnvFromCompiledCtx(
    ctx,
    ctx.resources.collector,
    { source: 'engineRuntime' as const, player: ctx.activePlayer, ownershipEnforcement: 'strict' as const },
    'execution',
  );
  const cursor: EffectCursor = {
    state,
    rng,
    bindings,
    decisionScope: ctx.decisionScope ?? emptyScope(),
    ...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath }),
    ...(ctx.tracker === undefined ? {} : { tracker: ctx.tracker }),
  };
  const budget = createEffectBudgetState(env);
  return applyEffectsWithBudgetState(effects, env, cursor, budget);
};

const normalizeBranchResult = (
  result: EffectResult,
  bindings: Readonly<Record<string, unknown>>,
  decisionScope: NonNullable<CompiledEffectContext['decisionScope']>,
): EffectResult => ({
  state: result.state,
  rng: result.rng,
  ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
  bindings: result.bindings ?? bindings,
  decisionScope: result.decisionScope ?? decisionScope,
  ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
});

const executeCompiledDelegate = (
  effectType: string,
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
  handler: (
    env: ReturnType<typeof toEffectEnv>,
    cursor: ReturnType<typeof toEffectCursor>,
  ) => EffectResult,
): EffectResult => {
  if (ctx.effectBudget !== undefined) {
    consumeEffectBudget(ctx.effectBudget, effectType);
  }

  const effectCtx = createCompiledExecutionContext(state, rng, bindings, ctx);
  const cursor: EffectCursor = {
    state,
    rng,
    bindings,
    decisionScope: ctx.decisionScope ?? emptyScope(),
    ...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath }),
    ...(ctx.tracker === undefined ? {} : { tracker: ctx.tracker }),
  };
  const result = handler(toEffectEnv(effectCtx), cursor);
  return {
    state: result.state,
    rng: result.rng,
    ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
    bindings: result.bindings ?? cursor.bindings,
    decisionScope: result.decisionScope ?? cursor.decisionScope,
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
};

export const compileValueAccessor = (
  pattern: SimpleValuePattern | SimpleNumericValuePattern,
): CompiledValueAccessor => {
  if (pattern.kind === 'literal') {
    return () => pattern.value;
  }

  if (pattern.kind === 'binding') {
    const reference: Reference = { _t: VALUE_EXPR_TAG.REF, ref: 'binding', name: pattern.name, ...(pattern.displayName === undefined ? {} : { displayName: pattern.displayName }) } as Reference;
    return (state, bindings, ctx) => resolveRef(reference, createCompiledEvalContext(state, bindings, ctx));
  }

  const reference = toReference(pattern);
  return (state, bindings, ctx) => resolveRef(reference, createCompiledEvalContext(state, bindings, ctx));
};

const compileSimpleComparison = (pattern: SimpleComparisonPattern): CompiledConditionEvaluator => {
  const left = compileValueAccessor(pattern.left);
  const right = compileValueAccessor(pattern.right);

  switch (pattern.op) {
    case '==':
      return (state, bindings, ctx) => left(state, bindings, ctx) === right(state, bindings, ctx);
    case '!=':
      return (state, bindings, ctx) => left(state, bindings, ctx) !== right(state, bindings, ctx);
    case '<':
      return (state, bindings, ctx) =>
        expectOrderingNumber(left(state, bindings, ctx), 'left', pattern)
        < expectOrderingNumber(right(state, bindings, ctx), 'right', pattern);
    case '<=':
      return (state, bindings, ctx) =>
        expectOrderingNumber(left(state, bindings, ctx), 'left', pattern)
        <= expectOrderingNumber(right(state, bindings, ctx), 'right', pattern);
    case '>':
      return (state, bindings, ctx) =>
        expectOrderingNumber(left(state, bindings, ctx), 'left', pattern)
        > expectOrderingNumber(right(state, bindings, ctx), 'right', pattern);
    case '>=':
      return (state, bindings, ctx) =>
        expectOrderingNumber(left(state, bindings, ctx), 'left', pattern)
        >= expectOrderingNumber(right(state, bindings, ctx), 'right', pattern);
  }
};

const compileLogicalCondition = (pattern: LogicalConditionPattern): CompiledConditionEvaluator => {
  const evaluators = pattern.args.map((entry) => compileConditionEvaluator(entry));
  if (pattern.op === 'and') {
    return (state, bindings, ctx) => evaluators.every((entry) => entry(state, bindings, ctx));
  }
  return (state, bindings, ctx) => evaluators.some((entry) => entry(state, bindings, ctx));
};

export const compileConditionEvaluator = (
  pattern: CompilableConditionPattern,
): CompiledConditionEvaluator =>
  pattern.kind === 'comparison'
    ? compileSimpleComparison(pattern)
    : compileLogicalCondition(pattern);

export const compileSetVar = (desc: SetVarPattern): CompiledEffectFragment => {
  const valueAccessor = compileValueAccessor(desc.value);

  return {
    nodeCount: 1,
    execute: (state, rng, bindings, ctx) => {
      if (ctx.effectBudget !== undefined) {
        consumeEffectBudget(ctx.effectBudget, 'setVar');
      }
      const resolvedBindings = resolveCompiledBindings(bindings, ctx);
      const execCtx = createCompiledExecutionContext(state, rng, bindings, ctx);
      const evalCtx = resolvedBindings === bindings ? execCtx : { ...execCtx, bindings: resolvedBindings };
      const endpoint = resolveRuntimeScopedEndpoint(
        desc.target.scope === 'global'
          ? { scope: 'global', var: desc.target.varName }
          : { scope: 'pvar', player: desc.target.player, var: desc.target.varName },
        evalCtx,
        {
          code: EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
          effectType: 'setVar',
          pvarCardinalityMessage: 'Per-player variable operations require exactly one resolved player',
          pvarResolutionFailureMessage: 'setVar pvar selector resolution failed',
          zoneResolutionFailureMessage: 'setVar zoneVar selector resolution failed',
          context: { endpoint: desc.target },
        },
      );
      const variableDef = resolveScopedVarDef(
        execCtx,
        { scope: desc.target.scope, var: endpoint.var },
        'setVar',
        EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
      );
      const currentValue =
        variableDef.type === 'int'
          ? readScopedIntVarValue(execCtx, endpoint, 'setVar', EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED)
          : readScopedVarValue(execCtx, endpoint, 'setVar', EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED);
      const resolvedValue = valueAccessor(state, bindings, ctx);
      const nextValue =
        variableDef.type === 'int'
          ? clampIntVarValue(expectInteger(resolvedValue, 'setVar', 'value'), variableDef as IntVariableDef)
          : expectBoolean(resolvedValue, 'setVar', 'value');
      const emittedEvent = emitVarChangeArtifacts(execCtx.state, ctx, endpoint, currentValue, nextValue);
      if (emittedEvent === undefined) {
        return { state, rng, bindings };
      }

      const writes = [
        endpoint.scope === 'zone'
          ? toScopedVarWrite(endpoint, expectInteger(nextValue, 'setVar', 'value'))
          : toScopedVarWrite(endpoint, nextValue),
      ];
      const tracker = ctx.tracker;
      if (tracker) {
        writeScopedVarsMutable(state as MutableGameState, writes, tracker);
        return { state, rng, emittedEvents: [emittedEvent], bindings };
      }

      return {
        state: writeScopedVarsToState(state, writes),
        rng,
        emittedEvents: [emittedEvent],
        bindings,
      };
    },
  };
};

export const compileAddVar = (desc: AddVarPattern): CompiledEffectFragment => {
  const deltaAccessor = compileValueAccessor(desc.delta);

  return {
    nodeCount: 1,
    execute: (state, rng, bindings, ctx) => {
      if (ctx.effectBudget !== undefined) {
        consumeEffectBudget(ctx.effectBudget, 'addVar');
      }
      const resolvedBindings = resolveCompiledBindings(bindings, ctx);
      const execCtx = createCompiledExecutionContext(state, rng, bindings, ctx);
      const evalCtx = resolvedBindings === bindings ? execCtx : { ...execCtx, bindings: resolvedBindings };
      const endpoint = resolveRuntimeScopedEndpoint(
        desc.target.scope === 'global'
          ? { scope: 'global', var: desc.target.varName }
          : { scope: 'pvar', player: desc.target.player, var: desc.target.varName },
        evalCtx,
        {
          code: EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
          effectType: 'addVar',
          pvarCardinalityMessage: 'Per-player variable operations require exactly one resolved player',
          pvarResolutionFailureMessage: 'addVar pvar selector resolution failed',
          zoneResolutionFailureMessage: 'addVar zoneVar selector resolution failed',
          context: { endpoint: desc.target },
        },
      );
      const variableDef = resolveScopedVarDef(
        execCtx,
        { scope: desc.target.scope, var: endpoint.var },
        'addVar',
        EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
      );
      if (variableDef.type !== 'int') {
        throw effectRuntimeError(EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED, 'addVar cannot target non-int variable', {
          effectType: 'addVar',
          scope: desc.target.scope,
          var: endpoint.var,
          actualType: variableDef.type,
        });
      }
      const currentValue = readScopedIntVarValue(execCtx, endpoint, 'addVar', EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED);
      const evaluatedDelta = expectInteger(deltaAccessor(state, bindings, ctx), 'addVar', 'delta');
      const nextValue = clampIntVarValue(currentValue + evaluatedDelta, variableDef);
      const emittedEvent = emitVarChangeArtifacts(execCtx.state, ctx, endpoint, currentValue, nextValue);
      if (emittedEvent === undefined) {
        return { state, rng, bindings };
      }

      const writes = [toScopedVarWrite(endpoint, nextValue)];
      const tracker = ctx.tracker;
      if (tracker) {
        writeScopedVarsMutable(state as MutableGameState, writes, tracker);
        return { state, rng, emittedEvents: [emittedEvent], bindings };
      }

      return {
        state: writeScopedVarsToState(state, writes),
        rng,
        emittedEvents: [emittedEvent],
        bindings,
      };
    },
  };
};

export const compileIf = (
  desc: IfPattern,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  const conditionEvaluator = compileConditionEvaluator(desc.condition);
  const thenFragment = compileBody(desc.thenEffects);
  const elseFragment = desc.elseEffects.length > 0 ? compileBody(desc.elseEffects) : null;

  return {
    nodeCount: 1 + countEffectNodes(desc.thenEffects) + countEffectNodes(desc.elseEffects),
    execute: (state, rng, bindings, ctx) => {
      if (ctx.effectBudget !== undefined) {
        consumeEffectBudget(ctx.effectBudget, 'if');
      }
      const decisionScope = ctx.decisionScope ?? emptyScope();
      if (conditionEvaluator(state, bindings, ctx)) {
        return normalizeBranchResult(
          executeEffectList(desc.thenEffects, thenFragment, state, rng, bindings, ctx),
          bindings,
          decisionScope,
        );
      }

      if (desc.elseEffects.length > 0) {
        return normalizeBranchResult(
          executeEffectList(desc.elseEffects, elseFragment, state, rng, bindings, ctx),
          bindings,
          decisionScope,
        );
      }

      return { state, rng, bindings, decisionScope };
    },
  };
};

export const compileForEachPlayers = (
  desc: ForEachPlayersPattern,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  const bodyFragment = compileBody(desc.effects);
  const inFragment = desc.inEffects === undefined ? null : compileBody(desc.inEffects);

  return {
    nodeCount: 1 + countEffectNodes(desc.effects) + countEffectNodes(desc.inEffects ?? []),
    execute: (state, rng, bindings, ctx) => {
      if (ctx.effectBudget !== undefined) {
        consumeEffectBudget(ctx.effectBudget, 'forEach');
      }
      const evalCtx = createCompiledEvalContext(state, bindings, ctx);
      const limit = resolveControlFlowIterationLimit('forEach', desc.limit, evalCtx, (evaluatedLimit) => {
        throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED, 'forEach.limit must evaluate to a non-negative integer', {
          effectType: 'forEach',
          limit: evaluatedLimit,
        });
      });
      const queryResult = evalQuery({ query: 'players' }, evalCtx);
      const boundedItems = queryResult.slice(0, limit);

      let currentState = state;
      let currentRng = rng;
      let currentDecisionScope = ctx.decisionScope ?? emptyScope();
      const parentIterationPath = currentDecisionScope.iterationPath;
      const emittedEvents: TriggerEvent[] = [];

      for (let index = 0; index < boundedItems.length; index += 1) {
        const iterationScope = withIterationSegment(
          rebaseIterationPath(currentDecisionScope, parentIterationPath),
          index,
        );
        const iterationResult = executeEffectList(
          desc.effects,
          bodyFragment,
          currentState,
          currentRng,
          { ...bindings, [desc.bind]: boundedItems[index] },
          { ...ctx, decisionScope: iterationScope },
        );
        currentState = iterationResult.state;
        currentRng = iterationResult.rng;
        currentDecisionScope = iterationResult.decisionScope ?? currentDecisionScope;
        for (const event of iterationResult.emittedEvents ?? []) {
          emittedEvents.push(event);
        }
        if (iterationResult.pendingChoice !== undefined) {
          return {
            state: currentState,
            rng: currentRng,
            emittedEvents,
            bindings,
            decisionScope: currentDecisionScope,
            pendingChoice: iterationResult.pendingChoice,
          };
        }
      }

      if (desc.countBind !== undefined && desc.inEffects !== undefined) {
        const countResult = executeEffectList(
          desc.inEffects,
          inFragment,
          currentState,
          currentRng,
          { ...bindings, [desc.countBind]: boundedItems.length },
          { ...ctx, decisionScope: currentDecisionScope },
        );
        currentState = countResult.state;
        currentRng = countResult.rng;
        currentDecisionScope = countResult.decisionScope ?? currentDecisionScope;
        for (const event of countResult.emittedEvents ?? []) {
          emittedEvents.push(event);
        }
        if (countResult.pendingChoice !== undefined) {
          return {
            state: currentState,
            rng: currentRng,
            emittedEvents,
            bindings,
            decisionScope: currentDecisionScope,
            pendingChoice: countResult.pendingChoice,
          };
        }
      }

      return {
        state: currentState,
        rng: currentRng,
        emittedEvents,
        bindings,
        decisionScope: currentDecisionScope,
      };
    },
  };
};

export const compileGotoPhaseExact = (desc: GotoPhaseExactPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'gotoPhaseExact',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyGotoPhaseExact(
      gotoPhaseExactBuilder({ phase: desc.phase }),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled gotoPhaseExact'); },
    ),
  ),
});

export const compileSetActivePlayer = (desc: SetActivePlayerPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'setActivePlayer',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applySetActivePlayer(
      setActivePlayerBuilder({ player: desc.player }),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled setActivePlayer'); },
    ),
  ),
});

export const compileAdvancePhase = (_desc: AdvancePhasePattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'advancePhase',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyAdvancePhase(
      advancePhaseBuilder({}),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled advancePhase'); },
    ),
  ),
});

export const compilePopInterruptPhase = (_desc: PopInterruptPhasePattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'popInterruptPhase',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyPopInterruptPhase(
      popInterruptPhaseBuilder({}),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled popInterruptPhase'); },
    ),
  ),
});

export const compileBindValue = (desc: BindValuePattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => {
    if (ctx.effectBudget !== undefined) {
      consumeEffectBudget(ctx.effectBudget, 'bindValue');
    }
    const value = evalCompiledValue(desc.value, state, bindings, ctx);
    return {
      state,
      rng,
      emittedEvents: [],
      bindings: {
        ...bindings,
        [desc.bind]: value,
      },
    };
  },
});

export const compileTransferVar = (desc: TransferVarPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'transferVar',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyTransferVar(
      { _k: EFFECT_KIND_TAG.transferVar, transferVar: desc.payload },
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled transferVar'); },
    ),
  ),
});

export const compileSetMarker = (desc: SetMarkerPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'setMarker',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applySetMarker(
      { _k: EFFECT_KIND_TAG.setMarker, setMarker: desc.payload },
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled setMarker'); },
    ),
  ),
});

export const compileShiftMarker = (desc: ShiftMarkerPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'shiftMarker',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyShiftMarker(
      { _k: EFFECT_KIND_TAG.shiftMarker, shiftMarker: desc.payload },
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled shiftMarker'); },
    ),
  ),
});

export const compileSetGlobalMarker = (desc: SetGlobalMarkerPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'setGlobalMarker',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applySetGlobalMarker(
      { _k: EFFECT_KIND_TAG.setGlobalMarker, setGlobalMarker: desc.payload },
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled setGlobalMarker'); },
    ),
  ),
});

export const compileFlipGlobalMarker = (desc: FlipGlobalMarkerPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'flipGlobalMarker',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyFlipGlobalMarker(
      { _k: EFFECT_KIND_TAG.flipGlobalMarker, flipGlobalMarker: desc.payload },
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled flipGlobalMarker'); },
    ),
  ),
});

export const compileShiftGlobalMarker = (desc: ShiftGlobalMarkerPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'shiftGlobalMarker',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyShiftGlobalMarker(
      { _k: EFFECT_KIND_TAG.shiftGlobalMarker, shiftGlobalMarker: desc.payload },
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled shiftGlobalMarker'); },
    ),
  ),
});

export const compileLet = (
  desc: LetPattern,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  const bodyFragment = compileBody(desc.inEffects);

  return {
    nodeCount: 1 + countEffectNodes(desc.inEffects),
    execute: (state, rng, bindings, ctx) => {
      if (ctx.effectBudget !== undefined) {
        consumeEffectBudget(ctx.effectBudget, 'let');
      }
      const evaluatedValue = evalCompiledValue(desc.value, state, bindings, ctx);
      const nestedBindings = {
        ...bindings,
        [desc.bind]: evaluatedValue,
      };
      const nestedResult = executeEffectList(desc.inEffects, bodyFragment, state, rng, nestedBindings, ctx);
      if (nestedResult.pendingChoice !== undefined) {
        return {
          state: nestedResult.state,
          rng: nestedResult.rng,
          ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
          ...(nestedResult.decisionScope === undefined ? {} : { decisionScope: nestedResult.decisionScope }),
          bindings,
          pendingChoice: nestedResult.pendingChoice,
        };
      }

      const resolvedNestedBindings = nestedResult.bindings ?? nestedBindings;
      const exportedBindings: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(resolvedNestedBindings)) {
        if (name === desc.bind || !name.startsWith('$')) {
          continue;
        }
        exportedBindings[name] = value;
      }

      return {
        state: nestedResult.state,
        rng: nestedResult.rng,
        ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
        ...(nestedResult.decisionScope === undefined ? {} : { decisionScope: nestedResult.decisionScope }),
        bindings: {
          ...bindings,
          ...exportedBindings,
        },
      };
    },
  };
};

export const compileMoveToken = (desc: MoveTokenPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'moveToken',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyMoveToken(
      moveTokenBuilder(desc.payload),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled moveToken'); },
    ),
  ),
});

export const compileMoveAll = (desc: MoveAllPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'moveAll',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyMoveAll(
      moveAllBuilder(desc.payload),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled moveAll'); },
    ),
  ),
});

export const compileMoveTokenAdjacent = (desc: MoveTokenAdjacentPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'moveTokenAdjacent',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyMoveTokenAdjacent(
      moveTokenAdjacentBuilder(desc.payload),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled moveTokenAdjacent'); },
    ),
  ),
});

export const compileDraw = (desc: DrawPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'draw',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyDraw(
      drawBuilder(desc.payload),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled draw'); },
    ),
  ),
});

export const compileShuffle = (desc: ShufflePattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'shuffle',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyShuffle(
      shuffleBuilder(desc.payload),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled shuffle'); },
    ),
  ),
});

export const compileCreateToken = (desc: CreateTokenPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'createToken',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyCreateToken(
      createTokenBuilder(desc.payload),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled createToken'); },
    ),
  ),
});

export const compileDestroyToken = (desc: DestroyTokenPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'destroyToken',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applyDestroyToken(
      destroyTokenBuilder(desc.payload),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled destroyToken'); },
    ),
  ),
});

export const compileSetTokenProp = (desc: SetTokenPropPattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    'setTokenProp',
    state,
    rng,
    bindings,
    ctx,
    (env, cursor) => applySetTokenProp(
      setTokenPropBuilder(desc.payload),
      env,
      cursor,
      { remaining: 10_000, max: 10_000 },
      () => { throw new Error('applyBatch not available in compiled setTokenProp'); },
    ),
  ),
});

export const compilePatternDescriptor = (
  desc: PatternDescriptor,
  compileBody: BodyCompiler,
): CompiledEffectFragment | null => {
  switch (desc.kind) {
    case 'setVar':
      return compileSetVar(desc);
    case 'addVar':
      return compileAddVar(desc);
    case 'if':
      return compileIf(desc, compileBody);
    case 'forEachPlayers':
      return compileForEachPlayers(desc, compileBody);
    case 'gotoPhaseExact':
      return compileGotoPhaseExact(desc);
    case 'setActivePlayer':
      return compileSetActivePlayer(desc);
    case 'advancePhase':
      return compileAdvancePhase(desc);
    case 'popInterruptPhase':
      return compilePopInterruptPhase(desc);
    case 'bindValue':
      return compileBindValue(desc);
    case 'transferVar':
      return compileTransferVar(desc);
    case 'setMarker':
      return compileSetMarker(desc);
    case 'shiftMarker':
      return compileShiftMarker(desc);
    case 'setGlobalMarker':
      return compileSetGlobalMarker(desc);
    case 'flipGlobalMarker':
      return compileFlipGlobalMarker(desc);
    case 'shiftGlobalMarker':
      return compileShiftGlobalMarker(desc);
    case 'let':
      return compileLet(desc, compileBody);
    case 'moveToken':
      return compileMoveToken(desc);
    case 'moveAll':
      return compileMoveAll(desc);
    case 'moveTokenAdjacent':
      return compileMoveTokenAdjacent(desc);
    case 'draw':
      return compileDraw(desc);
    case 'shuffle':
      return compileShuffle(desc);
    case 'createToken':
      return compileCreateToken(desc);
    case 'destroyToken':
      return compileDestroyToken(desc);
    case 'setTokenProp':
      return compileSetTokenProp(desc);
    default:
      return null;
  }
};
