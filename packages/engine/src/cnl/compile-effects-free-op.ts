import type { Diagnostic } from '../kernel/diagnostics.js';
import { resolveEffectiveFreeOperationActionDomain } from '../kernel/free-operation-action-domain.js';
import type { ConditionAST, EffectAST, FreeOperationExecutionContext } from '../kernel/types.js';
import { FreeOperationSequenceContextSchema } from '../kernel/free-operation-sequence-context-schema.js';
import {
  collectTurnFlowFreeOperationGrantContractViolations,
  renderTurnFlowFreeOperationGrantContractViolation,
  TURN_FLOW_ACTION_CLASS_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES,
  isTurnFlowActionClass,
  isTurnFlowFreeOperationGrantProgressionPolicy,
  isTurnFlowFreeOperationGrantViabilityPolicy,
} from '../contracts/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import { lowerConditionNode } from './compile-conditions.js';
import type { EffectLoweringContext, EffectLoweringResult } from './compile-effects-types.js';
import type { BindingScope } from './compile-effects-binding-scope.js';
import {
  conditionFingerprint,
  formatValue,
  isInteger,
  isRecord,
  makeConditionContext,
  missingCapability,
} from './compile-effects-utils.js';
import {
  lowerFreeOperationExecutionContextNode,
  lowerFreeOperationTokenInterpretationsNode,
} from './compile-effects-core.js';
import { grantFreeOperation as grantFreeOperationBuilder } from '../kernel/ast-builders.js';

export function lowerGrantFreeOperationEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.seat !== 'string') {
    return missingCapability(path, 'grantFreeOperation effect', source, [
      '{ grantFreeOperation: { seat, operationClass, actionIds?, executeAsSeat?, zoneFilter?, moveZoneBindings?, moveZoneProbeBindings?, allowDuringMonsoon?, uses?, viabilityPolicy?, id?, sequence? } }',
    ]);
  }
  if (typeof source.operationClass !== 'string' || !isTurnFlowActionClass(source.operationClass)) {
    return missingCapability(`${path}.operationClass`, 'grantFreeOperation operationClass', source.operationClass, [
      ...TURN_FLOW_ACTION_CLASS_VALUES,
    ]);
  }

  const diagnostics: Diagnostic[] = [];
  let effectId: string | undefined;
  if (source.id !== undefined && typeof source.id !== 'string') {
    diagnostics.push(...missingCapability(`${path}.id`, 'grantFreeOperation id', source.id, ['string']).diagnostics);
  } else if (typeof source.id === 'string') {
    effectId = source.id;
  }
  let executeAsSeat: string | undefined;
  if (source.executeAsSeat !== undefined && typeof source.executeAsSeat !== 'string') {
    diagnostics.push(
      ...missingCapability(`${path}.executeAsSeat`, 'grantFreeOperation executeAsSeat', source.executeAsSeat, ['string'])
        .diagnostics,
    );
  } else if (typeof source.executeAsSeat === 'string') {
    executeAsSeat = source.executeAsSeat;
  }
  let actionIds: string[] | undefined;
  if (source.actionIds !== undefined && (!Array.isArray(source.actionIds) || source.actionIds.some((entry) => typeof entry !== 'string'))) {
    diagnostics.push(...missingCapability(`${path}.actionIds`, 'grantFreeOperation actionIds', source.actionIds, ['string[]']).diagnostics);
  } else if (Array.isArray(source.actionIds)) {
    actionIds = [...source.actionIds] as string[];
  }
  let uses: number | undefined;
  if (
    source.uses !== undefined &&
    (!isInteger(source.uses) || source.uses <= 0)
  ) {
    diagnostics.push(
      ...missingCapability(`${path}.uses`, 'grantFreeOperation uses', source.uses, ['positive integer']).diagnostics,
    );
  } else if (isInteger(source.uses) && source.uses > 0) {
    uses = source.uses;
  }

  let loweredZoneFilter: ConditionAST | undefined;
  if (source.zoneFilter !== undefined) {
    const lowered = scope.withBinding('$zone', () =>
      lowerConditionNode(source.zoneFilter, makeConditionContext(context, scope), `${path}.zoneFilter`));
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value === null) {
      return { value: null, diagnostics };
    }
    loweredZoneFilter = lowered.value;
  }

  let moveZoneBindings: string[] | undefined;
  if (
    source.moveZoneBindings !== undefined
    && (!Array.isArray(source.moveZoneBindings) || source.moveZoneBindings.some((entry) => typeof entry !== 'string' || entry.length === 0))
  ) {
    diagnostics.push(...missingCapability(
      `${path}.moveZoneBindings`,
      'grantFreeOperation moveZoneBindings',
      source.moveZoneBindings,
      ['non-empty string[]'],
    ).diagnostics);
  } else if (Array.isArray(source.moveZoneBindings)) {
    moveZoneBindings = [...source.moveZoneBindings] as string[];
  }

  let moveZoneProbeBindings: string[] | undefined;
  if (
    source.moveZoneProbeBindings !== undefined
    && (!Array.isArray(source.moveZoneProbeBindings) || source.moveZoneProbeBindings.some((entry) => typeof entry !== 'string' || entry.length === 0))
  ) {
    diagnostics.push(...missingCapability(
      `${path}.moveZoneProbeBindings`,
      'grantFreeOperation moveZoneProbeBindings',
      source.moveZoneProbeBindings,
      ['non-empty string[]'],
    ).diagnostics);
  } else if (Array.isArray(source.moveZoneProbeBindings)) {
    moveZoneProbeBindings = [...source.moveZoneProbeBindings] as string[];
  }

  let allowDuringMonsoon: boolean | undefined;
  if (source.allowDuringMonsoon !== undefined && typeof source.allowDuringMonsoon !== 'boolean') {
    diagnostics.push(...missingCapability(
      `${path}.allowDuringMonsoon`,
      'grantFreeOperation allowDuringMonsoon',
      source.allowDuringMonsoon,
      ['boolean'],
    ).diagnostics);
  } else if (typeof source.allowDuringMonsoon === 'boolean') {
    allowDuringMonsoon = source.allowDuringMonsoon;
  }

  let viabilityPolicy: import('../contracts/index.js').TurnFlowFreeOperationGrantViabilityPolicy | undefined;
  if (
    source.viabilityPolicy !== undefined
    && (typeof source.viabilityPolicy !== 'string' || !isTurnFlowFreeOperationGrantViabilityPolicy(source.viabilityPolicy))
  ) {
    diagnostics.push(...missingCapability(
      `${path}.viabilityPolicy`,
      'grantFreeOperation viabilityPolicy',
      source.viabilityPolicy,
      [...TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES],
    ).diagnostics);
  } else if (typeof source.viabilityPolicy === 'string') {
    viabilityPolicy = source.viabilityPolicy;
  }

  let completionPolicy: import('../contracts/index.js').TurnFlowFreeOperationGrantCompletionPolicy | undefined;
  if (
    source.completionPolicy !== undefined
    && (typeof source.completionPolicy !== 'string' || source.completionPolicy !== 'required')
  ) {
    diagnostics.push(...missingCapability(
      `${path}.completionPolicy`,
      'grantFreeOperation completionPolicy',
      source.completionPolicy,
      ['required'],
    ).diagnostics);
  } else if (typeof source.completionPolicy === 'string') {
    completionPolicy = source.completionPolicy;
  }

  let outcomePolicy: import('../contracts/index.js').TurnFlowFreeOperationGrantOutcomePolicy | undefined;
  if (
    source.outcomePolicy !== undefined
    && (typeof source.outcomePolicy !== 'string' || source.outcomePolicy !== 'mustChangeGameplayState')
  ) {
    diagnostics.push(...missingCapability(
      `${path}.outcomePolicy`,
      'grantFreeOperation outcomePolicy',
      source.outcomePolicy,
      ['mustChangeGameplayState'],
    ).diagnostics);
  } else if (typeof source.outcomePolicy === 'string') {
    outcomePolicy = source.outcomePolicy;
  }

  let postResolutionTurnFlow: import('../contracts/index.js').TurnFlowFreeOperationGrantPostResolutionTurnFlow | undefined;
  if (
    source.postResolutionTurnFlow !== undefined
    && (
      typeof source.postResolutionTurnFlow !== 'string'
      || !TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES.includes(
        source.postResolutionTurnFlow as import('../contracts/index.js').TurnFlowFreeOperationGrantPostResolutionTurnFlow,
      )
    )
  ) {
    diagnostics.push(...missingCapability(
      `${path}.postResolutionTurnFlow`,
      'grantFreeOperation postResolutionTurnFlow',
      source.postResolutionTurnFlow,
      [...TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES],
    ).diagnostics);
  } else if (typeof source.postResolutionTurnFlow === 'string') {
    postResolutionTurnFlow = source.postResolutionTurnFlow as import('../contracts/index.js').TurnFlowFreeOperationGrantPostResolutionTurnFlow;
  }

  let loweredSequence:
    | {
        readonly batch: string;
        readonly step: number;
        readonly progressionPolicy?: import('../contracts/index.js').TurnFlowFreeOperationGrantProgressionPolicy;
      }
    | undefined;
  if (source.sequence !== undefined) {
    if (
      !isRecord(source.sequence)
      || typeof source.sequence.batch !== 'string'
      || !isInteger(source.sequence.step)
      || source.sequence.step < 0
      || (
        source.sequence.progressionPolicy !== undefined
        && (
          typeof source.sequence.progressionPolicy !== 'string'
          || !isTurnFlowFreeOperationGrantProgressionPolicy(source.sequence.progressionPolicy)
        )
      )
    ) {
      diagnostics.push(
        ...missingCapability(`${path}.sequence`, 'grantFreeOperation sequence', source.sequence, [
          '{ batch: string, step: non-negative integer, progressionPolicy?: strictInOrder|implementWhatCanInOrder }',
        ]).diagnostics,
      );
    } else {
      loweredSequence = {
        batch: source.sequence.batch,
        step: source.sequence.step,
        ...(source.sequence.progressionPolicy === undefined ? {} : { progressionPolicy: source.sequence.progressionPolicy }),
      };
    }
  }

  let loweredSequenceContext: import('../kernel/free-operation-sequence-context-contract.js').FreeOperationSequenceContextContract | undefined;
  if (source.sequenceContext !== undefined) {
    const parsedSequenceContext = FreeOperationSequenceContextSchema.safeParse(source.sequenceContext);
    if (!parsedSequenceContext.success) {
      const primaryIssue = parsedSequenceContext.error.issues[0];
      const issueSuffix = primaryIssue?.path.length ? `.${primaryIssue.path.join('.')}` : '';
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path: `${path}.sequenceContext${issueSuffix}`,
        severity: 'error',
        message: `Cannot lower grantFreeOperation sequenceContext to kernel AST: ${primaryIssue?.message ?? formatValue(source.sequenceContext)}`,
        suggestion: 'Rewrite this node to the canonical sequenceContext shape.',
        alternatives: [
          '{ captureMoveZoneCandidatesAs: string }',
          '{ requireMoveZoneCandidatesFrom: string }',
          '{ captureMoveZoneCandidatesAs: string, requireMoveZoneCandidatesFrom: string }',
        ],
      });
    } else {
      loweredSequenceContext = {
        ...(parsedSequenceContext.data.captureMoveZoneCandidatesAs === undefined
          ? {}
          : { captureMoveZoneCandidatesAs: parsedSequenceContext.data.captureMoveZoneCandidatesAs }),
        ...(parsedSequenceContext.data.requireMoveZoneCandidatesFrom === undefined
          ? {}
          : { requireMoveZoneCandidatesFrom: parsedSequenceContext.data.requireMoveZoneCandidatesFrom }),
      };
    }
  }

  let loweredExecutionContext: FreeOperationExecutionContext | undefined;
  if (source.executionContext !== undefined) {
    const executionContext = lowerFreeOperationExecutionContextNode(
      source.executionContext,
      context,
      `${path}.executionContext`,
    );
    diagnostics.push(...executionContext.diagnostics);
    if (executionContext.value !== null) {
      loweredExecutionContext = executionContext.value;
    }
  }

  let loweredTokenInterpretations: import('../kernel/types.js').FreeOperationTokenInterpretationRule[] | undefined;
  if (source.tokenInterpretations !== undefined) {
    const tokenInterpretations = lowerFreeOperationTokenInterpretationsNode(
      source.tokenInterpretations,
      makeConditionContext(context, scope),
      `${path}.tokenInterpretations`,
    );
    diagnostics.push(...tokenInterpretations.diagnostics);
    if (tokenInterpretations.value !== null) {
      loweredTokenInterpretations = [...tokenInterpretations.value];
    }
  }

  for (const violation of collectTurnFlowFreeOperationGrantContractViolations({
    operationClass: source.operationClass,
    ...(uses === undefined ? {} : { uses }),
    ...(viabilityPolicy === undefined ? {} : { viabilityPolicy }),
    ...(moveZoneBindings === undefined ? {} : { moveZoneBindings }),
    ...(moveZoneProbeBindings === undefined ? {} : { moveZoneProbeBindings }),
    ...(completionPolicy === undefined ? {} : { completionPolicy }),
    ...(outcomePolicy === undefined ? {} : { outcomePolicy }),
    ...(postResolutionTurnFlow === undefined ? {} : { postResolutionTurnFlow }),
    ...(loweredSequence === undefined ? {} : { sequence: loweredSequence }),
    ...(loweredSequenceContext === undefined ? {} : { sequenceContext: loweredSequenceContext }),
    ...(loweredExecutionContext === undefined ? {} : { executionContext: loweredExecutionContext }),
    ...(loweredTokenInterpretations === undefined ? {} : { tokenInterpretations: loweredTokenInterpretations }),
  })) {
    const surface = renderTurnFlowFreeOperationGrantContractViolation(violation, {
      basePath: path,
    });
    if (violation.code === 'requiredPostResolutionTurnFlowMissing') {
      diagnostics.push(...missingCapability(
        surface.path,
        'grantFreeOperation postResolutionTurnFlow',
        source.postResolutionTurnFlow,
        [...TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES],
      ).diagnostics);
    }
    if (violation.code === 'postResolutionTurnFlowRequiresRequiredCompletionPolicy') {
      diagnostics.push(...missingCapability(
        surface.path,
        'grantFreeOperation completionPolicy',
        source.completionPolicy,
        [...TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES],
      ).diagnostics);
    }
    if (violation.code === 'sequenceContextRequiresSequence') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path: surface.path,
        severity: 'error',
        message: surface.message,
        suggestion: 'Declare sequence.batch and sequence.step when using sequenceContext.',
      });
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: grantFreeOperationBuilder({
      seat: source.seat,
      operationClass: source.operationClass,
      ...(effectId === undefined ? {} : { id: effectId }),
      ...(executeAsSeat === undefined ? {} : { executeAsSeat }),
      ...(actionIds === undefined ? {} : { actionIds }),
      ...(loweredZoneFilter === undefined ? {} : { zoneFilter: loweredZoneFilter }),
      ...(moveZoneBindings === undefined ? {} : { moveZoneBindings }),
      ...(moveZoneProbeBindings === undefined ? {} : { moveZoneProbeBindings }),
      ...(allowDuringMonsoon === undefined ? {} : { allowDuringMonsoon }),
      ...(uses === undefined ? {} : { uses }),
      ...(viabilityPolicy === undefined ? {} : { viabilityPolicy }),
      ...(completionPolicy === undefined ? {} : { completionPolicy }),
      ...(outcomePolicy === undefined ? {} : { outcomePolicy }),
      ...(postResolutionTurnFlow === undefined ? {} : { postResolutionTurnFlow }),
      ...(loweredSequence === undefined ? {} : { sequence: loweredSequence }),
      ...(loweredSequenceContext === undefined ? {} : { sequenceContext: loweredSequenceContext }),
      ...(loweredExecutionContext === undefined ? {} : { executionContext: loweredExecutionContext }),
      ...(loweredTokenInterpretations === undefined ? {} : { tokenInterpretations: loweredTokenInterpretations }),
    }),
    diagnostics,
  };
}

