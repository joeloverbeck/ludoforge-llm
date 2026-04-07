import { rebaseIterationPath, withIterationSegment } from './decision-scope.js';
import { combinations, countCombinations } from './combinatorics.js';
import { createMutableReadScope } from './effect-context.js';
import type { EffectCursor, MutableReadScope, NormalizedEffectResult, PartialEffectResult } from './effect-context.js';
import { createEvalContext } from './eval-context.js';
import { evalCondition } from './eval-condition.js';
import { unwrapEvalCondition, unwrapEvalQuery } from './eval-result.js';
import { evalQuery } from './eval-query.js';
import { evalValue } from './eval-value.js';
import { typeMismatchError } from './eval-error.js';
import { buildEffectEnvFromCompiledCtx, createExecutionContextFromCompiled } from './effect-compiler-runtime.js';
import { applyEffectsWithBudgetState, consumeEffectBudget } from './effect-dispatch.js';
import type { MutableGameState } from './state-draft.js';
import { buildForEachTraceEntry, buildReduceTraceEntry } from './control-flow-trace.js';
import type { EffectBudgetState } from './effects-control.js';
import {
  type AddVarPattern,
  type AdvancePhasePattern,
  type BindValuePattern,
  type ChooseNPattern,
  type ChooseOnePattern,
  type ConcealPattern,
  type CompilableConditionPattern,
  type CreateTokenPattern,
  type DestroyTokenPattern,
  type DrawPattern,
  type EvaluateSubsetPattern,
  type FlipGlobalMarkerPattern,
  type ForEachPattern,
  type GenericConditionPattern,
  type GotoPhaseExactPattern,
  type IfPattern,
  type LetPattern,
  type LogicalConditionPattern,
  type MoveAllPattern,
  type MoveTokenAdjacentPattern,
  type MoveTokenPattern,
  type PatternDescriptor,
  type PopInterruptPhasePattern,
  type PushInterruptPhasePattern,
  type ReducePattern,
  type RevealPattern,
  type RemoveByPriorityPattern,
  type RollRandomPattern,
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
import type { CompiledExecutionContext, CompiledEffectFragmentFn } from './effect-compiler-types.js';
import { effectRuntimeError } from './effect-error.js';
import {
  applyChooseN,
  applyChooseOne,
  applyFlipGlobalMarker,
  applySetGlobalMarker,
  applySetMarker,
  applyShiftGlobalMarker,
  applyShiftMarker,
} from './effects-choice.js';
import { applyConceal, applyReveal } from './effects-reveal.js';
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
import { applyAdvancePhase, applyGotoPhaseExact, applyPopInterruptPhase, applyPushInterruptPhase } from './effects-turn-flow.js';
import { applyAddVar, applySetActivePlayer, applySetVar } from './effects-var.js';
import { emitTrace } from './execution-collector.js';
import {
  addVar as addVarBuilder,
  advancePhase as advancePhaseBuilder,
  chooseN as chooseNBuilder,
  chooseOne as chooseOneBuilder,
  conceal as concealBuilder,
  createToken as createTokenBuilder,
  destroyToken as destroyTokenBuilder,
  draw as drawBuilder,
  gotoPhaseExact as gotoPhaseExactBuilder,
  moveAll as moveAllBuilder,
  moveToken as moveTokenBuilder,
  moveTokenAdjacent as moveTokenAdjacentBuilder,
  pushInterruptPhase as pushInterruptPhaseBuilder,
  popInterruptPhase as popInterruptPhaseBuilder,
  reveal as revealBuilder,
  setVar as setVarBuilder,
  setActivePlayer as setActivePlayerBuilder,
  setTokenProp as setTokenPropBuilder,
  shuffle as shuffleBuilder,
} from './ast-builders.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import { resolveRef } from './resolve-ref.js';
import { resolveRuntimeTokenBindingValue } from './token-binding.js';
import { resolveTraceProvenance } from './trace-provenance.js';
import { nextInt } from './prng.js';
import {
  readScopedIntVarValue,
  readScopedVarValue,
  resolveRuntimeScopedEndpoint,
  resolveScopedVarDef,
  toScopedVarWrite,
  writeScopedVarsMutable,
} from './scoped-var-runtime-access.js';
import { toTraceVarChangePayload, toVarChangedEvent } from './scoped-var-runtime-mapping.js';
import { emitVarChangeTraceIfChanged } from './var-change-trace.js';
import { clampIntVarValue } from './var-runtime-utils.js';
import { resolveControlFlowIterationLimit } from './control-flow-limit.js';
import { EFFECT_KIND_TAG, VALUE_EXPR_TAG } from './types.js';
import type { EffectAST, EffectTraceProvenance, GameState, IntVariableDef, NumericValueExpr, Reference, Rng, TriggerEvent, ValueExpr } from './types.js';

const MAX_SUBSET_COMBINATIONS = 10_000;

export interface CompiledEffectFragment {
  readonly execute: CompiledEffectFragmentFn;
  readonly nodeCount: number;
}

export type CompiledValueAccessor = (
  state: GameState,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledExecutionContext,
) => unknown;

export type CompiledConditionEvaluator = (
  state: GameState,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledExecutionContext,
) => boolean;

export type BodyCompiler = (effects: readonly EffectAST[]) => CompiledEffectFragment;

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

const expectSafeInteger = (value: unknown, effectType: 'rollRandom' | 'evaluateSubset', field: 'min' | 'max' | 'subsetSize' | 'scoreExpr'): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(value)) {
    throw effectRuntimeError(
      effectType === 'rollRandom'
        ? EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED
        : EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED,
      `${effectType}.${field} must evaluate to a safe integer`,
      {
        effectType,
        field,
        actualType: typeof value,
        value,
      },
    );
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
  ctx: Pick<CompiledExecutionContext, 'moveParams'>,
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
  ctx: CompiledExecutionContext,
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
  ctx: CompiledExecutionContext,
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
  ctx: CompiledExecutionContext,
  endpoint: Parameters<typeof toTraceVarChangePayload>[0],
  oldValue: number | boolean,
  newValue: number | boolean,
): ReturnType<typeof toVarChangedEvent> | undefined => {
  const evalCtx = createExecutionContextFromCompiled(state, { state: state.rng }, {}, ctx);
  const tracePayload = toTraceVarChangePayload(endpoint, oldValue, newValue);
  if (!emitVarChangeTraceIfChanged({
    collector: evalCtx.collector,
    state,
    traceContext: ctx.traceContext,
    effectPath: ctx.effectPath,
  }, tracePayload)) {
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
    if ('reduce' in effect) {
      total += countEffectNodes(effect.reduce.in);
    }
    if ('rollRandom' in effect) {
      total += countEffectNodes(effect.rollRandom.in);
    }
    if ('evaluateSubset' in effect) {
      total += countEffectNodes(effect.evaluateSubset.compute);
      total += countEffectNodes(effect.evaluateSubset.in);
    }
    if ('removeByPriority' in effect && effect.removeByPriority.in !== undefined) {
      total += countEffectNodes(effect.removeByPriority.in);
    }
  }
  return total;
};

