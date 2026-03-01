import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EffectAST, EventSideDef, ZoneRef } from '../kernel/types.js';
import { buildCardDrivenTurnFlowSemanticRequirements, evaluateActionSelectorContracts } from '../contracts/index.js';
import { buildActionSelectorContractViolationDiagnostic } from './action-selector-contract-diagnostics.js';
import type { CompileSectionResults } from './compiler-core.js';
import { CNL_XREF_DIAGNOSTIC_CODES, type CnlXrefDiagnosticCode } from './cross-validate-diagnostic-codes.js';
import type { SeatIdentityContract } from './seat-identity-contract.js';
import { isRecord, normalizeIdentifier, pushMissingReferenceDiagnostic } from './validate-spec-shared.js';

export function crossValidateSpec(
  sections: CompileSectionResults,
  seatIdentityContract: SeatIdentityContract,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const phaseTargets = collectIdentifierTargets([
    ...(sections.turnStructure?.phases.map((phase) => phase.id) ?? []),
    ...(sections.turnStructure?.interrupts?.map((phase) => phase.id) ?? []),
  ]);
  const actionTargets = collectIdentifierTargets(sections.actions?.map((action) => action.id));
  const zoneTargets = collectIdentifierTargets(sections.zones?.map((zone) => zone.id));
  const tokenTypeTargets = collectIdentifierTargets(sections.tokenTypes?.map((tokenType) => tokenType.id));
  const cardDrivenTurnFlow = sections.turnOrder?.type === 'cardDriven' ? sections.turnOrder.config.turnFlow : null;
  const seatTargets = collectIdentifierTargets(seatIdentityContract.referenceSeatIds);
  const windowTargets = collectIdentifierTargets(cardDrivenTurnFlow?.eligibility.overrideWindows.map((window) => window.id));
  const globalVarTargets = collectIdentifierTargets(sections.globalVars?.map((globalVar) => globalVar.name));
  const perPlayerVarTargets = collectIdentifierTargets(sections.perPlayerVars?.map((playerVar) => playerVar.name));

  if (sections.actions !== null && sections.turnStructure !== null) {
    for (const [actionIndex, action] of sections.actions.entries()) {
      for (const [phaseIndex, phase] of action.phase.entries()) {
        pushMissingIdentifierDiagnostic(
          diagnostics,
          CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ACTION_PHASE_MISSING,
          `doc.actions.${actionIndex}.phase.${phaseIndex}`,
          phase,
          phaseTargets,
          `Action "${action.id}" references unknown phase "${phase}".`,
          'Use one of the declared turnStructure.phases/interrupts ids.',
        );
      }
    }
  }

  if (sections.actionPipelines !== null && sections.actions !== null) {
    const pipelinedActionIds = new Set(sections.actionPipelines.map((profile) => String(profile.actionId)));
    for (const [profileIndex, profile] of sections.actionPipelines.entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_PROFILE_ACTION_MISSING,
        `doc.actionPipelines.${profileIndex}.actionId`,
        String(profile.actionId),
        actionTargets,
        `Operation profile "${profile.id}" references unknown action "${String(profile.actionId)}".`,
        'Use one of the declared action ids.',
      );
    }

    for (const [actionIndex, action] of sections.actions.entries()) {
      if (!pipelinedActionIds.has(String(action.id))) {
        continue;
      }
      const selectorContractViolations = evaluateActionSelectorContracts({
        selectors: {
          actor: action.actor,
          executor: action.executor,
        },
        declaredBindings: action.params.map((param) => param.name),
        hasPipeline: true,
        enforceBindingDeclaration: false,
      });
      for (const violation of selectorContractViolations) {
        diagnostics.push(
          buildActionSelectorContractViolationDiagnostic({
          violation,
          path: `doc.actions.${actionIndex}.${violation.role}`,
          actionId: String(action.id),
          surface: 'crossValidate',
          }),
        );
      }
    }
  }

  if (sections.actionPipelines !== null && cardDrivenTurnFlow !== null) {
    for (const [profileIndex, profile] of sections.actionPipelines.entries()) {
      for (const [windowIndex, windowId] of (profile.linkedWindows ?? []).entries()) {
        pushMissingIdentifierDiagnostic(
          diagnostics,
          CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_PROFILE_WINDOW_MISSING,
          `doc.actionPipelines.${profileIndex}.linkedWindows.${windowIndex}`,
          windowId,
          windowTargets,
          `Operation profile "${profile.id}" references unknown eligibility override window "${windowId}".`,
          'Use one of the declared turnFlow.eligibility.overrideWindows ids.',
        );
      }
    }
  }

  if (cardDrivenTurnFlow !== null) {
    for (const [seatIndex, seat] of cardDrivenTurnFlow.eligibility.seats.entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_ELIGIBILITY_SEAT_MISSING,
        `doc.turnOrder.config.turnFlow.eligibility.seats.${seatIndex}`,
        seat,
        seatTargets,
        `turnFlow.eligibility.seats[${seatIndex}] references unknown seat "${seat}".`,
        'Use one of the declared seat catalog ids.',
      );
    }

    const pipelineDecisionParamsByActionId = new Map<string, Set<string>>();
    for (const profile of sections.actionPipelines ?? []) {
      const actionId = String(profile.actionId);
      const existing = pipelineDecisionParamsByActionId.get(actionId) ?? new Set<string>();
      for (const bindName of collectChoiceBindingNames(profile.stages as unknown)) {
        existing.add(bindName);
      }
      pipelineDecisionParamsByActionId.set(actionId, existing);
    }

    for (const [actionId, mappedClass] of Object.entries(cardDrivenTurnFlow.actionClassByActionId)) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_ACTION_CLASS_ACTION_MISSING,
        `doc.turnOrder.config.turnFlow.actionClassByActionId.${actionId}`,
        actionId,
        actionTargets,
        `turnFlow.actionClassByActionId maps unknown action "${actionId}" to class "${mappedClass}".`,
        'Use one of the declared action ids.',
      );
    }

    for (const [actionIndex, actionId] of (cardDrivenTurnFlow.freeOperationActionIds ?? []).entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_FREE_OPERATION_ACTION_MISSING,
        `doc.turnOrder.config.turnFlow.freeOperationActionIds.${actionIndex}`,
        actionId,
        actionTargets,
        `turnFlow.freeOperationActionIds references unknown action "${actionId}".`,
        'Use one of the declared action ids.',
      );
    }

    const actionsById = new Map<string, { readonly params: readonly { readonly name: string }[] }>();
    for (const action of sections.actions ?? []) {
      actionsById.set(String(action.id), action);
    }
    for (const [restrictionIndex, restriction] of (cardDrivenTurnFlow.monsoon?.restrictedActions ?? []).entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_MONSOON_RESTRICTION_ACTION_MISSING,
        `doc.turnOrder.config.turnFlow.monsoon.restrictedActions.${restrictionIndex}.actionId`,
        restriction.actionId,
        actionTargets,
        `turnFlow.monsoon.restrictedActions[${restrictionIndex}] references unknown action "${restriction.actionId}".`,
        'Use one of the declared action ids.',
      );

      const action = actionsById.get(restriction.actionId);
      if (action === undefined) {
        continue;
      }
      const knownParamNames = [
        ...action.params.map((param) => param.name),
        ...[...(pipelineDecisionParamsByActionId.get(restriction.actionId) ?? new Set<string>())],
      ];
      const actionParamTargets = collectIdentifierTargets(knownParamNames);

      if (restriction.maxParam !== undefined) {
        pushMissingIdentifierDiagnostic(
          diagnostics,
          CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_MONSOON_MAX_PARAM_MISSING,
          `doc.turnOrder.config.turnFlow.monsoon.restrictedActions.${restrictionIndex}.maxParam.name`,
          restriction.maxParam.name,
          actionParamTargets,
          `Monsoon restriction for action "${restriction.actionId}" references unknown maxParam "${restriction.maxParam.name}".`,
          'Use one of the action parameter names declared for that action.',
        );
      }

      if (restriction.maxParamsTotal !== undefined) {
        const seenNames = new Set<string>();
        for (const [nameIndex, name] of restriction.maxParamsTotal.names.entries()) {
          pushMissingIdentifierDiagnostic(
            diagnostics,
            CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_MONSOON_MAX_PARAMS_TOTAL_PARAM_MISSING,
            `doc.turnOrder.config.turnFlow.monsoon.restrictedActions.${restrictionIndex}.maxParamsTotal.names.${nameIndex}`,
            name,
            actionParamTargets,
            `Monsoon restriction for action "${restriction.actionId}" references unknown maxParamsTotal parameter "${name}".`,
            'Use one of the action parameter names declared for that action.',
          );

          if (!seenNames.has(name)) {
            seenNames.add(name);
            continue;
          }
          diagnostics.push({
            code: CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_MONSOON_MAX_PARAMS_TOTAL_PARAM_DUPLICATE,
            path: `doc.turnOrder.config.turnFlow.monsoon.restrictedActions.${restrictionIndex}.maxParamsTotal.names.${nameIndex}`,
            severity: 'error',
            message: `Monsoon restriction for action "${restriction.actionId}" repeats maxParamsTotal parameter "${name}".`,
            suggestion: 'List each parameter at most once in maxParamsTotal.names.',
          });
        }
      }
    }

    const cancellationRules = cardDrivenTurnFlow.pivotal?.interrupt?.cancellation ?? [];
    for (const [ruleIndex, rule] of cancellationRules.entries()) {
      if (rule.winner.actionId !== undefined) {
        pushMissingIdentifierDiagnostic(
          diagnostics,
          CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_PIVOTAL_CANCELLATION_ACTION_MISSING,
          `doc.turnOrder.config.turnFlow.pivotal.interrupt.cancellation.${ruleIndex}.winner.actionId`,
          rule.winner.actionId,
          actionTargets,
          `Pivotal interrupt cancellation winner selector references unknown action "${rule.winner.actionId}".`,
          'Use one of the declared action ids.',
        );
      }
      if (rule.canceled.actionId !== undefined) {
        pushMissingIdentifierDiagnostic(
          diagnostics,
          CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_PIVOTAL_CANCELLATION_ACTION_MISSING,
          `doc.turnOrder.config.turnFlow.pivotal.interrupt.cancellation.${ruleIndex}.canceled.actionId`,
          rule.canceled.actionId,
          actionTargets,
          `Pivotal interrupt cancellation canceled selector references unknown action "${rule.canceled.actionId}".`,
          'Use one of the declared action ids.',
        );
      }
    }

    if (sections.actions !== null) {
      const actionIds = new Set(sections.actions.map((action) => String(action.id)));
      const semanticRequirements = buildCardDrivenTurnFlowSemanticRequirements(
        sections.actions.map((action) => ({
          id: String(action.id),
          ...(action.capabilities === undefined ? {} : { capabilities: action.capabilities }),
        })),
        {
          ...(cardDrivenTurnFlow.pivotal?.actionIds === undefined
            ? {}
            : { pivotalActionIds: cardDrivenTurnFlow.pivotal.actionIds }),
        },
      );

      for (const requirement of semanticRequirements.classRequirements) {
        if (!actionIds.has(requirement.actionId)) {
          continue;
        }
        const path = `doc.turnOrder.config.turnFlow.actionClassByActionId.${requirement.actionId}`;
        const mappedClass = cardDrivenTurnFlow.actionClassByActionId[requirement.actionId];
        if (mappedClass === undefined) {
          diagnostics.push({
            code: CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_ACTION_CLASS_REQUIRED_MISSING,
            path,
            severity: 'error',
            message: `turnFlow.actionClassByActionId must include required action "${requirement.actionId}".`,
            suggestion: `Add "${requirement.actionId}: ${requirement.requiredClass}" to actionClassByActionId.`,
          });
          continue;
        }
        if (mappedClass !== requirement.requiredClass) {
          diagnostics.push({
            code: CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_ACTION_CLASS_REQUIRED_MISMATCH,
            path,
            severity: 'error',
            message: `turnFlow.actionClassByActionId maps "${requirement.actionId}" to "${mappedClass}" but must be "${requirement.requiredClass}".`,
            suggestion: `Set "${requirement.actionId}" to "${requirement.requiredClass}" in actionClassByActionId.`,
          });
        }
      }
    }
  }

  if (sections.triggers !== null && sections.turnStructure !== null) {
    for (const [triggerIndex, trigger] of sections.triggers.entries()) {
      if (trigger.event.type !== 'phaseEnter' && trigger.event.type !== 'phaseExit') {
        continue;
      }
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TRIGGER_PHASE_MISSING,
        `doc.triggers.${triggerIndex}.event.phase`,
        trigger.event.phase,
        phaseTargets,
        `Trigger "${trigger.id}" references unknown phase "${trigger.event.phase}".`,
        'Use one of the declared turnStructure.phases/interrupts ids.',
      );
    }
  }

  if (sections.triggers !== null && sections.actions !== null) {
    for (const [triggerIndex, trigger] of sections.triggers.entries()) {
      if (trigger.event.type !== 'actionResolved' || trigger.event.action === undefined) {
        continue;
      }
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TRIGGER_ACTION_MISSING,
        `doc.triggers.${triggerIndex}.event.action`,
        String(trigger.event.action),
        actionTargets,
        `Trigger "${trigger.id}" references unknown action "${String(trigger.event.action)}".`,
        'Use one of the declared action ids.',
      );
    }
  }

  if (sections.triggers !== null && (sections.globalVars !== null || sections.perPlayerVars !== null)) {
    for (const [triggerIndex, trigger] of sections.triggers.entries()) {
      if (trigger.event.type !== 'varChanged' || trigger.event.var === undefined) {
        continue;
      }

      const targets =
        trigger.event.scope === 'global'
          ? globalVarTargets
          : trigger.event.scope === 'perPlayer'
            ? perPlayerVarTargets
            : mergeIdentifierTargets(globalVarTargets, perPlayerVarTargets);
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TRIGGER_VAR_MISSING,
        `doc.triggers.${triggerIndex}.event.var`,
        trigger.event.var,
        targets,
        `Trigger "${trigger.id}" references unknown variable "${trigger.event.var}".`,
        'Use one of the declared globalVars/perPlayerVars names.',
      );
    }
  }

  if (sections.terminal?.checkpoints !== undefined && cardDrivenTurnFlow !== null) {
    for (const [checkpointIndex, checkpoint] of sections.terminal.checkpoints.entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_VICTORY_SEAT_MISSING,
        `doc.terminal.checkpoints.${checkpointIndex}.seat`,
        checkpoint.seat,
        seatTargets,
        `Victory checkpoint "${checkpoint.id}" references unknown seat "${checkpoint.seat}".`,
        'Use one of the declared seat ids.',
      );
    }

    for (const [marginIndex, margin] of (sections.terminal.margins ?? []).entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_MARGIN_SEAT_MISSING,
        `doc.terminal.margins.${marginIndex}.seat`,
        margin.seat,
        seatTargets,
        `Victory margin references unknown seat "${margin.seat}".`,
        'Use one of the declared seat ids.',
      );
    }
  }

  if (sections.setup !== null && sections.zones !== null) {
    walkEffects(sections.setup, 'doc.setup', (effect, path) => {
      if (!('createToken' in effect)) {
        return;
      }
      pushMissingZoneRefDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_SETUP_ZONE_MISSING,
        `${path}.createToken.zone`,
        effect.createToken.zone,
        zoneTargets,
        'Create-token setup effect references unknown zone.',
      );
    });
  }

  if (sections.setup !== null && sections.tokenTypes !== null) {
    walkEffects(sections.setup, 'doc.setup', (effect, path) => {
      if (!('createToken' in effect)) {
        return;
      }
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_SETUP_TOKEN_TYPE_MISSING,
        `${path}.createToken.type`,
        effect.createToken.type,
        tokenTypeTargets,
        `Create-token setup effect references unknown token type "${effect.createToken.type}".`,
        'Use one of the declared tokenTypes ids.',
      );
    });
  }

  if (sections.actions !== null && sections.zones !== null) {
    for (const [actionIndex, action] of sections.actions.entries()) {
      walkEffects(action.effects, `doc.actions.${actionIndex}.effects`, (effect, path) => {
        pushEffectZoneDiagnostics(
          diagnostics,
          effect,
          path,
          zoneTargets,
          CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EFFECT_ZONE_MISSING,
          `Action "${action.id}" references unknown zone`,
        );
      });
    }
  }

  if (sections.eventDecks !== null && sections.zones !== null) {
    for (const [deckIndex, deck] of sections.eventDecks.entries()) {
      const deckPath = `doc.eventDecks.${deckIndex}`;
      pushMissingZoneRefDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_ZONE_MISSING,
        `${deckPath}.drawZone`,
        deck.drawZone,
        zoneTargets,
        `Event deck "${deck.id}" references unknown drawZone.`,
      );
      pushMissingZoneRefDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_ZONE_MISSING,
        `${deckPath}.discardZone`,
        deck.discardZone,
        zoneTargets,
        `Event deck "${deck.id}" references unknown discardZone.`,
      );

      for (const [cardIndex, card] of deck.cards.entries()) {
        validateEventCardSide(
          diagnostics,
          card.unshaded,
          `${deckPath}.cards.${cardIndex}.unshaded`,
          zoneTargets,
          card.id,
          seatTargets,
          windowTargets,
          actionTargets,
          cardDrivenTurnFlow !== null,
        );
        validateEventCardSide(
          diagnostics,
          card.shaded,
          `${deckPath}.cards.${cardIndex}.shaded`,
          zoneTargets,
          card.id,
          seatTargets,
          windowTargets,
          actionTargets,
          cardDrivenTurnFlow !== null,
        );

        if (
          card.tags !== undefined &&
          card.tags.includes('pivotal') &&
          card.playCondition === undefined
        ) {
          diagnostics.push({
            code: CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_PIVOTAL_PLAY_CONDITION_MISSING,
            severity: 'warning',
            path: `${deckPath}.cards.${cardIndex}.playCondition`,
            message: `Pivotal event card "${card.id}" has tag "pivotal" but no playCondition defined.`,
            suggestion: 'Add a playCondition to specify when this pivotal event can be played.',
          });
        }
      }
    }
  }

  if (cardDrivenTurnFlow !== null && sections.zones !== null) {
    pushMissingIdentifierDiagnostic(
      diagnostics,
      CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_LIFECYCLE_ZONE_MISSING,
      'doc.turnOrder.config.turnFlow.cardLifecycle.played',
      cardDrivenTurnFlow.cardLifecycle.played,
      zoneTargets,
      `turnOrder.config.turnFlow.cardLifecycle.played references unknown zone "${cardDrivenTurnFlow.cardLifecycle.played}".`,
      'Use one of the declared zone ids.',
    );
    pushMissingIdentifierDiagnostic(
      diagnostics,
      CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_LIFECYCLE_ZONE_MISSING,
      'doc.turnOrder.config.turnFlow.cardLifecycle.lookahead',
      cardDrivenTurnFlow.cardLifecycle.lookahead,
      zoneTargets,
      `turnOrder.config.turnFlow.cardLifecycle.lookahead references unknown zone "${cardDrivenTurnFlow.cardLifecycle.lookahead}".`,
      'Use one of the declared zone ids.',
    );
    pushMissingIdentifierDiagnostic(
      diagnostics,
      CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_LIFECYCLE_ZONE_MISSING,
      'doc.turnOrder.config.turnFlow.cardLifecycle.leader',
      cardDrivenTurnFlow.cardLifecycle.leader,
      zoneTargets,
      `turnOrder.config.turnFlow.cardLifecycle.leader references unknown zone "${cardDrivenTurnFlow.cardLifecycle.leader}".`,
      'Use one of the declared zone ids.',
    );
  }

  if (cardDrivenTurnFlow !== null && sections.globalVars !== null) {
    for (const [rewardIndex, reward] of cardDrivenTurnFlow.passRewards.entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_TURN_FLOW_PASS_REWARD_SEAT_MISSING,
        `doc.turnOrder.config.turnFlow.passRewards.${rewardIndex}.seat`,
        reward.seat,
        seatTargets,
        `turnOrder.config.turnFlow.passRewards[${rewardIndex}] references unknown seat "${reward.seat}".`,
        'Use one of the declared seat catalog ids.',
      );
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_REWARD_VAR_MISSING,
        `doc.turnOrder.config.turnFlow.passRewards.${rewardIndex}.resource`,
        reward.resource,
        globalVarTargets,
        `turnOrder.config.turnFlow.passRewards[${rewardIndex}] references unknown global var "${reward.resource}".`,
        'Use one of the declared globalVars names.',
      );
    }
  }

  diagnostics.sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) {
      return pathCompare;
    }
    const codeCompare = left.code.localeCompare(right.code);
    if (codeCompare !== 0) {
      return codeCompare;
    }
    return left.message.localeCompare(right.message);
  });

  return diagnostics;
}

