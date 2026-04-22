import { createDiscoveryStrictEffectContext } from '../effect-context.js';
import { createEvalContext, createEvalRuntimeResources } from '../eval-context.js';
import { applyEffects } from '../effects.js';
import { createGameDefRuntime, type GameDefRuntime } from '../gamedef-runtime.js';
import { decideDiscoveryLegalChoicesPipelineViability, evaluateDiscoveryStagePredicateStatus } from '../pipeline-viability-policy.js';
import { emptyScope, rebaseIterationPath, withIterationSegment, type DecisionScope } from '../decision-scope.js';
import { toChoiceIllegalReason } from '../legality-outcome.js';
import type { ChooseNTemplate } from '../choose-n-session.js';
import type {
  ActionDef,
  ChoiceIllegalRequest,
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
  Rng,
  RuntimeWarning,
} from '../types.js';
import { resolveForcedPendingSelection } from './forced-pending-selection.js';
import {
  type DecisionContinuationResult,
} from './continuation.js';
import type {
  SuspendedChoiceBindingOption,
  SuspendedEffectFrameSnapshot,
  SuspendedPipelineResumeFrame,
  SuspendedResumeFrame,
} from './types.js';

const suspensionKey = (value: MoveParamScalar): string => JSON.stringify([typeof value, value]);

const withSuspendedFrame = (
  request: ChoicePendingRequest,
  suspendedFrame: SuspendedEffectFrameSnapshot | undefined,
): ChoicePendingRequest =>
  suspendedFrame === undefined ? request : { ...request, suspendedFrame };

const resolveSingleBinding = (
  options: readonly SuspendedChoiceBindingOption[],
  selected: MoveParamScalar,
): unknown => {
  const key = suspensionKey(selected);
  const match = options.find((option) => suspensionKey(option.comparable) === key);
  if (match === undefined) {
    throw new Error(`MICROTURN_SUSPENDED_BINDING_OPTION_MISSING:${String(selected)}`);
  }
  return match.binding;
};

const resolveBindingArray = (
  options: readonly SuspendedChoiceBindingOption[],
  selected: readonly MoveParamScalar[],
): readonly unknown[] =>
  selected.map((value) => resolveSingleBinding(options, value));

interface ResumedDiscoveryResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly decisionScope: DecisionScope;
  readonly nextDecision?: ChoicePendingRequest;
  readonly warnings: readonly RuntimeWarning[];
}

const executeResumedEffects = (
  def: GameDef,
  state: GameState,
  rng: Rng,
  actorPlayer: GameState['activePlayer'],
  bindings: Readonly<Record<string, unknown>>,
  decisionScope: DecisionScope,
  effects: readonly import('../types-ast.js').EffectAST[],
  move: Move,
  runtime: GameDefRuntime,
  freeOperationOverlay: SuspendedEffectFrameSnapshot['freeOperationOverlay'],
  onChooseNTemplateCreated?: (template: ChooseNTemplate) => void,
): ResumedDiscoveryResult => {
  const resources = createEvalRuntimeResources();
  const result = applyEffects(effects, createDiscoveryStrictEffectContext({
    def,
    adjacencyGraph: runtime.adjacencyGraph,
    state,
    rng,
    activePlayer: state.activePlayer,
    actorPlayer,
    bindings,
    moveParams: move.params,
    resources,
    decisionScope,
    runtimeTableIndex: runtime.runtimeTableIndex,
    ...(freeOperationOverlay === undefined ? {} : { freeOperationOverlay }),
    ...(onChooseNTemplateCreated === undefined ? {} : { chooseNTemplateCallback: onChooseNTemplateCreated }),
  }));
  return {
    state: result.state,
    rng: result.rng,
    bindings: result.bindings,
    decisionScope: result.decisionScope,
    ...(result.pendingChoice === undefined || result.pendingChoice.kind === 'pendingStochastic'
      ? {}
      : { nextDecision: withSuspendedFrame(result.pendingChoice, result.suspendedFrame) }),
    warnings: resources.collector.warnings,
  };
};

const appendResumeFrame = (
  request: ChoicePendingRequest,
  frame: SuspendedResumeFrame,
): ChoicePendingRequest =>
  request.suspendedFrame === undefined
    ? request
    : {
      ...request,
      suspendedFrame: {
        ...request.suspendedFrame,
      resumeStack: [...request.suspendedFrame.resumeStack, frame],
      },
    };