const compiledTraceProvenance = (
  state: GameState,
  ctx: CompiledExecutionContext,
): EffectTraceProvenance => resolveTraceProvenance({
  state,
  traceContext: ctx.traceContext,
  effectPath: ctx.effectPath,
});

const executeCompiledFragment = (
  fragment: CompiledEffectFragment,
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledExecutionContext,
): PartialEffectResult => fragment.execute(state, rng, bindings, ctx);

const normalizeBranchResult = (
  result: PartialEffectResult,
  bindings: Readonly<Record<string, unknown>>,
  decisionScope: CompiledExecutionContext['decisionScope'],
): NormalizedEffectResult => ({
  state: result.state,
  rng: result.rng,
  emittedEvents: result.emittedEvents ?? [],
  bindings: result.bindings ?? bindings,
  decisionScope: result.decisionScope ?? decisionScope,
  ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
});

const exportDollarBindings = (
  bindings: Readonly<Record<string, unknown>>,
  excludedNames: readonly string[],
): Record<string, unknown> => {
  const exportedBindings: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(bindings)) {
    if (excludedNames.includes(name) || !name.startsWith('$')) {
      continue;
    }
    exportedBindings[name] = value;
  }
  return exportedBindings;
};

const executeCompiledDelegate = (
  effectType: string,
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledExecutionContext,
  handler: (
    env: ReturnType<typeof buildEffectEnvFromCompiledCtx>,
    cursor: EffectCursor,
    scope: MutableReadScope,
  ) => PartialEffectResult,
): PartialEffectResult => {
  consumeEffectBudget(ctx.effectBudget, effectType);
  const effectCtx = createExecutionContextFromCompiled(state, rng, bindings, ctx);
  const cursor: EffectCursor = {
    state,
    rng,
    bindings,
    decisionScope: ctx.decisionScope,
    effectPath: ctx.effectPath,
    tracker: ctx.tracker,
  };
  const env = buildEffectEnvFromCompiledCtx(ctx, effectCtx.collector);
  const result = handler(
    env,
    cursor,
    createMutableReadScope(env, cursor),
  );
  return {
    state: result.state,
    rng: result.rng,
    ...(result.emittedEvents === undefined ? {} : { emittedEvents: result.emittedEvents }),
    bindings: result.bindings ?? cursor.bindings,
    ...(result.decisionScope === undefined ? {} : { decisionScope: result.decisionScope }),
    ...(result.pendingChoice === undefined ? {} : { pendingChoice: result.pendingChoice }),
  };
};