type LoweredGrantSequenceEntry = {
  readonly effectIndex: number;
  readonly sequencePath: string;
  readonly operationClass: string;
  readonly actionIds?: readonly string[];
  readonly zoneFilter?: ConditionAST;
  readonly sequence: {
    readonly batch: string;
    readonly step: number;
  };
};

export const collectFreeOperationSequenceViabilityWarnings = (
  effects: readonly EffectAST[],
  basePath: string,
  defaultActionIds: readonly string[] | undefined,
): readonly Diagnostic[] => {
  const grants: LoweredGrantSequenceEntry[] = effects.flatMap((effect, effectIndex) =>
    'grantFreeOperation' in effect && effect.grantFreeOperation.sequence !== undefined
      ? [{
          effectIndex,
          sequencePath: `${basePath}.${effectIndex}.grantFreeOperation.sequence`,
          operationClass: effect.grantFreeOperation.operationClass,
          ...(effect.grantFreeOperation.actionIds === undefined ? {} : { actionIds: effect.grantFreeOperation.actionIds }),
          ...(effect.grantFreeOperation.zoneFilter === undefined ? {} : { zoneFilter: effect.grantFreeOperation.zoneFilter }),
          sequence: effect.grantFreeOperation.sequence,
        }]
      : [],
  );
  if (grants.length === 0) {
    return [];
  }

  const byBatch = new Map<string, LoweredGrantSequenceEntry[]>();
  for (const grant of grants) {
    const existing = byBatch.get(grant.sequence.batch) ?? [];
    existing.push(grant);
    byBatch.set(grant.sequence.batch, existing);
  }

  const diagnostics: Diagnostic[] = [];
  for (const [batch, batchEntries] of byBatch.entries()) {
    if (batchEntries.length < 2) {
      continue;
    }
    const byStep = new Map<number, LoweredGrantSequenceEntry[]>();
    for (const entry of batchEntries) {
      const existing = byStep.get(entry.sequence.step) ?? [];
      existing.push(entry);
      byStep.set(entry.sequence.step, existing);
    }
    for (const [step, stepEntries] of byStep.entries()) {
      if (stepEntries.length < 2) {
        continue;
      }
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK,
        path: stepEntries[0]!.sequencePath,
        severity: 'warning',
        message:
          `Free-operation sequence batch "${batch}" has duplicate step ${String(step)}, which can lock later steps until one duplicate is consumed.`,
        suggestion: 'Assign unique `sequence.step` values per batch in event resolution order.',
      });
    }

    const ordered = [...batchEntries].sort((left, right) => left.sequence.step - right.sequence.step);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      const currentStepPath = current.sequencePath;

      if (previous.operationClass !== current.operationClass) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK,
          path: currentStepPath,
          severity: 'warning',
          message:
            `Free-operation sequence batch "${batch}" changes operationClass between step ${String(previous.sequence.step)} and ${String(current.sequence.step)}.`,
          suggestion: 'Confirm earlier sequence steps are reliably playable; otherwise later steps may remain blocked.',
        });
      }

      const previousEffectiveActionIds = resolveEffectiveFreeOperationActionDomain(previous.actionIds, defaultActionIds);
      const currentEffectiveActionIds = resolveEffectiveFreeOperationActionDomain(current.actionIds, defaultActionIds);
      const currentActions = new Set(currentEffectiveActionIds);
      const overlap = previousEffectiveActionIds.some((actionId) => currentActions.has(actionId));
      if (!overlap) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK,
          path: currentStepPath,
          severity: 'warning',
          message:
            `Free-operation sequence batch "${batch}" has non-overlapping actionIds between step ${String(previous.sequence.step)} and ${String(current.sequence.step)}.`,
          suggestion: 'Ensure the earlier step can be consumed in realistic states, or relax sequence constraints.',
        });
      }

      const previousFilter = previous.zoneFilter === undefined ? null : conditionFingerprint(previous.zoneFilter);
      const currentFilter = current.zoneFilter === undefined ? null : conditionFingerprint(current.zoneFilter);
      if (previousFilter !== null && currentFilter !== previousFilter) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK,
          path: currentStepPath,
          severity: 'warning',
          message:
            `Free-operation sequence batch "${batch}" uses different zoneFilter conditions between step ${String(previous.sequence.step)} and ${String(current.sequence.step)}.`,
          suggestion: 'Verify earlier step filters are not stricter than later steps in the same batch.',
        });
      }
    }
  }

  return diagnostics;
};