function collectChoiceBindingNames(root: unknown): readonly string[] {
  const binds = new Set<string>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!isRecord(value)) {
      return;
    }

    if (isRecord(value.chooseN) && typeof value.chooseN.bind === 'string' && value.chooseN.bind.length > 0) {
      binds.add(value.chooseN.bind);
    }
    if (isRecord(value.chooseOne) && typeof value.chooseOne.bind === 'string' && value.chooseOne.bind.length > 0) {
      binds.add(value.chooseOne.bind);
    }

    for (const nested of Object.values(value)) {
      visit(nested);
    }
  };

  visit(root);
  return [...binds];
}

function collectIdentifierTargets(values: readonly (string | null | undefined)[] | null | undefined): {
  readonly values: readonly string[];
  readonly normalizedSet: ReadonlySet<string>;
} {
  const normalizedValues = (values ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => normalizeIdentifier(value))
    .filter((value) => value.length > 0);
  return {
    values: normalizedValues,
    normalizedSet: new Set(normalizedValues),
  };
}

function mergeIdentifierTargets(
  left: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  right: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
): { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> } {
  const merged = Array.from(new Set([...left.values, ...right.values]));
  return {
    values: merged,
    normalizedSet: new Set(merged),
  };
}

function pushMissingIdentifierDiagnostic(
  diagnostics: Diagnostic[],
  code: CnlXrefDiagnosticCode,
  path: string,
  sourceValue: string,
  targets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  message: string,
  fallbackSuggestion: string,
): void {
  const normalized = normalizeIdentifier(sourceValue);
  if (normalized.length === 0 || targets.normalizedSet.has(normalized)) {
    return;
  }
  pushMissingReferenceDiagnostic(diagnostics, code, path, message, normalized, targets.values, fallbackSuggestion);
}