const createCompiledDelegateBudget = (): EffectBudgetState => ({
  remaining: 10_000,
  max: 10_000,
});

const unavailableCompiledApplyBatch = (
  effectType: string,
): typeof applyEffectsWithBudgetState =>
  () => { throw new Error(`applyBatch not available in compiled ${effectType}`); };

type CompiledDelegateInvoker<TEffect extends EffectAST> = (
  effect: TEffect,
  env: ReturnType<typeof buildEffectEnvFromCompiledCtx>,
  cursor: EffectCursor,
  scope: MutableReadScope,
  budget: ReturnType<typeof createCompiledDelegateBudget>,
  applyBatch: typeof applyEffectsWithBudgetState,
) => PartialEffectResult;

const createCompiledDelegateLeafFragment = <TEffect extends EffectAST>(
  effectType: string,
  effect: TEffect,
  invoke: CompiledDelegateInvoker<TEffect>,
): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => executeCompiledDelegate(
    effectType,
    state,
    rng,
    bindings,
    ctx,
    (env, cursor, scope) => invoke(
      effect,
      env,
      cursor,
      scope,
      createCompiledDelegateBudget(),
      unavailableCompiledApplyBatch(effectType),
    ),
  ),
});

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

const compileGenericCondition = (pattern: GenericConditionPattern): CompiledConditionEvaluator =>
  (state, bindings, ctx) => unwrapEvalCondition(evalCondition(pattern.condition, createCompiledEvalContext(state, bindings, ctx)));

export const compileConditionEvaluator = (
  pattern: CompilableConditionPattern,
): CompiledConditionEvaluator =>
  pattern.kind === 'comparison'
    ? compileSimpleComparison(pattern)
    : pattern.kind === 'logical'
      ? compileLogicalCondition(pattern)
      : compileGenericCondition(pattern);

export const compileSetVar = (desc: SetVarPattern): CompiledEffectFragment => {
  if (desc.mode === 'delegate') {
    return createCompiledDelegateLeafFragment(
      'setVar',
      setVarBuilder(desc.payload),
      applySetVar,
    );
  }

  const valueAccessor = compileValueAccessor(desc.value);

  return {
    nodeCount: 1,
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'setVar');
      const resolvedBindings = resolveCompiledBindings(bindings, ctx);
      const execCtx = createExecutionContextFromCompiled(state, rng, bindings, ctx);
      const evalCtx = resolvedBindings === bindings ? execCtx : { ...execCtx, bindings: resolvedBindings };
      const endpoint = resolveRuntimeScopedEndpoint(
        desc.target.scope === 'global'
          ? { scope: 'global', var: desc.target.varName }
          : { scope: 'pvar', player: desc.target.player, var: desc.target.varName },
        evalCtx,
        execCtx.mode,
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
      writeScopedVarsMutable(state as MutableGameState, writes, ctx.tracker);
      return { state, rng, emittedEvents: [emittedEvent], bindings };
    },
  };
};

export const compileAddVar = (desc: AddVarPattern): CompiledEffectFragment => {
  if (desc.mode === 'delegate') {
    return createCompiledDelegateLeafFragment(
      'addVar',
      addVarBuilder(desc.payload),
      applyAddVar,
    );
  }

  const deltaAccessor = compileValueAccessor(desc.delta);

  return {
    nodeCount: 1,
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'addVar');
      const resolvedBindings = resolveCompiledBindings(bindings, ctx);
      const execCtx = createExecutionContextFromCompiled(state, rng, bindings, ctx);
      const evalCtx = resolvedBindings === bindings ? execCtx : { ...execCtx, bindings: resolvedBindings };
      const endpoint = resolveRuntimeScopedEndpoint(
        desc.target.scope === 'global'
          ? { scope: 'global', var: desc.target.varName }
          : { scope: 'pvar', player: desc.target.player, var: desc.target.varName },
        evalCtx,
        execCtx.mode,
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
      writeScopedVarsMutable(state as MutableGameState, writes, ctx.tracker);
      return { state, rng, emittedEvents: [emittedEvent], bindings };
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
      consumeEffectBudget(ctx.effectBudget, 'if');
      const decisionScope = ctx.decisionScope;
      if (conditionEvaluator(state, bindings, ctx)) {
        return normalizeBranchResult(
          executeCompiledFragment(thenFragment, state, rng, bindings, ctx),
          bindings,
          decisionScope,
        );
      }

      if (desc.elseEffects.length > 0) {
        return normalizeBranchResult(
          executeCompiledFragment(elseFragment!, state, rng, bindings, ctx),
          bindings,
          decisionScope,
        );
      }

      return { state, rng, bindings, decisionScope };
    },
  };
};