const appendRemainingResumeFrames = (
  request: ChoicePendingRequest,
  frames: readonly SuspendedResumeFrame[],
): ChoicePendingRequest =>
  frames.reduce(
    (nextRequest, frame) => appendResumeFrame(nextRequest, frame),
    request,
  );

const exportLetBindings = (
  parentBindings: Readonly<Record<string, unknown>>,
  bind: string,
  nestedBindings: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const exportedBindings: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(nestedBindings)) {
    if (name === bind || !name.startsWith('$')) {
      continue;
    }
    exportedBindings[name] = value;
  }
  return {
    ...parentBindings,
    ...exportedBindings,
  };
};

const illegalContinuation = (
  move: Move,
  reason: ChoiceIllegalRequest['reason'],
  warnings: readonly RuntimeWarning[],
): DecisionContinuationResult => ({
  complete: false,
  move,
  illegal: {
    kind: 'illegal',
    complete: false,
    reason,
  },
  warnings,
});

const findAction = (def: GameDef, actionId: Move['actionId']): ActionDef => {
  const action = def.actions.find((candidate) => candidate.id === actionId);
  if (action === undefined) {
    throw new Error(`MICROTURN_SUSPENDED_PIPELINE_ACTION_MISSING:${String(actionId)}`);
  }
  return action;
};

const withResolvedSuspendedDecision = (
  move: Move,
  request: ChoicePendingRequest,
  selected: MoveParamScalar | readonly MoveParamScalar[],
): Move => {
  if (request.decisionPath === 'compound.specialActivity') {
    if (move.compound === undefined) {
      throw new Error('MICROTURN_SUSPENDED_COMPOUND_CHOICE_MOVE_MISSING');
    }
    return {
      ...move,
      compound: {
        ...move.compound,
        specialActivity: {
          ...move.compound.specialActivity,
          params: {
            ...move.compound.specialActivity.params,
            [request.decisionKey]: selected,
          },
        },
      },
    };
  }

  return {
    ...move,
    params: {
      ...move.params,
      [request.decisionKey]: selected,
    },
  };
};

const finalizeResumedPendingDecision = (
  def: GameDef,
  move: Move,
  nextDecision: ChoicePendingRequest,
  warnings: readonly RuntimeWarning[],
  runtime: GameDefRuntime,
  onChooseNTemplateCreated?: (template: ChooseNTemplate) => void,
): DecisionContinuationResult => {
  const forcedSelection = resolveForcedPendingSelection(nextDecision);
  if (forcedSelection === undefined || nextDecision.suspendedFrame === undefined) {
    return {
      complete: false,
      move,
      nextDecision,
      warnings,
      ...(nextDecision.suspendedFrame === undefined ? {} : { suspendedFrame: nextDecision.suspendedFrame }),
    };
  }

  const continued = resumeSuspendedEffectFrame(
    def,
    nextDecision.suspendedFrame,
    withResolvedSuspendedDecision(move, nextDecision, forcedSelection as MoveParamScalar | readonly MoveParamScalar[]),
    runtime,
    onChooseNTemplateCreated,
  );
  return {
    ...continued,
    warnings: [...warnings, ...continued.warnings],
  };
};