function pushMissingZoneRefDiagnostic(
  diagnostics: Diagnostic[],
  code: CnlXrefDiagnosticCode,
  path: string,
  zone: ZoneRef,
  targets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  message: string,
): void {
  if (typeof zone !== 'string' || !isConcreteZoneId(zone)) {
    return;
  }

  pushMissingIdentifierDiagnostic(
    diagnostics,
    code,
    path,
    zone,
    targets,
    message,
    'Use one of the declared zone ids.',
  );
}

function isConcreteZoneId(zone: string): boolean {
  if (zone.startsWith('$')) {
    return false;
  }

  const separator = zone.indexOf(':');
  if (separator < 0) {
    return true;
  }

  const qualifier = zone.slice(separator + 1);
  if (qualifier.length === 0) {
    return false;
  }
  if (/^[0-9]+$/.test(qualifier)) {
    return true;
  }
  if (qualifier === 'none') {
    return true;
  }
  if (qualifier.startsWith('$')) {
    return false;
  }
  return false;
}

function walkEffects(
  effects: readonly EffectAST[],
  pathPrefix: string,
  onEffect: (effect: EffectAST, effectPath: string) => void,
): void {
  for (const [effectIndex, effect] of effects.entries()) {
    const effectPath = `${pathPrefix}.${effectIndex}`;
    onEffect(effect, effectPath);

    if ('if' in effect) {
      walkEffects(effect.if.then, `${effectPath}.if.then`, onEffect);
      if (effect.if.else !== undefined) {
        walkEffects(effect.if.else, `${effectPath}.if.else`, onEffect);
      }
      continue;
    }

    if ('forEach' in effect) {
      walkEffects(effect.forEach.effects, `${effectPath}.forEach.effects`, onEffect);
      if (effect.forEach.in !== undefined) {
        walkEffects(effect.forEach.in, `${effectPath}.forEach.in`, onEffect);
      }
      continue;
    }

    if ('reduce' in effect) {
      walkEffects(effect.reduce.in, `${effectPath}.reduce.in`, onEffect);
      continue;
    }

    if ('removeByPriority' in effect) {
      if (effect.removeByPriority.in !== undefined) {
        walkEffects(effect.removeByPriority.in, `${effectPath}.removeByPriority.in`, onEffect);
      }
      continue;
    }

    if ('let' in effect) {
      walkEffects(effect.let.in, `${effectPath}.let.in`, onEffect);
      continue;
    }

    if ('evaluateSubset' in effect) {
      walkEffects(effect.evaluateSubset.compute, `${effectPath}.evaluateSubset.compute`, onEffect);
      walkEffects(effect.evaluateSubset.in, `${effectPath}.evaluateSubset.in`, onEffect);
      continue;
    }

    if ('rollRandom' in effect) {
      walkEffects(effect.rollRandom.in, `${effectPath}.rollRandom.in`, onEffect);
    }
  }
}