export const compileForEach = (
  desc: ForEachPattern,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  const bodyFragment = compileBody(desc.effects);
  const inFragment = desc.inEffects === undefined ? null : compileBody(desc.inEffects);

  return {
    nodeCount: 1 + countEffectNodes(desc.effects) + countEffectNodes(desc.inEffects ?? []),
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'forEach');
      const evalCtx = createCompiledEvalContext(state, bindings, ctx);
      const limit = resolveControlFlowIterationLimit('forEach', desc.limit, evalCtx, (evaluatedLimit) => {
        throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED, 'forEach.limit must evaluate to a non-negative integer', {
          effectType: 'forEach',
          limit: evaluatedLimit,
        });
      });
      const queryResult = unwrapEvalQuery(evalQuery(desc.over, evalCtx));
      const boundedItems = queryResult.slice(0, limit);

      let currentState = state;
      let currentRng = rng;
      let currentDecisionScope = ctx.decisionScope;
      const parentIterationPath = currentDecisionScope.iterationPath;
      const emittedEvents: TriggerEvent[] = [];

      for (let index = 0; index < boundedItems.length; index += 1) {
        const iterationScope = withIterationSegment(
          rebaseIterationPath(currentDecisionScope, parentIterationPath),
          index,
        );
        const iterationResult = executeCompiledFragment(
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

      if (ctx.resources.collector.trace !== null) {
        emitTrace(ctx.resources.collector, buildForEachTraceEntry({
          bind: desc.bind,
          matchCount: queryResult.length,
          iteratedCount: boundedItems.length,
          explicitLimit: desc.limit !== undefined,
          resolvedLimit: limit,
          provenance: compiledTraceProvenance(state, ctx),
        }));
      }

      if (desc.countBind !== undefined && desc.inEffects !== undefined) {
        const countResult = executeCompiledFragment(
          inFragment!,
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

export const compileReduce = (
  desc: ReducePattern,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  const inFragment = compileBody(desc.payload.in);

  return {
    nodeCount: 1 + countEffectNodes(desc.payload.in),
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'reduce');
      const evalCtx = createCompiledEvalContext(state, bindings, ctx);
      const limit = resolveControlFlowIterationLimit('reduce', desc.payload.limit, evalCtx, (evaluatedLimit) => {
        throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED, 'reduce.limit must evaluate to a non-negative integer', {
          effectType: 'reduce',
          limit: evaluatedLimit,
        });
      });
      const queryResult = unwrapEvalQuery(evalQuery(desc.payload.over, evalCtx));
      const boundedItems = queryResult.slice(0, limit);

      let accumulator = evalCompiledValue(desc.payload.initial, state, bindings, ctx);
      for (const item of boundedItems) {
        accumulator = evalCompiledValue(desc.payload.next, state, {
          ...bindings,
          [desc.payload.itemBind]: item,
          [desc.payload.accBind]: accumulator,
        }, ctx);
      }

      if (ctx.resources.collector.trace !== null) {
        emitTrace(ctx.resources.collector, buildReduceTraceEntry({
          itemBind: desc.payload.itemBind,
          accBind: desc.payload.accBind,
          resultBind: desc.payload.resultBind,
          ...(desc.payload.itemMacroOrigin === undefined ? {} : { itemMacroOrigin: desc.payload.itemMacroOrigin }),
          ...(desc.payload.accMacroOrigin === undefined ? {} : { accMacroOrigin: desc.payload.accMacroOrigin }),
          ...(desc.payload.resultMacroOrigin === undefined ? {} : { resultMacroOrigin: desc.payload.resultMacroOrigin }),
          matchCount: queryResult.length,
          iteratedCount: boundedItems.length,
          explicitLimit: desc.payload.limit !== undefined,
          resolvedLimit: limit,
          provenance: compiledTraceProvenance(state, ctx),
        }));
      }

      const continuationBindings = {
        ...bindings,
        [desc.payload.resultBind]: accumulator,
      };
      const continuationResult = executeCompiledFragment(
        inFragment,
        state,
        rng,
        continuationBindings,
        ctx,
      );
      if (continuationResult.pendingChoice !== undefined) {
        return {
          state: continuationResult.state,
          rng: continuationResult.rng,
          ...(continuationResult.emittedEvents === undefined ? {} : { emittedEvents: continuationResult.emittedEvents }),
          bindings,
          ...(continuationResult.decisionScope === undefined ? {} : { decisionScope: continuationResult.decisionScope }),
          pendingChoice: continuationResult.pendingChoice,
        };
      }

      const resolvedBindings = continuationResult.bindings ?? continuationBindings;
      const exportedBindings: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(resolvedBindings)) {
        if (name === desc.payload.resultBind || !name.startsWith('$')) {
          continue;
        }
        exportedBindings[name] = value;
      }

      return {
        state: continuationResult.state,
        rng: continuationResult.rng,
        ...(continuationResult.emittedEvents === undefined ? {} : { emittedEvents: continuationResult.emittedEvents }),
        ...(continuationResult.decisionScope === undefined ? {} : { decisionScope: continuationResult.decisionScope }),
        bindings: {
          ...bindings,
          ...exportedBindings,
        },
      };
    },
  };
};

