import type { Diagnostic } from './diagnostics.js';
import type {
  EffectAST,
  EventBranchDef,
  EventFreeOperationGrantDef,
  EventLastingEffectDef,
  EventSideDef,
  EventTargetDef,
  GameDef,
} from './types.js';
import type { FreeOperationSequenceContextGrantLike } from './free-operation-sequence-context-contract.js';
import type { TurnFlowFreeOperationGrantProgressionPolicy } from '../contracts/index.js';
import {
  appendEventConditionSurfacePath,
  CONDITION_SURFACE_SUFFIX,
  conditionSurfacePathForTerminalConditionWhen,
  conditionSurfacePathForTriggerMatch,
  conditionSurfacePathForTriggerWhen,
  compareTurnFlowFreeOperationGrantPriority,
} from '../contracts/index.js';
import {
  type ValidationContext,
  pushMissingReferenceDiagnostic,
  validatePlayerSelector,
  validateZoneSelector,
} from './validate-gamedef-structure.js';
import {
  collectSequenceContextLinkageGrantReference,
  type SequenceContextLinkageGrantReference,
} from './sequence-context-linkage-grant-reference.js';
import {
  collectEffectGrantExecutionPaths,
  collectEffectGrantSequenceContextExecutionPaths,
} from './effect-grant-execution-paths.js';
import {
  effectIssuedFreeOperationGrantEquivalenceKey,
  effectIssuedFreeOperationGrantOverlapSurfaceKey,
  eventFreeOperationGrantEquivalenceKey,
  eventFreeOperationGrantOverlapSurfaceKey,
} from './free-operation-grant-overlap.js';
import { validateEffectAst, validateFreeOperationGrantContract } from './validate-effects.js';
import { validateNumericValueExpr } from './validate-values.js';
import { validateConditionAst } from './validate-conditions.js';
import { validateChoiceOptionsQueryContract, eventTargetChoiceEffectName } from './validate-queries.js';

// ---------------------------------------------------------------------------
// Event / post-adjacency validation
// ---------------------------------------------------------------------------

type EventFreeOperationGrantValidationScopeEntry = Readonly<{
  readonly grant: EventFreeOperationGrantDef;
  readonly path: string;
}>;

type EffectIssuedFreeOperationGrantDef = Extract<
  EffectAST,
  { readonly grantFreeOperation: unknown }
>['grantFreeOperation'];

type EffectFreeOperationGrantValidationScopeEntry = Readonly<{
  readonly grant: EffectIssuedFreeOperationGrantDef;
  readonly path: string;
}>;

type SequencedFreeOperationGrant = {
  readonly sequence?: {
    readonly batch?: unknown;
    readonly step?: unknown;
    readonly progressionPolicy?: unknown;
  };
};

const freeOperationGrantsCanCoissue = (
  left: { readonly sequence?: { readonly batch?: unknown; readonly step?: unknown } },
  right: { readonly sequence?: { readonly batch?: unknown; readonly step?: unknown } },
): boolean => {
  if (left.sequence === undefined || right.sequence === undefined) {
    return true;
  }
  return left.sequence.batch !== right.sequence.batch || left.sequence.step === right.sequence.step;
};

const DEFAULT_FREE_OPERATION_PROGRESSION_POLICY: TurnFlowFreeOperationGrantProgressionPolicy = 'strictInOrder';

const normalizeFreeOperationGrantProgressionPolicy = (
  grant: SequencedFreeOperationGrant,
): TurnFlowFreeOperationGrantProgressionPolicy => {
  const progressionPolicy = grant.sequence?.progressionPolicy;
  return progressionPolicy === 'implementWhatCanInOrder'
    ? progressionPolicy
    : DEFAULT_FREE_OPERATION_PROGRESSION_POLICY;
};