function validateEventCardSide(
  diagnostics: Diagnostic[],
  side: EventSideDef | undefined,
  pathPrefix: string,
  zoneTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  cardId: string,
  seatTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  windowTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  actionTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  validateSeats: boolean,
): void {
  if (side === undefined) {
    return;
  }

  pushEventTargetExecutabilityDiagnostic(diagnostics, side.targets, side, pathPrefix, cardId);

  validateEventFreeOperationGrants(
    diagnostics,
    side.freeOperationGrants,
    `${pathPrefix}.freeOperationGrants`,
    cardId,
    seatTargets,
    actionTargets,
    validateSeats,
  );
  validateEventEligibilityOverrides(
    diagnostics,
    side.eligibilityOverrides,
    `${pathPrefix}.eligibilityOverrides`,
    cardId,
    seatTargets,
    windowTargets,
    validateSeats,
  );

  if (side.effects !== undefined) {
    walkEffects(side.effects, `${pathPrefix}.effects`, (effect, path) => {
      pushEffectZoneDiagnostics(
        diagnostics,
        effect,
        path,
        zoneTargets,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING,
        `Event card "${cardId}" references unknown zone`,
      );
    });
  }

  for (const [branchIndex, branch] of (side.branches ?? []).entries()) {
    pushEventTargetExecutabilityDiagnostic(
      diagnostics,
      branch.targets,
      branch,
      `${pathPrefix}.branches.${branchIndex}`,
      cardId,
    );

    validateEventFreeOperationGrants(
      diagnostics,
      branch.freeOperationGrants,
      `${pathPrefix}.branches.${branchIndex}.freeOperationGrants`,
      cardId,
      seatTargets,
      actionTargets,
      validateSeats,
    );
    validateEventEligibilityOverrides(
      diagnostics,
      branch.eligibilityOverrides,
      `${pathPrefix}.branches.${branchIndex}.eligibilityOverrides`,
      cardId,
      seatTargets,
      windowTargets,
      validateSeats,
    );

    if (branch.effects === undefined) {
      continue;
    }
    walkEffects(branch.effects, `${pathPrefix}.branches.${branchIndex}.effects`, (effect, path) => {
      pushEffectZoneDiagnostics(
        diagnostics,
        effect,
        path,
        zoneTargets,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING,
        `Event card "${cardId}" references unknown zone`,
      );
    });
  }

  for (const [lastingEffectIndex, lastingEffect] of (side.lastingEffects ?? []).entries()) {
    walkEffects(lastingEffect.setupEffects, `${pathPrefix}.lastingEffects.${lastingEffectIndex}.setupEffects`, (effect, path) => {
      pushEffectZoneDiagnostics(
        diagnostics,
        effect,
        path,
        zoneTargets,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING,
        `Event card "${cardId}" references unknown zone`,
      );
    });
    if (lastingEffect.teardownEffects !== undefined) {
      walkEffects(
        lastingEffect.teardownEffects,
        `${pathPrefix}.lastingEffects.${lastingEffectIndex}.teardownEffects`,
        (effect, path) => {
          pushEffectZoneDiagnostics(
            diagnostics,
            effect,
            path,
            zoneTargets,
            CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING,
            `Event card "${cardId}" references unknown zone`,
          );
        },
      );
    }
  }
}

