import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EffectAST, EventSideDef, ZoneRef } from '../kernel/types.js';
import {
  evaluateActionSelectorContracts,
  getActionSelectorContract,
} from '../kernel/action-selector-contract-registry.js';
import type { CompileSectionResults } from './compiler-core.js';
import { normalizeIdentifier, pushMissingReferenceDiagnostic } from './validate-spec-shared.js';

export function crossValidateSpec(sections: CompileSectionResults): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const phaseTargets = collectIdentifierTargets([
    ...(sections.turnStructure?.phases.map((phase) => phase.id) ?? []),
    ...(sections.turnStructure?.interrupts?.map((phase) => phase.id) ?? []),
  ]);
  const actionTargets = collectIdentifierTargets(sections.actions?.map((action) => action.id));
  const zoneTargets = collectIdentifierTargets(sections.zones?.map((zone) => zone.id));
  const tokenTypeTargets = collectIdentifierTargets(sections.tokenTypes?.map((tokenType) => tokenType.id));
  const cardDrivenTurnFlow = sections.turnOrder?.type === 'cardDriven' ? sections.turnOrder.config.turnFlow : null;
  const factionTargets = collectIdentifierTargets(cardDrivenTurnFlow?.eligibility.factions);
  const windowTargets = collectIdentifierTargets(cardDrivenTurnFlow?.eligibility.overrideWindows.map((window) => window.id));
  const globalVarTargets = collectIdentifierTargets(sections.globalVars?.map((globalVar) => globalVar.name));
  const perPlayerVarTargets = collectIdentifierTargets(sections.perPlayerVars?.map((playerVar) => playerVar.name));

  if (sections.actions !== null && sections.turnStructure !== null) {
    for (const [actionIndex, action] of sections.actions.entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        'CNL_XREF_ACTION_PHASE_MISSING',
        `doc.actions.${actionIndex}.phase`,
        action.phase,
        phaseTargets,
        `Action "${action.id}" references unknown phase "${action.phase}".`,
        'Use one of the declared turnStructure.phases/interrupts ids.',
      );
    }
  }

  if (sections.actionPipelines !== null && sections.actions !== null) {
    const pipelinedActionIds = new Set(sections.actionPipelines.map((profile) => String(profile.actionId)));
    for (const [profileIndex, profile] of sections.actionPipelines.entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        'CNL_XREF_PROFILE_ACTION_MISSING',
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
        if (violation.kind !== 'bindingWithPipelineUnsupported') {
          continue;
        }
        const code = getActionSelectorContract(violation.role).bindingWithPipelineUnsupportedDiagnosticCode;
        if (code === undefined) {
          continue;
        }
        diagnostics.push({
          code,
          path: `doc.actions.${actionIndex}.${violation.role}`,
          severity: 'error',
          message: `Action "${String(action.id)}" uses binding-derived ${violation.role} "${violation.binding}" with action pipelines.`,
          suggestion: `Use actor/active/id/relative ${violation.role} selectors for pipelined actions.`,
        });
      }
    }
  }

  if (sections.actionPipelines !== null && cardDrivenTurnFlow !== null) {
    for (const [profileIndex, profile] of sections.actionPipelines.entries()) {
      for (const [windowIndex, windowId] of (profile.linkedWindows ?? []).entries()) {
        pushMissingIdentifierDiagnostic(
          diagnostics,
          'CNL_XREF_PROFILE_WINDOW_MISSING',
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
    for (const [actionIndex, actionId] of (cardDrivenTurnFlow.freeOperationActionIds ?? []).entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        'CNL_XREF_TURN_FLOW_FREE_OPERATION_ACTION_MISSING',
        `doc.turnOrder.config.turnFlow.freeOperationActionIds.${actionIndex}`,
        actionId,
        actionTargets,
        `turnFlow.freeOperationActionIds references unknown action "${actionId}".`,
        'Use one of the declared action ids.',
      );
    }

    const cancellationRules = cardDrivenTurnFlow.pivotal?.interrupt?.cancellation ?? [];
    for (const [ruleIndex, rule] of cancellationRules.entries()) {
      if (rule.winner.actionId !== undefined) {
        pushMissingIdentifierDiagnostic(
          diagnostics,
          'CNL_XREF_TURN_FLOW_PIVOTAL_CANCELLATION_ACTION_MISSING',
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
          'CNL_XREF_TURN_FLOW_PIVOTAL_CANCELLATION_ACTION_MISSING',
          `doc.turnOrder.config.turnFlow.pivotal.interrupt.cancellation.${ruleIndex}.canceled.actionId`,
          rule.canceled.actionId,
          actionTargets,
          `Pivotal interrupt cancellation canceled selector references unknown action "${rule.canceled.actionId}".`,
          'Use one of the declared action ids.',
        );
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
        'CNL_XREF_TRIGGER_PHASE_MISSING',
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
        'CNL_XREF_TRIGGER_ACTION_MISSING',
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
        'CNL_XREF_TRIGGER_VAR_MISSING',
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
        'CNL_XREF_VICTORY_FACTION_MISSING',
        `doc.terminal.checkpoints.${checkpointIndex}.faction`,
        checkpoint.faction,
        factionTargets,
        `Victory checkpoint "${checkpoint.id}" references unknown faction "${checkpoint.faction}".`,
        'Use one of the declared turnFlow.eligibility.factions ids.',
      );
    }

    for (const [marginIndex, margin] of (sections.terminal.margins ?? []).entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        'CNL_XREF_MARGIN_FACTION_MISSING',
        `doc.terminal.margins.${marginIndex}.faction`,
        margin.faction,
        factionTargets,
        `Victory margin references unknown faction "${margin.faction}".`,
        'Use one of the declared turnFlow.eligibility.factions ids.',
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
        'CNL_XREF_SETUP_ZONE_MISSING',
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
        'CNL_XREF_SETUP_TOKEN_TYPE_MISSING',
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
          'CNL_XREF_EFFECT_ZONE_MISSING',
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
        'CNL_XREF_EVENT_DECK_ZONE_MISSING',
        `${deckPath}.drawZone`,
        deck.drawZone,
        zoneTargets,
        `Event deck "${deck.id}" references unknown drawZone.`,
      );
      pushMissingZoneRefDiagnostic(
        diagnostics,
        'CNL_XREF_EVENT_DECK_ZONE_MISSING',
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
          factionTargets,
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
          factionTargets,
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
            code: 'CNL_XREF_PIVOTAL_PLAY_CONDITION_MISSING',
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
      'CNL_XREF_LIFECYCLE_ZONE_MISSING',
      'doc.turnOrder.config.turnFlow.cardLifecycle.played',
      cardDrivenTurnFlow.cardLifecycle.played,
      zoneTargets,
      `turnOrder.config.turnFlow.cardLifecycle.played references unknown zone "${cardDrivenTurnFlow.cardLifecycle.played}".`,
      'Use one of the declared zone ids.',
    );
    pushMissingIdentifierDiagnostic(
      diagnostics,
      'CNL_XREF_LIFECYCLE_ZONE_MISSING',
      'doc.turnOrder.config.turnFlow.cardLifecycle.lookahead',
      cardDrivenTurnFlow.cardLifecycle.lookahead,
      zoneTargets,
      `turnOrder.config.turnFlow.cardLifecycle.lookahead references unknown zone "${cardDrivenTurnFlow.cardLifecycle.lookahead}".`,
      'Use one of the declared zone ids.',
    );
    pushMissingIdentifierDiagnostic(
      diagnostics,
      'CNL_XREF_LIFECYCLE_ZONE_MISSING',
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
        'CNL_XREF_REWARD_VAR_MISSING',
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
  code: string,
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
  code: string,
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
  factionTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  windowTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  actionTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  validateFactions: boolean,
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
    factionTargets,
    actionTargets,
    validateFactions,
  );
  validateEventEligibilityOverrides(
    diagnostics,
    side.eligibilityOverrides,
    `${pathPrefix}.eligibilityOverrides`,
    cardId,
    factionTargets,
    windowTargets,
    validateFactions,
  );

  if (side.effects !== undefined) {
    walkEffects(side.effects, `${pathPrefix}.effects`, (effect, path) => {
      pushEffectZoneDiagnostics(
        diagnostics,
        effect,
        path,
        zoneTargets,
        'CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING',
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
      factionTargets,
      actionTargets,
      validateFactions,
    );
    validateEventEligibilityOverrides(
      diagnostics,
      branch.eligibilityOverrides,
      `${pathPrefix}.branches.${branchIndex}.eligibilityOverrides`,
      cardId,
      factionTargets,
      windowTargets,
      validateFactions,
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
        'CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING',
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
        'CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING',
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
            'CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING',
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
    code: 'CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING',
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
  factionTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  actionTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  validateFactions: boolean,
): void {
  if (grants === undefined) {
    return;
  }

  for (const [grantIndex, grant] of grants.entries()) {
    if (validateFactions) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        'CNL_XREF_EVENT_DECK_GRANT_FACTION_MISSING',
        `${pathPrefix}.${grantIndex}.faction`,
        grant.faction,
        factionTargets,
        `Event card "${cardId}" freeOperationGrant references unknown faction "${grant.faction}".`,
        'Use one of the declared turnFlow.eligibility.factions ids.',
      );
      if (grant.executeAsFaction !== undefined && grant.executeAsFaction !== 'self') {
        pushMissingIdentifierDiagnostic(
          diagnostics,
          'CNL_XREF_EVENT_DECK_GRANT_EXECUTE_AS_FACTION_MISSING',
          `${pathPrefix}.${grantIndex}.executeAsFaction`,
          grant.executeAsFaction,
          factionTargets,
          `Event card "${cardId}" freeOperationGrant executeAsFaction references unknown faction "${grant.executeAsFaction}".`,
          'Use "self" or one of the declared turnFlow.eligibility.factions ids.',
        );
      }
    }

    for (const [actionIndex, actionId] of (grant.actionIds ?? []).entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        'CNL_XREF_EVENT_DECK_GRANT_ACTION_MISSING',
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
  factionTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  windowTargets: { readonly values: readonly string[]; readonly normalizedSet: ReadonlySet<string> },
  validateFactions: boolean,
): void {
  if (overrides === undefined) {
    return;
  }

  for (const [overrideIndex, override] of overrides.entries()) {
    if (validateFactions && override.target.kind === 'faction') {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        'CNL_XREF_EVENT_DECK_OVERRIDE_FACTION_MISSING',
        `${pathPrefix}.${overrideIndex}.target.faction`,
        override.target.faction,
        factionTargets,
        `Event card "${cardId}" eligibilityOverride references unknown faction "${override.target.faction}".`,
        'Use one of the declared turnFlow.eligibility.factions ids.',
      );
    }

    pushMissingIdentifierDiagnostic(
      diagnostics,
      'CNL_XREF_EVENT_DECK_OVERRIDE_WINDOW_MISSING',
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
  code: string,
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