const resumePipelineTail = (
  def: GameDef,
  frame: SuspendedPipelineResumeFrame,
  suspendedFrame: SuspendedEffectFrameSnapshot,
  currentState: GameState,
  currentRng: Rng,
  currentBindings: Readonly<Record<string, unknown>>,
  move: Move,
  runtime: GameDefRuntime,
  warnings: RuntimeWarning[],
  onChooseNTemplateCreated?: (template: ChooseNTemplate) => void,
): DecisionContinuationResult | {
  readonly state: GameState;
  readonly rng: Rng;
  readonly bindings: Readonly<Record<string, unknown>>;
} => {
  const action = findAction(def, frame.actionId);
  let stageState = currentState;
  let stageRng = currentRng;
  let stageBindings = currentBindings;

  for (let stageIndex = 0; stageIndex < frame.remainingStages.length; stageIndex += 1) {
    const stage = frame.remainingStages[stageIndex]!;
    const stageEvalCtx = createEvalContext({
      def,
      state: stageState,
      adjacencyGraph: runtime.adjacencyGraph,
      activePlayer: stageState.activePlayer,
      actorPlayer: suspendedFrame.actorPlayer,
      bindings: stageBindings,
      resources: createEvalRuntimeResources(),
      runtimeTableIndex: runtime.runtimeTableIndex,
      ...(suspendedFrame.freeOperationOverlay === undefined ? {} : { freeOperationOverlay: suspendedFrame.freeOperationOverlay }),
    });
    const stageStatus = evaluateDiscoveryStagePredicateStatus(
      action,
      frame.profileId,
      stage,
      frame.atomicity,
      stageEvalCtx,
      { includeCostValidation: move.freeOperation !== true },
    );
    const stageDecision = decideDiscoveryLegalChoicesPipelineViability(stageStatus);
    if (stageDecision.kind === 'illegalChoice') {
      return illegalContinuation(move, toChoiceIllegalReason(stageDecision.outcome), warnings);
    }
    if (stageStatus.atomicity === 'partial' && stageStatus.costValidation === 'failed') {
      continue;
    }

    const resumed = executeResumedEffects(
      def,
      stageState,
      stageRng,
      suspendedFrame.actorPlayer,
      stageBindings,
      emptyScope(),
      stage.effects,
      move,
      runtime,
      suspendedFrame.freeOperationOverlay,
      onChooseNTemplateCreated,
    );
    warnings.push(...resumed.warnings);
    if (resumed.nextDecision !== undefined) {
      const nextDecision = appendResumeFrame(resumed.nextDecision, {
        ...frame,
        remainingStages: frame.remainingStages.slice(stageIndex + 1),
      });
      return {
        complete: false,
        move,
        nextDecision,
        warnings,
        ...(nextDecision.suspendedFrame === undefined ? {} : { suspendedFrame: nextDecision.suspendedFrame }),
      };
    }
    stageState = resumed.state;
    stageRng = resumed.rng;
    stageBindings = resumed.bindings;
  }

  if (frame.eventEffects.length > 0) {
    const resumed = executeResumedEffects(
      def,
      stageState,
      stageRng,
      suspendedFrame.actorPlayer,
      stageBindings,
      emptyScope(),
      frame.eventEffects,
      move,
      runtime,
      suspendedFrame.freeOperationOverlay,
      onChooseNTemplateCreated,
    );
    warnings.push(...resumed.warnings);
    if (resumed.nextDecision !== undefined) {
      const nextDecision = appendResumeFrame(resumed.nextDecision, {
        ...frame,
        remainingStages: [],
        eventEffects: [],
      });
      return {
        complete: false,
        move,
        nextDecision,
        warnings,
        ...(nextDecision.suspendedFrame === undefined ? {} : { suspendedFrame: nextDecision.suspendedFrame }),
      };
    }
    stageState = resumed.state;
    stageRng = resumed.rng;
    stageBindings = resumed.bindings;
  }

  return {
    state: stageState,
    rng: stageRng,
    bindings: stageBindings,
  };
};