function pushEventTargetExecutabilityDiagnostic(
  diagnostics: Diagnostic[],
  targets: EventSideDef['targets'],
  scope: {
    readonly effects?: EventSideDef['effects'];
    readonly branches?: EventSideDef['branches'];
    readonly lastingEffects?: EventSideDef['lastingEffects'];
  },
  pathPrefix: string,
  cardId: string,
): void {
  if (targets === undefined || targets.length === 0) {
    return;
  }
  if (scope.effects !== undefined || scope.branches !== undefined || scope.lastingEffects !== undefined) {
    return;
  }

  diagnostics.push({
    code: CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING,
    path: `${pathPrefix}.targets`,
    severity: 'error',
    message: `Event card "${cardId}" declares targets without executable gameplay payload at this scope.`,
    suggestion: 'Add effects/branches/lastingEffects for this target declaration, or remove targets.',
  });
}

function validateEventFreeOperationGrants(
  diagnostics: Diagnostic[],
  grants: EventSideDef['freeOperationGrants'],
  pathPrefix: string,
  cardId: string,
  seatTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  actionTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  validateSeats: boolean,
): void {
  if (grants === undefined) {
    return;
  }

  for (const [grantIndex, grant] of grants.entries()) {
    if (validateSeats) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_GRANT_SEAT_MISSING,
        `${pathPrefix}.${grantIndex}.seat`,
        grant.seat,
        seatTargets,
        `Event card "${cardId}" freeOperationGrant references unknown seat "${grant.seat}".`,
        'Use one of the declared seat ids.',
      );
      if (grant.executeAsSeat !== undefined && grant.executeAsSeat !== 'self') {
        pushMissingIdentifierDiagnostic(
          diagnostics,
          CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_GRANT_EXECUTE_AS_SEAT_MISSING,
          `${pathPrefix}.${grantIndex}.executeAsSeat`,
          grant.executeAsSeat,
          seatTargets,
          `Event card "${cardId}" freeOperationGrant executeAsSeat references unknown seat "${grant.executeAsSeat}".`,
          'Use "self" or one of the declared seat ids.',
        );
      }
    }

    for (const [actionIndex, actionId] of (grant.actionIds ?? []).entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_GRANT_ACTION_MISSING,
        `${pathPrefix}.${grantIndex}.actionIds.${actionIndex}`,
        actionId,
        actionTargets,
        `Event card "${cardId}" freeOperationGrant references unknown action "${actionId}".`,
        'Use one of the declared action ids.',
      );
    }
  }
}