const resolveRemovalBudget = (budgetExpr: unknown): number => {
  if (typeof budgetExpr !== 'number' || !Number.isSafeInteger(budgetExpr) || budgetExpr < 0) {
    throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED, 'removeByPriority.budget must evaluate to a non-negative integer', {
      effectType: 'removeByPriority',
      budget: budgetExpr,
    });
  }
  return budgetExpr;
};

export const compileRemoveByPriority = (
  desc: RemoveByPriorityPattern,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  const groupExecutions = desc.payload.groups.map((group) => {
    const moveEffects: readonly EffectAST[] = [
      moveTokenBuilder({
        token: group.bind,
        from: group.from ?? { zoneExpr: { _t: VALUE_EXPR_TAG.REF, ref: 'tokenZone', token: group.bind } as ValueExpr },
        to: group.to,
      }),
    ];
    return {
      group,
      moveEffects,
      fragment: compileBody(moveEffects),
    };
  });
  const inEffects = desc.payload.in ?? [];
  const inFragment = desc.payload.in === undefined ? null : compileBody(desc.payload.in);

  return {
    nodeCount: 1 + countEffectNodes(inEffects),
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'removeByPriority');
      let remainingBudget = resolveRemovalBudget(evalCompiledValue(desc.payload.budget, state, bindings, ctx));
      let currentState = state;
      let currentRng = rng;
      let currentDecisionScope = ctx.decisionScope;
      const emittedEvents: TriggerEvent[] = [];
      const countBindings: Record<string, number> = {};

      for (const { group, fragment } of groupExecutions) {
        let removedInGroup = 0;

        if (remainingBudget > 0) {
          const queried = unwrapEvalQuery(evalQuery(group.over, createCompiledEvalContext(currentState, bindings, ctx)));
          const bounded = queried.slice(0, remainingBudget);

          for (const item of bounded) {
            if (resolveRuntimeTokenBindingValue(item) === null) {
              throw effectRuntimeError(EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED, 'removeByPriority groups must resolve to token items', {
                effectType: 'removeByPriority',
                bind: group.bind,
                actualType: typeof item,
                value: item,
              });
            }

            const moveResult = executeCompiledFragment(
              fragment,
              currentState,
              currentRng,
              { ...bindings, [group.bind]: item },
              { ...ctx, decisionScope: currentDecisionScope },
            );

            currentState = moveResult.state;
            currentRng = moveResult.rng;
            currentDecisionScope = moveResult.decisionScope ?? currentDecisionScope;
            for (const event of moveResult.emittedEvents ?? []) {
              emittedEvents.push(event);
            }
            removedInGroup += 1;
            remainingBudget -= 1;
            if (remainingBudget === 0) {
              break;
            }
          }
        }

        if (group.countBind !== undefined) {
          countBindings[group.countBind] = removedInGroup;
        }
      }

      const exportedBindings: Record<string, unknown> = {
        ...bindings,
        ...countBindings,
        ...(desc.payload.remainingBind === undefined ? {} : { [desc.payload.remainingBind]: remainingBudget }),
      };

      if (desc.payload.in !== undefined) {
        const inResult = executeCompiledFragment(
          inFragment!,
          currentState,
          currentRng,
          exportedBindings,
          { ...ctx, decisionScope: currentDecisionScope },
        );
        currentState = inResult.state;
        currentRng = inResult.rng;
        currentDecisionScope = inResult.decisionScope ?? currentDecisionScope;
        for (const event of inResult.emittedEvents ?? []) {
          emittedEvents.push(event);
        }
        if (inResult.pendingChoice !== undefined) {
          return {
            state: currentState,
            rng: currentRng,
            emittedEvents,
            bindings: exportedBindings,
            decisionScope: currentDecisionScope,
            pendingChoice: inResult.pendingChoice,
          };
        }
      }

      return {
        state: currentState,
        rng: currentRng,
        emittedEvents,
        bindings: exportedBindings,
        decisionScope: currentDecisionScope,
      };
    },
  };
};