const validateMixedProgressionPolicyWithinBatch = <TGrant extends SequencedFreeOperationGrant>(
  diagnostics: Diagnostic[],
  grants: readonly Readonly<{ readonly grant: TGrant; readonly path: string }>[],
): void => {
  const byBatch = new Map<string, readonly Readonly<{ readonly grant: TGrant; readonly path: string }>[]>();
  for (const entry of grants) {
    const batch = entry.grant.sequence?.batch;
    if (typeof batch !== 'string' || batch.length === 0) {
      continue;
    }
    byBatch.set(batch, [...(byBatch.get(batch) ?? []), entry]);
  }

  for (const [batch, batchEntries] of byBatch.entries()) {
    if (batchEntries.length < 2) {
      continue;
    }
    const baselinePolicy = normalizeFreeOperationGrantProgressionPolicy(batchEntries[0]!.grant);
    const offenders = batchEntries.filter(
      (entry) => normalizeFreeOperationGrantProgressionPolicy(entry.grant) !== baselinePolicy,
    );
    if (offenders.length === 0) {
      continue;
    }
    for (const offender of batchEntries) {
      diagnostics.push({
        code: 'FREE_OPERATION_SEQUENCE_MIXED_PROGRESSION_POLICY',
        path: `${offender.path}.sequence.progressionPolicy`,
        severity: 'error',
        message:
          `freeOperationGrant sequence batch "${batch}" mixes progressionPolicy values; every step in a batch must resolve to the same policy.`,
        suggestion:
          'Set sequence.progressionPolicy consistently across the whole batch, or omit it everywhere to use the default strictInOrder contract.',
      });
    }
  }
};

const validateAmbiguousFreeOperationGrantOverlap = <TGrant extends {
  readonly sequence?: { readonly batch?: unknown; readonly step?: unknown };
  readonly completionPolicy?: string | null;
  readonly outcomePolicy?: string | null;
  readonly postResolutionTurnFlow?: string | null;
}>(
  diagnostics: Diagnostic[],
  grants: readonly Readonly<{ readonly grant: TGrant; readonly path: string }>[],
  options: {
    readonly overlapSurfaceKey: (grant: TGrant) => string;
    readonly equivalenceKey: (grant: TGrant) => string;
  },
): void => {
  for (let leftIndex = 0; leftIndex < grants.length; leftIndex += 1) {
    const left = grants[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < grants.length; rightIndex += 1) {
      const right = grants[rightIndex];
      if (right === undefined) {
        continue;
      }
      if (!freeOperationGrantsCanCoissue(left.grant, right.grant)) {
        continue;
      }
      if (options.overlapSurfaceKey(left.grant) !== options.overlapSurfaceKey(right.grant)) {
        continue;
      }
      if (compareTurnFlowFreeOperationGrantPriority(left.grant, right.grant) !== 0) {
        continue;
      }
      if (options.equivalenceKey(left.grant) === options.equivalenceKey(right.grant)) {
        continue;
      }
      diagnostics.push({
        code: 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS',
        path: left.path,
        severity: 'error',
        message:
          `freeOperationGrant overlaps ambiguously with ${right.path}; top-ranked overlapping grants must be `
          + 'contract-equivalent duplicates or differ by deterministic grant semantics.',
        suggestion:
          'Differentiate the grants by policy strength, actionIds, zoneFilter, moveZoneBindings, moveZoneProbeBindings, sequenceContext, or executionContext, or collapse them '
          + 'into equivalent duplicates.',
      });
      diagnostics.push({
        code: 'FREE_OPERATION_GRANT_OVERLAP_AMBIGUOUS',
        path: right.path,
        severity: 'error',
        message:
          `freeOperationGrant overlaps ambiguously with ${left.path}; top-ranked overlapping grants must be `
          + 'contract-equivalent duplicates or differ by deterministic grant semantics.',
        suggestion:
          'Differentiate the grants by policy strength, actionIds, zoneFilter, moveZoneBindings, moveZoneProbeBindings, sequenceContext, or executionContext, or collapse them '
          + 'into equivalent duplicates.',
      });
    }
  }
};

const validateAmbiguousEventFreeOperationGrantOverlap = (
  diagnostics: Diagnostic[],
  def: GameDef,
  grants: readonly EventFreeOperationGrantValidationScopeEntry[],
): void => {
  validateAmbiguousFreeOperationGrantOverlap(diagnostics, grants, {
    overlapSurfaceKey: (grant) => eventFreeOperationGrantOverlapSurfaceKey(def, grant),
    equivalenceKey: (grant) => eventFreeOperationGrantEquivalenceKey(def, grant),
  });
  validateMixedProgressionPolicyWithinBatch(diagnostics, grants);
};