function validateEventEligibilityOverrides(
  diagnostics: Diagnostic[],
  overrides: EventSideDef['eligibilityOverrides'],
  pathPrefix: string,
  cardId: string,
  seatTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  windowTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  validateSeats: boolean,
): void {
  if (overrides === undefined) {
    return;
  }

  for (const [overrideIndex, override] of overrides.entries()) {
    if (validateSeats && override.target.kind === 'seat') {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_OVERRIDE_SEAT_MISSING,
        `${pathPrefix}.${overrideIndex}.target.seat`,
        override.target.seat,
        seatTargets,
        `Event card "${cardId}" eligibilityOverride references unknown seat "${override.target.seat}".`,
        'Use one of the declared seat ids.',
      );
    }

    pushMissingIdentifierDiagnostic(
      diagnostics,
      CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_EVENT_DECK_OVERRIDE_WINDOW_MISSING,
      `${pathPrefix}.${overrideIndex}.windowId`,
      override.windowId,
      windowTargets,
      `Event card "${cardId}" eligibilityOverride references unknown window "${override.windowId}".`,
      'Use one of the declared turnFlow.eligibility.overrideWindows ids.',
    );
  }
}

function pushEffectZoneDiagnostics(
  diagnostics: Diagnostic[],
  effect: EffectAST,
  path: string,
  zoneTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  code: CnlXrefDiagnosticCode,
  messagePrefix: string,
): void {
  if ('moveToken' in effect) {
    pushMissingZoneRefDiagnostic(
      diagnostics,
      code,
      `${path}.moveToken.from`,
      effect.moveToken.from,
      zoneTargets,
      `${messagePrefix} in moveToken.from.`,
    );
    pushMissingZoneRefDiagnostic(
      diagnostics,
      code,
      `${path}.moveToken.to`,
      effect.moveToken.to,
      zoneTargets,
      `${messagePrefix} in moveToken.to.`,
    );
  }

  if ('draw' in effect) {
    pushMissingZoneRefDiagnostic(
      diagnostics,
      code,
      `${path}.draw.from`,
      effect.draw.from,
      zoneTargets,
      `${messagePrefix} in draw.from.`,
    );
    pushMissingZoneRefDiagnostic(
      diagnostics,
      code,
      `${path}.draw.to`,
      effect.draw.to,
      zoneTargets,
      `${messagePrefix} in draw.to.`,
    );
  }

  if ('shuffle' in effect) {
    pushMissingZoneRefDiagnostic(
      diagnostics,
      code,
      `${path}.shuffle.zone`,
      effect.shuffle.zone,
      zoneTargets,
      `${messagePrefix} in shuffle.zone.`,
    );
  }
}
