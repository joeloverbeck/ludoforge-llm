import type { PhaseId, PlayerId } from './branded.js';
import type {
  EffectResult,
  EffectTraceContext,
  PhaseTransitionBudget,
} from './effect-context.js';
import type { DecisionScope } from './decision-scope.js';
import type { EvalRuntimeResources } from './eval-context.js';
import type { EffectBudgetState } from './effects-control.js';
import type { PerfProfiler } from './perf-profiler.js';
import type { AdjacencyGraph } from './spatial.js';
import type { RuntimeTableIndex } from './runtime-table-index.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import type { DraftTracker } from './state-draft.js';
import type { ChooseNTemplate } from './choose-n-session.js';
import type { GameDef, GameState, MoveParamScalar, MoveParamValue, Rng } from './types.js';
import type { DecisionAuthorityProbeContext, DecisionAuthorityStrictContext } from './types-core.js';

export type CompiledLifecycle = 'onEnter' | 'onExit';

export type CompiledLifecycleEffectKey = `${string}:${CompiledLifecycle}`;

export interface CompiledEffectSequence {
  readonly phaseId: PhaseId;
  readonly lifecycle: CompiledLifecycle;
  readonly execute: CompiledEffectFn;
  readonly coverageRatio: number;
}

export type CompiledEffectFn = (
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
) => EffectResult;

export interface CompiledEffectContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly runtimeTableIndex: RuntimeTableIndex;
  readonly resources: EvalRuntimeResources;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly moveParams: Readonly<Record<string, MoveParamValue>>;
  readonly traceContext?: EffectTraceContext;
  readonly decisionScope?: DecisionScope;
  readonly effectPath?: string;
  readonly maxEffectOps?: number;
  readonly verifyCompiledEffects?: boolean;
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly profiler?: PerfProfiler;
  readonly effectBudget?: EffectBudgetState;
  readonly cachedRuntime?: GameDefRuntime;
  readonly tracker?: DraftTracker;
  readonly mode?: 'execution' | 'discovery';
  readonly decisionAuthority?: DecisionAuthorityStrictContext | DecisionAuthorityProbeContext;
  readonly transientDecisionSelections?: Readonly<Record<string, readonly MoveParamScalar[]>>;
  readonly chooseNTemplateCallback?: (template: ChooseNTemplate) => void;
}

export type CompiledEffectVerificationMismatchKind =
  | 'stateHash'
  | 'rng'
  | 'emittedEvents'
  | 'bindings'
  | 'decisionScope'
  | 'pendingChoice'
  | 'warnings';

export interface CompiledEffectVerificationErrorDetails {
  readonly phaseId: PhaseId;
  readonly lifecycle: CompiledLifecycle;
  readonly coverageRatio: number;
  readonly mismatchKind: CompiledEffectVerificationMismatchKind;
  readonly compiledValue?: unknown;
  readonly interpretedValue?: unknown;
}

export class CompiledEffectVerificationError extends Error {
  readonly phaseId: PhaseId;
  readonly lifecycle: CompiledLifecycle;
  readonly coverageRatio: number;
  readonly mismatchKind: CompiledEffectVerificationMismatchKind;
  readonly compiledValue?: unknown;
  readonly interpretedValue?: unknown;

  constructor(details: CompiledEffectVerificationErrorDetails) {
    super(
      `Compiled lifecycle verification failed for ${String(details.phaseId)}:${details.lifecycle} (${details.mismatchKind})`,
    );
    this.name = 'CompiledEffectVerificationError';
    this.phaseId = details.phaseId;
    this.lifecycle = details.lifecycle;
    this.coverageRatio = details.coverageRatio;
    this.mismatchKind = details.mismatchKind;
    this.compiledValue = details.compiledValue;
    this.interpretedValue = details.interpretedValue;
  }
}

export const makeCompiledLifecycleEffectKey = (
  phaseId: PhaseId,
  lifecycle: CompiledLifecycle,
): CompiledLifecycleEffectKey => `${phaseId}:${lifecycle}`;
