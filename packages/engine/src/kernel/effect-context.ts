import type { PlayerId } from './branded.js';
import type { ChooseNTemplate } from './choose-n-session.js';
import { emptyScope, type DecisionScope } from './decision-scope.js';
import type {
  DecisionAuthorityProbeContext,
  DecisionAuthorityStrictContext,
} from './types-core.js';
import {
  type EvalRuntimeResources,
  type ReadContext,
} from './eval-context.js';
import type {
  ChoicePendingRequest,
  ChoiceStochasticPendingRequest,
  EffectTraceEventContext,
  GameState,
  MoveParamScalar,
  MoveParamValue,
  Rng,
  TriggerEvent,
  TurnFlowFreeOperationGrantContract,
} from './types.js';

export const DEFAULT_MAX_EFFECT_OPS = 10_000;

export interface PhaseTransitionBudget {
  remaining: number;
}

export interface FreeOperationProbeScope {
  readonly priorGrantDefinitions: TurnFlowFreeOperationGrantContract[];
  readonly blockedStrictSequenceBatchIds: string[];
}

export interface EffectTraceContext {
  readonly eventContext: EffectTraceEventContext;
  readonly actionId?: string;
  readonly effectPathRoot: string;
}

export interface WriteContext extends ReadContext {
  readonly rng: Rng;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
}

interface EffectContextBase extends WriteContext {
  readonly traceContext?: EffectTraceContext;
  readonly effectPath?: string;
  readonly maxEffectOps?: number;
  readonly freeOperation?: boolean;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly transientDecisionSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
  readonly decisionScope: DecisionScope;
  /** Runtime scope carrying previously executed grant definitions for sequence viability probes. */
  readonly freeOperationProbeScope?: FreeOperationProbeScope;
  /** Callback invoked during discovery when a chooseN pending choice is created, delivering the full-fidelity template. */
  readonly chooseNTemplateCallback?: (template: ChooseNTemplate) => void;
  /** Opt-in profiler for per-effect-type timing. Measurement side-channel only. */
  readonly profiler?: import('./perf-profiler.js').PerfProfiler;
}

export interface ExecutionEffectContext extends EffectContextBase {
  readonly decisionAuthority: DecisionAuthorityStrictContext;
  readonly mode: 'execution';
}

export interface DiscoveryStrictEffectContext extends EffectContextBase {
  readonly decisionAuthority: DecisionAuthorityStrictContext;
  readonly mode: 'discovery';
}

export interface DiscoveryProbeEffectContext extends EffectContextBase {
  readonly decisionAuthority: DecisionAuthorityProbeContext;
  readonly mode: 'discovery';
}

export type DiscoveryEffectContext = DiscoveryStrictEffectContext | DiscoveryProbeEffectContext;

export type EffectContext = ExecutionEffectContext | DiscoveryEffectContext;

export interface EffectResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly emittedEvents?: readonly TriggerEvent[];
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly pendingChoice?: ChoicePendingRequest | ChoiceStochasticPendingRequest;
  readonly decisionScope?: DecisionScope;
}

interface RuntimeEffectContextOptions extends Omit<EffectContextBase, 'collector' | 'resources' | 'decisionScope'> {
  readonly resources: EvalRuntimeResources;
  readonly decisionAuthorityPlayer?: PlayerId;
  readonly decisionScope?: DecisionScope;
}

export const createExecutionEffectContext = (options: RuntimeEffectContextOptions): ExecutionEffectContext => {
  const {
    activePlayer,
    resources,
    decisionAuthorityPlayer = activePlayer,
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    resources,
    collector: resources.collector,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement: 'strict',
    },
    decisionScope: ctx.decisionScope ?? emptyScope(),
    mode: 'execution',
  };
};

export const createDiscoveryStrictEffectContext = (options: RuntimeEffectContextOptions): DiscoveryStrictEffectContext => {
  const {
    activePlayer,
    resources,
    decisionAuthorityPlayer = activePlayer,
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    resources,
    collector: resources.collector,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement: 'strict',
    },
    decisionScope: ctx.decisionScope ?? emptyScope(),
    mode: 'discovery',
  };
};

export const createDiscoveryProbeEffectContext = (
  options: RuntimeEffectContextOptions,
): DiscoveryProbeEffectContext => {
  const {
    activePlayer,
    resources,
    decisionAuthorityPlayer = activePlayer,
    ...ctx
  } = options;
  return {
    ...ctx,
    activePlayer,
    resources,
    collector: resources.collector,
    decisionAuthority: {
      source: 'engineRuntime',
      player: decisionAuthorityPlayer,
      ownershipEnforcement: 'probe',
    },
    decisionScope: ctx.decisionScope ?? emptyScope(),
    mode: 'discovery',
  };
};

export function getMaxEffectOps(ctx: Pick<EffectContext, 'maxEffectOps'>): number {
  return ctx.maxEffectOps ?? DEFAULT_MAX_EFFECT_OPS;
}