const validateAmbiguousEffectIssuedFreeOperationGrantOverlap = (
  diagnostics: Diagnostic[],
  def: GameDef,
  grants: readonly EffectFreeOperationGrantValidationScopeEntry[],
): void => {
  validateAmbiguousFreeOperationGrantOverlap(diagnostics, grants, {
    overlapSurfaceKey: (grant) => effectIssuedFreeOperationGrantOverlapSurfaceKey(def, grant),
    equivalenceKey: (grant) => effectIssuedFreeOperationGrantEquivalenceKey(def, grant),
  });
  validateMixedProgressionPolicyWithinBatch(diagnostics, grants);
};

export const validatePostAdjacencyBehavior = (
  diagnostics: Diagnostic[],
  def: GameDef,
  context: ValidationContext,
  phaseCandidates: readonly string[],
  actionCandidates: readonly string[],
): void => {
  const validateEventTargets = (
    targets: readonly EventTargetDef[] | undefined,
    path: string,
  ): void => {
    targets?.forEach((target, targetIndex) => {
      const selectorPath = `${path}.targets[${targetIndex}].selector`;
      validateChoiceOptionsQueryContract(
        diagnostics,
        target.selector,
        selectorPath,
        context,
        eventTargetChoiceEffectName(target),
      );
      target.effects.forEach((effect, effectIndex) => {
        validateEffectAst(diagnostics, effect, `${path}.targets[${targetIndex}].effects[${effectIndex}]`, context);
      });
    });
  };

  const validateEventLastingEffects = (
    lastingEffects: readonly EventLastingEffectDef[] | undefined,
    path: string,
  ): void => {
    lastingEffects?.forEach((lastingEffect, lastingEffectIndex) => {
      lastingEffect.setupEffects.forEach((effect, effectIndex) => {
        validateEffectAst(
          diagnostics,
          effect,
          `${path}.lastingEffects[${lastingEffectIndex}].setupEffects[${effectIndex}]`,
          context,
        );
      });
      lastingEffect.teardownEffects?.forEach((effect, effectIndex) => {
        validateEffectAst(
          diagnostics,
          effect,
          `${path}.lastingEffects[${lastingEffectIndex}].teardownEffects[${effectIndex}]`,
          context,
        );
      });
    });
  };

  const validateEventBranchBehavior = (
    branch: EventBranchDef,
    path: string,
  ): void => {
    branch.freeOperationGrants?.forEach((grant, grantIndex) => {
      validateFreeOperationGrantContract(
        diagnostics,
        grant,
        `${path}.freeOperationGrants[${grantIndex}]`,
        context,
        { label: 'freeOperationGrant' },
      );
      if (grant.zoneFilter !== undefined) {
        validateConditionAst(
          diagnostics,
          grant.zoneFilter,
          appendEventConditionSurfacePath(
            `${path}.freeOperationGrants[${grantIndex}]`,
            CONDITION_SURFACE_SUFFIX.event.freeOperationGrantZoneFilter,
          ),
          context,
        );
      }
    });
    if (branch.freeOperationGrants !== undefined) {
      validateAmbiguousEventFreeOperationGrantOverlap(
        diagnostics,
        def,
        branch.freeOperationGrants.map((grant, grantIndex) => ({
          grant,
          path: `${path}.freeOperationGrants[${grantIndex}]`,
        })),
      );
    }
    branch.effects?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `${path}.effects[${effectIndex}]`, context);
    });
    validateEventTargets(branch.targets, path);
    validateEventLastingEffects(branch.lastingEffects, path);
  };

  const validateEventSideBehavior = (
    side: EventSideDef,
    path: string,
  ): void => {
    side.freeOperationGrants?.forEach((grant, grantIndex) => {
      validateFreeOperationGrantContract(
        diagnostics,
        grant,
        `${path}.freeOperationGrants[${grantIndex}]`,
        context,
        { label: 'freeOperationGrant' },
      );
      if (grant.zoneFilter !== undefined) {
        validateConditionAst(
          diagnostics,
          grant.zoneFilter,
          appendEventConditionSurfacePath(
            `${path}.freeOperationGrants[${grantIndex}]`,
            CONDITION_SURFACE_SUFFIX.event.freeOperationGrantZoneFilter,
          ),
          context,
        );
      }
    });
    if (side.freeOperationGrants !== undefined) {
      validateAmbiguousEventFreeOperationGrantOverlap(
        diagnostics,
        def,
        side.freeOperationGrants.map((grant, grantIndex) => ({
          grant,
          path: `${path}.freeOperationGrants[${grantIndex}]`,
        })),
      );
    }
    side.effects?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `${path}.effects[${effectIndex}]`, context);
    });
    validateEventTargets(side.targets, path);
    validateEventLastingEffects(side.lastingEffects, path);
    side.branches?.forEach((branch, branchIndex) => {
      const branchPath = `${path}.branches[${branchIndex}]`;
      validateEventBranchBehavior(branch, branchPath);
      if (side.freeOperationGrants !== undefined && branch.freeOperationGrants !== undefined) {
        validateAmbiguousEventFreeOperationGrantOverlap(
          diagnostics,
          def,
          [
            ...side.freeOperationGrants.map((grant, grantIndex) => ({
              grant,
              path: `${path}.freeOperationGrants[${grantIndex}]`,
            })),
            ...branch.freeOperationGrants.map((grant, grantIndex) => ({
              grant,
              path: `${branchPath}.freeOperationGrants[${grantIndex}]`,
            })),
          ],
        );
      }
    });
  };

  def.turnStructure.phases.forEach((phase, phaseIndex) => {
    phase.onEnter?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.phases[${phaseIndex}].onEnter[${effectIndex}]`, context);
    });
    phase.onExit?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.phases[${phaseIndex}].onExit[${effectIndex}]`, context);
    });
  });
  (def.turnStructure.interrupts ?? []).forEach((phase, phaseIndex) => {
    phase.onEnter?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.interrupts[${phaseIndex}].onEnter[${effectIndex}]`, context);
    });
    phase.onExit?.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `turnStructure.interrupts[${phaseIndex}].onExit[${effectIndex}]`, context);
    });
  });

  def.triggers.forEach((trigger, triggerIndex) => {
    if (trigger.event.type === 'phaseEnter' || trigger.event.type === 'phaseExit') {
      if (!phaseCandidates.includes(trigger.event.phase)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_PHASE_MISSING',
          `triggers[${triggerIndex}].event.phase`,
          `Unknown phase "${trigger.event.phase}".`,
          trigger.event.phase,
          phaseCandidates,
        );
      }
    }

    if (trigger.event.type === 'actionResolved' && trigger.event.action) {
      if (!actionCandidates.includes(trigger.event.action)) {
        pushMissingReferenceDiagnostic(
          diagnostics,
          'REF_ACTION_MISSING',
          `triggers[${triggerIndex}].event.action`,
          `Unknown action "${trigger.event.action}".`,
          trigger.event.action,
          actionCandidates,
        );
      }
    }

    if (trigger.event.type === 'tokenEntered' && trigger.event.zone) {
      validateZoneSelector(diagnostics, trigger.event.zone, `triggers[${triggerIndex}].event.zone`, context);
    }

    if (trigger.event.type === 'varChanged' && trigger.event.var) {
      const globalVarNames = def.globalVars.map((variable) => variable.name);
      const perPlayerVarNames = def.perPlayerVars.map((variable) => variable.name);
      const zoneVarNames = (def.zoneVars ?? []).map((variable) => variable.name);
      const candidateNames =
        trigger.event.scope === 'global'
          ? globalVarNames
          : trigger.event.scope === 'perPlayer'
            ? perPlayerVarNames
            : trigger.event.scope === 'zone'
              ? zoneVarNames
              : [...globalVarNames, ...perPlayerVarNames, ...zoneVarNames];
      if (!candidateNames.includes(trigger.event.var)) {
        diagnostics.push({
          code: 'REF_VAR_MISSING',
          path: `triggers[${triggerIndex}].event.var`,
          severity: 'error',
          message: `Unknown variable "${trigger.event.var}".`,
          suggestion: 'Use one of the declared globalVars/perPlayerVars/zoneVars names.',
        });
      }
    }

    if (trigger.match) {
      validateConditionAst(diagnostics, trigger.match, conditionSurfacePathForTriggerMatch(triggerIndex), context);
    }

    if (trigger.when) {
      validateConditionAst(diagnostics, trigger.when, conditionSurfacePathForTriggerWhen(triggerIndex), context);
    }

    trigger.effects.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `triggers[${triggerIndex}].effects[${effectIndex}]`, context);
    });
  });

  (def.eventDecks ?? []).forEach((deck, deckIndex) => {
    deck.cards.forEach((card, cardIndex) => {
      if (card.playCondition !== undefined) {
        validateConditionAst(
          diagnostics,
          card.playCondition,
          appendEventConditionSurfacePath(
            `eventDecks[${deckIndex}].cards[${cardIndex}]`,
            CONDITION_SURFACE_SUFFIX.event.playCondition,
          ),
          context,
        );
      }
      const sides = [
        ['unshaded', card.unshaded],
        ['shaded', card.shaded],
      ] as const;
      for (const [sideId, side] of sides) {
        if (side === undefined) {
          continue;
        }
        validateEventSideBehavior(side, `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}`);
      }
    });
  });

  validateFreeOperationGrantSequenceContextLinkage(diagnostics, def);

  const terminal = def.terminal;
  if (!terminal) {
    return;
  }

  terminal.conditions.forEach((endCondition, endConditionIndex) => {
    if (endCondition.result.type === 'win') {
      validatePlayerSelector(diagnostics, endCondition.result.player, `terminal.conditions[${endConditionIndex}].result.player`, context);
    }
    if (endCondition.result.type === 'score' && !terminal.scoring) {
      diagnostics.push({
        code: 'SCORING_REQUIRED_FOR_SCORE_RESULT',
        path: `terminal.conditions[${endConditionIndex}].result`,
        severity: 'error',
        message: 'End condition with result.type "score" requires a scoring definition.',
        suggestion: 'Add def.terminal.scoring or change end condition result.type.',
      });
    }

    validateConditionAst(
      diagnostics,
      endCondition.when,
      conditionSurfacePathForTerminalConditionWhen(endConditionIndex),
      context,
    );
  });

  if (terminal.scoring) {
    validateNumericValueExpr(diagnostics, terminal.scoring.value, 'terminal.scoring.value', context);
    const usesScoreResult = terminal.conditions.some((endCondition) => endCondition.result.type === 'score');
    if (!usesScoreResult) {
      diagnostics.push({
        code: 'SCORING_UNUSED',
        path: 'terminal.scoring',
        severity: 'warning',
        message: 'scoring is configured but no end condition uses result.type "score".',
        suggestion: 'Add a score-based end condition or remove scoring.',
      });
    }
  }
};

// ---------------------------------------------------------------------------
// Sequence context linkage validation
// ---------------------------------------------------------------------------

const validateSequenceContextLinkageForReferences = (
  diagnostics: Diagnostic[],
  references: readonly SequenceContextLinkageGrantReference[],
): void => {
  for (const reference of references) {
    const requireKey = reference.requireKey;
    if (requireKey === undefined) {
      continue;
    }

    const matchingCaptures = references.filter(
      (candidate) =>
        candidate.batch === reference.batch
        && candidate.captureKey === requireKey,
    );
    if (matchingCaptures.some((candidate) => candidate.step < reference.step)) {
      continue;
    }

    const code = matchingCaptures.some((candidate) => candidate.step >= reference.step)
      ? 'FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_ORDER_INVALID'
      : 'FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_MISSING';
    const message = code === 'FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_ORDER_INVALID'
      ? `requireMoveZoneCandidatesFrom "${requireKey}" in sequence batch "${reference.batch}" must reference a capture from an earlier sequence.step.`
      : `requireMoveZoneCandidatesFrom "${requireKey}" in sequence batch "${reference.batch}" has no matching captureMoveZoneCandidatesAs.`;
    diagnostics.push({
      code,
      path: `${reference.path}.sequenceContext.requireMoveZoneCandidatesFrom`,
      severity: 'error',
      message,
      suggestion:
        code === 'FREE_OPERATION_SEQUENCE_CONTEXT_REQUIRE_CAPTURE_ORDER_INVALID'
          ? `Move captureMoveZoneCandidatesAs "${requireKey}" to a lower step in batch "${reference.batch}", or change the required key.`
          : `Add an earlier captureMoveZoneCandidatesAs "${requireKey}" step in batch "${reference.batch}", or change the required key.`,
    });
  }
};

const validateFreeOperationGrantSequenceContextLinkage = (
  diagnostics: Diagnostic[],
  def: GameDef,
): void => {
  type SequenceContextLinkageScope = {
    readonly value: unknown;
    readonly path: string;
  };

  const validateEventGrantScope = (
    scopes: readonly SequenceContextLinkageScope[],
  ): void => {
    const references: SequenceContextLinkageGrantReference[] = [];
    scopes.forEach(({ value, path }) => {
      if (!Array.isArray(value)) {
        return;
      }
      value.forEach((grant, grantIndex) => {
        const reference = collectSequenceContextLinkageGrantReference(
          grant as FreeOperationSequenceContextGrantLike,
          `${path}[${grantIndex}]`,
        );
        if (reference !== null) {
          references.push(reference);
        }
      });
    });
    validateSequenceContextLinkageForReferences(diagnostics, references);
  };
  const validateEffectGrantScope = (
    scopes: readonly SequenceContextLinkageScope[],
  ): void => {
    let executionPaths: readonly (readonly SequenceContextLinkageGrantReference[])[] = [[]];
    let overlapValidationPaths: readonly (readonly EffectFreeOperationGrantValidationScopeEntry[])[] = [[]];
    scopes.forEach(({ value, path }) => {
      if (!Array.isArray(value)) {
        return;
      }
      const scopeExecutionPaths = collectEffectGrantSequenceContextExecutionPaths(
        value as readonly EffectAST[],
        path,
      );
      executionPaths = executionPaths.flatMap((existingPath) =>
        scopeExecutionPaths.map((scopePath) => [...existingPath, ...scopePath]),
      );
      const scopeOverlapValidationPaths = collectEffectGrantExecutionPaths(
        value as readonly EffectAST[],
        path,
        (grant, grantPath) => ({
          grant,
          path: grantPath,
        }),
      );
      overlapValidationPaths = overlapValidationPaths.flatMap((existingPath) =>
        scopeOverlapValidationPaths.map((scopePath) => [...existingPath, ...scopePath]),
      );
    });
    executionPaths.forEach((references) => {
      validateSequenceContextLinkageForReferences(diagnostics, references);
    });
    overlapValidationPaths.forEach((grants) => {
      validateAmbiguousEffectIssuedFreeOperationGrantOverlap(diagnostics, def, grants);
    });
  };

  (def.eventDecks ?? []).forEach((deck, deckIndex) => {
    deck.cards.forEach((card, cardIndex) => {
      const sides = [
        ['unshaded', card.unshaded],
        ['shaded', card.shaded],
      ] as const;
      for (const [sideId, side] of sides) {
        if (side === undefined) {
          continue;
        }
        const sideGrantScopes = [
          {
            value: side.freeOperationGrants,
            path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.freeOperationGrants`,
          },
        ] as const;
        validateEventGrantScope(sideGrantScopes);
        side.branches?.forEach((branch, branchIndex) => {
          validateEventGrantScope([
            ...sideGrantScopes,
            {
              value: branch.freeOperationGrants,
              path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.branches[${branchIndex}].freeOperationGrants`,
            },
          ]);
        });
      }
    });
  });

  validateEffectGrantScope([{ value: def.setup, path: 'setup' }]);
  def.actions.forEach((action, actionIndex) => {
    const actionRecord = action as unknown as Readonly<Record<string, unknown>>;
    validateEffectGrantScope([{ value: actionRecord.cost, path: `actions[${actionIndex}].cost` }]);
    validateEffectGrantScope([{ value: actionRecord.effects, path: `actions[${actionIndex}].effects` }]);
  });
  (def.actionPipelines ?? []).forEach((pipeline, pipelineIndex) => {
    const pipelineRecord = pipeline as unknown as Readonly<Record<string, unknown>>;
    validateEffectGrantScope([
      {
        value: pipelineRecord.costEffects,
        path: `actionPipelines[${pipelineIndex}].costEffects`,
      },
    ]);
    const stages = pipelineRecord.stages;
    if (!Array.isArray(stages)) {
      return;
    }
    stages.forEach((stage, stageIndex) => {
      const stageRecord =
        typeof stage === 'object' && stage !== null
          ? stage as Readonly<Record<string, unknown>>
          : {};
      validateEffectGrantScope([
        {
          value: stageRecord.effects,
          path: `actionPipelines[${pipelineIndex}].stages[${stageIndex}].effects`,
        },
      ]);
    });
  });
  def.turnStructure.phases.forEach((phase, phaseIndex) => {
    validateEffectGrantScope([{ value: phase.onEnter, path: `turnStructure.phases[${phaseIndex}].onEnter` }]);
    validateEffectGrantScope([{ value: phase.onExit, path: `turnStructure.phases[${phaseIndex}].onExit` }]);
  });
  (def.turnStructure.interrupts ?? []).forEach((interrupt, interruptIndex) => {
    validateEffectGrantScope([{ value: interrupt.onEnter, path: `turnStructure.interrupts[${interruptIndex}].onEnter` }]);
    validateEffectGrantScope([{ value: interrupt.onExit, path: `turnStructure.interrupts[${interruptIndex}].onExit` }]);
  });
  def.triggers.forEach((trigger, triggerIndex) => {
    validateEffectGrantScope([{ value: trigger.effects, path: `triggers[${triggerIndex}].effects` }]);
  });
  (def.eventDecks ?? []).forEach((deck, deckIndex) => {
    deck.cards.forEach((card, cardIndex) => {
      const sides = [
        ['unshaded', card.unshaded],
        ['shaded', card.shaded],
      ] as const;
      for (const [sideId, side] of sides) {
        if (side === undefined) {
          continue;
        }
        const sideEventEffectScopes: SequenceContextLinkageScope[] = [
          ...(side.targets?.map((target, targetIndex) => ({
            value: target.effects,
            path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.targets[${targetIndex}].effects`,
          })) ?? []),
          {
            value: side.effects,
            path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.effects`,
          },
        ];
        validateEffectGrantScope(sideEventEffectScopes);
        side.lastingEffects?.forEach((lastingEffect, lastingEffectIndex) => {
          validateEffectGrantScope([
            {
              value: lastingEffect.setupEffects,
              path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.lastingEffects[${lastingEffectIndex}].setupEffects`,
            },
          ]);
          validateEffectGrantScope([
            {
              value: lastingEffect.teardownEffects,
              path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.lastingEffects[${lastingEffectIndex}].teardownEffects`,
            },
          ]);
        });
        side.branches?.forEach((branch, branchIndex) => {
          validateEffectGrantScope([
            ...(side.targets?.map((target, targetIndex) => ({
              value: target.effects,
              path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.targets[${targetIndex}].effects`,
            })) ?? []),
            ...(branch.targets?.map((target, targetIndex) => ({
              value: target.effects,
              path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.branches[${branchIndex}].targets[${targetIndex}].effects`,
            })) ?? []),
            {
              value: side.effects,
              path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.effects`,
            },
            {
              value: branch.effects,
              path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.branches[${branchIndex}].effects`,
            },
          ]);
          branch.lastingEffects?.forEach((lastingEffect, lastingEffectIndex) => {
            validateEffectGrantScope([
              {
                value: lastingEffect.setupEffects,
                path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.branches[${branchIndex}].lastingEffects[${lastingEffectIndex}].setupEffects`,
              },
            ]);
            validateEffectGrantScope([
              {
                value: lastingEffect.teardownEffects,
                path: `eventDecks[${deckIndex}].cards[${cardIndex}].${sideId}.branches[${branchIndex}].lastingEffects[${lastingEffectIndex}].teardownEffects`,
              },
            ]);
          });
        });
      }
    });
  });
};