export const compileGotoPhaseExact = (desc: GotoPhaseExactPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'gotoPhaseExact',
    gotoPhaseExactBuilder({ phase: desc.phase }),
    applyGotoPhaseExact,
  );

export const compileSetActivePlayer = (desc: SetActivePlayerPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'setActivePlayer',
    setActivePlayerBuilder({ player: desc.player }),
    applySetActivePlayer,
  );

export const compileAdvancePhase = (_desc: AdvancePhasePattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'advancePhase',
    advancePhaseBuilder({}),
    applyAdvancePhase,
  );

export const compilePopInterruptPhase = (_desc: PopInterruptPhasePattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'popInterruptPhase',
    popInterruptPhaseBuilder({}),
    applyPopInterruptPhase,
  );

export const compileRollRandom = (
  desc: RollRandomPattern,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  const inFragment = compileBody(desc.payload.in);

  return {
    nodeCount: 1 + countEffectNodes(desc.payload.in),
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'rollRandom');

      const minValue = expectSafeInteger(evalCompiledValue(desc.payload.min, state, bindings, ctx), 'rollRandom', 'min');
      const maxValue = expectSafeInteger(evalCompiledValue(desc.payload.max, state, bindings, ctx), 'rollRandom', 'max');
      if (minValue > maxValue) {
        throw effectRuntimeError(
          EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
          `rollRandom requires min <= max, received min=${minValue}, max=${maxValue}`,
          {
            effectType: 'rollRandom',
            min: minValue,
            max: maxValue,
          },
        );
      }

      const fixedBinding = resolveCompiledBindings(bindings, ctx)[desc.payload.bind];
      const [rolledValue, nextRng] = fixedBinding === undefined
        ? nextInt(rng, minValue, maxValue)
        : [expectSafeInteger(fixedBinding, 'rollRandom', 'min'), rng] as const;

      if (rolledValue < minValue || rolledValue > maxValue) {
        throw effectRuntimeError(
          EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
          `rollRandom binding ${desc.payload.bind} must stay within [${minValue}, ${maxValue}]`,
          {
            effectType: 'rollRandom',
            bind: desc.payload.bind,
            min: minValue,
            max: maxValue,
            value: rolledValue,
          },
        );
      }

      const nestedResult = executeCompiledFragment(
        inFragment,
        state,
        nextRng,
        { ...bindings, [desc.payload.bind]: rolledValue },
        {
          ...ctx,
          ...((ctx.resources.collector.trace !== null || ctx.resources.collector.conditionTrace !== null)
            ? { effectPath: `${ctx.effectPath ?? ''}.rollRandom.in` }
            : (ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath })),
        },
      );

      return {
        state: nestedResult.state,
        rng: nestedResult.rng,
        ...(nestedResult.emittedEvents === undefined ? {} : { emittedEvents: nestedResult.emittedEvents }),
        ...(nestedResult.pendingChoice === undefined ? {} : { pendingChoice: nestedResult.pendingChoice }),
        bindings,
      };
    },
  };
};

export const compilePushInterruptPhase = (desc: PushInterruptPhasePattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'pushInterruptPhase',
    pushInterruptPhaseBuilder(desc.payload),
    applyPushInterruptPhase,
  );