export const resumeSuspendedEffectFrame = (
  def: GameDef,
  suspendedFrame: SuspendedEffectFrameSnapshot,
  move: Move,
  runtime?: GameDefRuntime,
  onChooseNTemplateCreated?: (template: ChooseNTemplate) => void,
): DecisionContinuationResult => {
  const resolvedRuntime = runtime ?? createGameDefRuntime(def);
  let currentState = suspendedFrame.state;
  let currentRng = suspendedFrame.rng;
  let currentBindings: Readonly<Record<string, unknown>>;
  let currentDecisionScope: DecisionScope = suspendedFrame.leaf.decisionScope;
  const warnings: RuntimeWarning[] = [];

  if (suspendedFrame.leaf.kind === 'chooseOne') {
    const selected = move.params[suspendedFrame.leaf.decisionKey];
    if (selected === undefined || Array.isArray(selected)) {
      throw new Error(`MICROTURN_SUSPENDED_CHOOSE_ONE_SELECTION_MISSING:${String(suspendedFrame.leaf.decisionKey)}`);
    }
    currentBindings = {
      ...suspendedFrame.bindings,
      [suspendedFrame.leaf.bind]: resolveSingleBinding(
        suspendedFrame.leaf.bindingOptions,
        selected as MoveParamScalar,
      ),
    };
  } else {
    const selected = move.params[suspendedFrame.leaf.decisionKey];
    if (selected === undefined || !Array.isArray(selected)) {
      throw new Error(`MICROTURN_SUSPENDED_CHOOSE_N_SELECTION_MISSING:${String(suspendedFrame.leaf.decisionKey)}`);
    }
    currentBindings = {
      ...suspendedFrame.bindings,
      [suspendedFrame.leaf.bind]: resolveBindingArray(
        suspendedFrame.leaf.bindingOptions,
        selected as readonly MoveParamScalar[],
      ),
    };
  }

  for (let frameIndex = 0; frameIndex < suspendedFrame.resumeStack.length; frameIndex += 1) {
    const frame = suspendedFrame.resumeStack[frameIndex]!;
    const remainingFrames = suspendedFrame.resumeStack.slice(frameIndex + 1);
    if (frame.kind === 'sequence') {
      const resumed = executeResumedEffects(
        def,
        currentState,
        currentRng,
        suspendedFrame.actorPlayer,
        currentBindings,
        currentDecisionScope,
        frame.effects,
        move,
        resolvedRuntime,
        suspendedFrame.freeOperationOverlay,
        onChooseNTemplateCreated,
      );
      warnings.push(...resumed.warnings);
      if (resumed.nextDecision !== undefined) {
        const nextDecision = appendRemainingResumeFrames(resumed.nextDecision, remainingFrames);
        return finalizeResumedPendingDecision(def, move, nextDecision, warnings, resolvedRuntime, onChooseNTemplateCreated);
      }
      currentState = resumed.state;
      currentRng = resumed.rng;
      currentBindings = resumed.bindings;
      currentDecisionScope = resumed.decisionScope;
      continue;
    }

    if (frame.kind === 'let') {
      currentBindings = exportLetBindings(frame.parentBindings, frame.bind, currentBindings);
      continue;
    }

    if (frame.kind === 'reduce') {
      currentBindings = exportLetBindings(frame.parentBindings, frame.bind, currentBindings);
      continue;
    }

    if (frame.kind === 'pipeline') {
      const pipelineResult = resumePipelineTail(
        def,
        frame,
        suspendedFrame,
        currentState,
        currentRng,
        currentBindings,
        move,
        resolvedRuntime,
        warnings,
        onChooseNTemplateCreated,
      );
      if ('complete' in pipelineResult) {
        if (pipelineResult.nextDecision !== undefined) {
          const nextDecision = appendRemainingResumeFrames(pipelineResult.nextDecision, remainingFrames);
          return finalizeResumedPendingDecision(
            def,
            pipelineResult.move,
            nextDecision,
            pipelineResult.warnings,
            resolvedRuntime,
            onChooseNTemplateCreated,
          );
        }
        return pipelineResult;
      }
      currentState = pipelineResult.state;
      currentRng = pipelineResult.rng;
      currentBindings = pipelineResult.bindings;
      continue;
    }

    for (let index = frame.nextIndex; index < frame.items.length; index += 1) {
      const resumed = executeResumedEffects(
        def,
        currentState,
        currentRng,
        suspendedFrame.actorPlayer,
        {
          ...frame.parentBindings,
          [frame.bind]: frame.items[index],
        },
        withIterationSegment(rebaseIterationPath(currentDecisionScope, frame.parentIterationPath), index),
        frame.effects,
        move,
        resolvedRuntime,
        suspendedFrame.freeOperationOverlay,
        onChooseNTemplateCreated,
      );
      warnings.push(...resumed.warnings);
      if (resumed.nextDecision !== undefined) {
        const nextDecision = appendRemainingResumeFrames(
          appendResumeFrame(resumed.nextDecision, {
            ...frame,
            nextIndex: index + 1,
          }),
          remainingFrames,
        );
        return finalizeResumedPendingDecision(def, move, nextDecision, warnings, resolvedRuntime, onChooseNTemplateCreated);
      }
      currentState = resumed.state;
      currentRng = resumed.rng;
      currentDecisionScope = resumed.decisionScope;
      currentBindings = frame.parentBindings;
    }
  }

  return {
    complete: true,
    move,
    warnings,
  };
};
