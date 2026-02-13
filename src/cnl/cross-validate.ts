import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EffectAST, ZoneRef } from '../kernel/types.js';
import type { CompileSectionResults } from './compiler-core.js';
import { normalizeIdentifier, pushMissingReferenceDiagnostic } from './validate-spec-shared.js';

export function crossValidateSpec(sections: CompileSectionResults): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const phaseTargets = collectIdentifierTargets(sections.turnStructure?.phases.map((phase) => phase.id));
  const actionTargets = collectIdentifierTargets(sections.actions?.map((action) => action.id));
  const zoneTargets = collectIdentifierTargets(sections.zones?.map((zone) => zone.id));
  const tokenTypeTargets = collectIdentifierTargets(sections.tokenTypes?.map((tokenType) => tokenType.id));
  const cardDrivenTurnFlow = sections.turnOrder?.type === 'cardDriven' ? sections.turnOrder.config.turnFlow : null;
  const factionTargets = collectIdentifierTargets(cardDrivenTurnFlow?.eligibility.factions);
  const windowTargets = collectIdentifierTargets(cardDrivenTurnFlow?.eligibility.overrideWindows.map((window) => window.id));
  const globalVarTargets = collectIdentifierTargets(sections.globalVars?.map((globalVar) => globalVar.name));

  if (sections.actions !== null && sections.turnStructure !== null) {
    for (const [actionIndex, action] of sections.actions.entries()) {
      pushMissingIdentifierDiagnostic(
        diagnostics,
        'CNL_XREF_ACTION_PHASE_MISSING',
        `doc.actions.${actionIndex}.phase`,
        action.phase,
        phaseTargets,
        `Action "${action.id}" references unknown phase "${action.phase}".`,
        'Use one of the declared turnStructure.phases ids.',
      );
    }
  }

  if (sections.actionPipelines !== null && sections.actions !== null) {
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
        'Use one of the declared turnStructure.phases ids.',
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
        if ('moveToken' in effect) {
          pushMissingZoneRefDiagnostic(
            diagnostics,
            'CNL_XREF_EFFECT_ZONE_MISSING',
            `${path}.moveToken.from`,
            effect.moveToken.from,
            zoneTargets,
            `Action "${action.id}" references unknown zone in moveToken.from.`,
          );
          pushMissingZoneRefDiagnostic(
            diagnostics,
            'CNL_XREF_EFFECT_ZONE_MISSING',
            `${path}.moveToken.to`,
            effect.moveToken.to,
            zoneTargets,
            `Action "${action.id}" references unknown zone in moveToken.to.`,
          );
        }

        if ('draw' in effect) {
          pushMissingZoneRefDiagnostic(
            diagnostics,
            'CNL_XREF_EFFECT_ZONE_MISSING',
            `${path}.draw.from`,
            effect.draw.from,
            zoneTargets,
            `Action "${action.id}" references unknown zone in draw.from.`,
          );
          pushMissingZoneRefDiagnostic(
            diagnostics,
            'CNL_XREF_EFFECT_ZONE_MISSING',
            `${path}.draw.to`,
            effect.draw.to,
            zoneTargets,
            `Action "${action.id}" references unknown zone in draw.to.`,
          );
        }
      });
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

    if ('let' in effect) {
      walkEffects(effect.let.in, `${effectPath}.let.in`, onEffect);
      continue;
    }

    if ('rollRandom' in effect) {
      walkEffects(effect.rollRandom.in, `${effectPath}.rollRandom.in`, onEffect);
    }
  }
}