export const compileBindValue = (desc: BindValuePattern): CompiledEffectFragment => ({
  nodeCount: 1,
  execute: (state, rng, bindings, ctx) => {
    consumeEffectBudget(ctx.effectBudget, 'bindValue');
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

export const compileTransferVar = (desc: TransferVarPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'transferVar',
    { _k: EFFECT_KIND_TAG.transferVar, transferVar: desc.payload },
    applyTransferVar,
  );

export const compileSetMarker = (desc: SetMarkerPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'setMarker',
    { _k: EFFECT_KIND_TAG.setMarker, setMarker: desc.payload },
    applySetMarker,
  );

export const compileShiftMarker = (desc: ShiftMarkerPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'shiftMarker',
    { _k: EFFECT_KIND_TAG.shiftMarker, shiftMarker: desc.payload },
    applyShiftMarker,
  );

export const compileSetGlobalMarker = (desc: SetGlobalMarkerPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'setGlobalMarker',
    { _k: EFFECT_KIND_TAG.setGlobalMarker, setGlobalMarker: desc.payload },
    applySetGlobalMarker,
  );

export const compileFlipGlobalMarker = (desc: FlipGlobalMarkerPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'flipGlobalMarker',
    { _k: EFFECT_KIND_TAG.flipGlobalMarker, flipGlobalMarker: desc.payload },
    applyFlipGlobalMarker,
  );

export const compileShiftGlobalMarker = (desc: ShiftGlobalMarkerPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'shiftGlobalMarker',
    { _k: EFFECT_KIND_TAG.shiftGlobalMarker, shiftGlobalMarker: desc.payload },
    applyShiftGlobalMarker,
  );

export const compileLet = (
  desc: LetPattern,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  const bodyFragment = compileBody(desc.inEffects);

  return {
    nodeCount: 1 + countEffectNodes(desc.inEffects),
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'let');
      const evaluatedValue = evalCompiledValue(desc.value, state, bindings, ctx);
      const nestedBindings = {
        ...bindings,
        [desc.bind]: evaluatedValue,
      };
      const nestedResult = executeCompiledFragment(bodyFragment, state, rng, nestedBindings, ctx);
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
      const exportedBindings = exportDollarBindings(resolvedNestedBindings, [desc.bind]);

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

export const compileEvaluateSubset = (
  desc: EvaluateSubsetPattern,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  const computeFragment = compileBody(desc.payload.compute);
  const inFragment = compileBody(desc.payload.in);

  return {
    nodeCount: 1 + countEffectNodes(desc.payload.compute) + countEffectNodes(desc.payload.in),
    execute: (state, rng, bindings, ctx) => {
      consumeEffectBudget(ctx.effectBudget, 'evaluateSubset');

      const items = unwrapEvalQuery(evalQuery(desc.payload.source, createCompiledEvalContext(state, bindings, ctx)));
      const subsetSize = expectSafeInteger(evalCompiledValue(desc.payload.subsetSize, state, bindings, ctx), 'evaluateSubset', 'subsetSize');
      if (subsetSize < 0 || subsetSize > items.length) {
        throw effectRuntimeError(
          EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED,
          'evaluateSubset requires 0 <= subsetSize <= source item count',
          {
            effectType: 'evaluateSubset',
            subsetSize,
            sourceCount: items.length,
          },
        );
      }

      const combinationCount = countCombinations(items.length, subsetSize);
      if (combinationCount > MAX_SUBSET_COMBINATIONS) {
        throw effectRuntimeError(
          EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED,
          'evaluateSubset combination count exceeds safety cap',
          {
            effectType: 'evaluateSubset',
            subsetSize,
            sourceCount: items.length,
            combinationCount,
            maxCombinations: MAX_SUBSET_COMBINATIONS,
          },
        );
      }

      let bestScore = Number.NEGATIVE_INFINITY;
      let bestSubset: readonly unknown[] | null = null;

      for (const subset of combinations(items, subsetSize)) {
        const computeBindings = {
          ...bindings,
          [desc.payload.subsetBind]: subset,
        };
        const computeResult = executeCompiledFragment(
          computeFragment,
          state,
          rng,
          computeBindings,
          {
            ...ctx,
            ...((ctx.resources.collector.trace !== null || ctx.resources.collector.conditionTrace !== null)
              ? { effectPath: `${ctx.effectPath ?? ''}.evaluateSubset.compute` }
              : (ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath })),
          },
        );
        if (computeResult.pendingChoice !== undefined) {
          return {
            state: computeResult.state,
            rng: computeResult.rng,
            ...(computeResult.emittedEvents === undefined ? {} : { emittedEvents: computeResult.emittedEvents }),
            bindings,
            pendingChoice: computeResult.pendingChoice,
          };
        }

        const scoreBindings = computeResult.bindings ?? computeBindings;
        const score = expectSafeInteger(
          evalCompiledValue(desc.payload.scoreExpr, computeResult.state, scoreBindings, ctx),
          'evaluateSubset',
          'scoreExpr',
        );
        if (score > bestScore) {
          bestScore = score;
          bestSubset = subset;
        }
      }

      if (bestSubset === null) {
        throw effectRuntimeError(
          EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED,
          'evaluateSubset could not evaluate any subset',
          {
            effectType: 'evaluateSubset',
            subsetSize,
            sourceCount: items.length,
          },
        );
      }

      const inBindings = {
        ...bindings,
        [desc.payload.resultBind]: bestScore,
        ...(desc.payload.bestSubsetBind === undefined ? {} : { [desc.payload.bestSubsetBind]: bestSubset }),
      };
      const inResult = executeCompiledFragment(
        inFragment,
        state,
        rng,
        inBindings,
        {
          ...ctx,
          ...((ctx.resources.collector.trace !== null || ctx.resources.collector.conditionTrace !== null)
            ? { effectPath: `${ctx.effectPath ?? ''}.evaluateSubset.in` }
            : (ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath })),
        },
      );
      if (inResult.pendingChoice !== undefined) {
        return {
          state: inResult.state,
          rng: inResult.rng,
          ...(inResult.emittedEvents === undefined ? {} : { emittedEvents: inResult.emittedEvents }),
          bindings: inBindings,
          pendingChoice: inResult.pendingChoice,
        };
      }

      return {
        state: inResult.state,
        rng: inResult.rng,
        ...(inResult.emittedEvents === undefined ? {} : { emittedEvents: inResult.emittedEvents }),
        bindings: inBindings,
      };
    },
  };
};

export const compileMoveToken = (desc: MoveTokenPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'moveToken',
    moveTokenBuilder(desc.payload),
    applyMoveToken,
  );

export const compileMoveAll = (desc: MoveAllPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'moveAll',
    moveAllBuilder(desc.payload),
    applyMoveAll,
  );

export const compileMoveTokenAdjacent = (desc: MoveTokenAdjacentPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'moveTokenAdjacent',
    moveTokenAdjacentBuilder(desc.payload),
    applyMoveTokenAdjacent,
  );

export const compileDraw = (desc: DrawPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'draw',
    drawBuilder(desc.payload),
    applyDraw,
  );

export const compileShuffle = (desc: ShufflePattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'shuffle',
    shuffleBuilder(desc.payload),
    applyShuffle,
  );

export const compileCreateToken = (desc: CreateTokenPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'createToken',
    createTokenBuilder(desc.payload),
    applyCreateToken,
  );

export const compileDestroyToken = (desc: DestroyTokenPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'destroyToken',
    destroyTokenBuilder(desc.payload),
    applyDestroyToken,
  );

export const compileSetTokenProp = (desc: SetTokenPropPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'setTokenProp',
    setTokenPropBuilder(desc.payload),
    applySetTokenProp,
  );

export const compileReveal = (desc: RevealPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'reveal',
    revealBuilder(desc.payload),
    applyReveal,
  );

export const compileConceal = (desc: ConcealPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'conceal',
    concealBuilder(desc.payload),
    applyConceal,
  );

export const compileChooseOne = (desc: ChooseOnePattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'chooseOne',
    chooseOneBuilder(desc.payload),
    applyChooseOne,
  );

export const compileChooseN = (desc: ChooseNPattern): CompiledEffectFragment =>
  createCompiledDelegateLeafFragment(
    'chooseN',
    chooseNBuilder(desc.payload),
    applyChooseN,
  );

export const compilePatternDescriptor = (
  desc: PatternDescriptor,
  compileBody: BodyCompiler,
): CompiledEffectFragment => {
  switch (desc.kind) {
    case 'setVar':
      return compileSetVar(desc);
    case 'addVar':
      return compileAddVar(desc);
    case 'if':
      return compileIf(desc, compileBody);
    case 'forEach':
      return compileForEach(desc, compileBody);
    case 'reduce':
      return compileReduce(desc, compileBody);
    case 'removeByPriority':
      return compileRemoveByPriority(desc, compileBody);
    case 'gotoPhaseExact':
      return compileGotoPhaseExact(desc);
    case 'setActivePlayer':
      return compileSetActivePlayer(desc);
    case 'advancePhase':
      return compileAdvancePhase(desc);
    case 'popInterruptPhase':
      return compilePopInterruptPhase(desc);
    case 'rollRandom':
      return compileRollRandom(desc, compileBody);
    case 'chooseOne':
      return compileChooseOne(desc);
    case 'chooseN':
      return compileChooseN(desc);
    case 'bindValue':
      return compileBindValue(desc);
    case 'transferVar':
      return compileTransferVar(desc);
    case 'pushInterruptPhase':
      return compilePushInterruptPhase(desc);
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
    case 'evaluateSubset':
      return compileEvaluateSubset(desc, compileBody);
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
    case 'reveal':
      return compileReveal(desc);
    case 'conceal':
      return compileConceal(desc);
    default:
      throw new Error(`Unsupported compiled effect pattern: ${(desc as { kind: string }).kind}`);
  }
};
