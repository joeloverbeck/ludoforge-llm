import type { Diagnostic } from '../kernel/diagnostics.js';
import { asActionId, asPhaseId, asTriggerId } from '../kernel/branded.js';
import type {
  ActionDef,
  ConditionAST,
  EffectAST,
  EndCondition,
  GameDef,
  LimitDef,
  ParamDef,
  PhaseDef,
  TokenTypeDef,
  TriggerDef,
  TriggerEvent,
  TurnStructure,
  VariableDef,
} from '../kernel/types.js';
import { lowerConditionNode, lowerQueryNode } from './compile-conditions.js';
import { lowerEffectArray } from './compile-effects.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import type { GameSpecDoc } from './game-spec-doc.js';

export function lowerConstants(
  constants: GameSpecDoc['constants'],
  diagnostics: Diagnostic[],
): Readonly<Record<string, number>> {
  if (constants === null) {
    return {};
  }

  const output: Record<string, number> = {};
  for (const [name, value] of Object.entries(constants)) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      diagnostics.push(missingCapabilityDiagnostic(`doc.constants.${name}`, 'constant value', value, ['number']));
      continue;
    }
    output[name] = value;
  }
  return output;
}

export function lowerVarDefs(
  variables: GameSpecDoc['globalVars'] | GameSpecDoc['perPlayerVars'],
  diagnostics: Diagnostic[],
  pathPrefix: 'doc.globalVars' | 'doc.perPlayerVars',
): readonly VariableDef[] {
  if (variables === null) {
    return [];
  }

  const lowered: VariableDef[] = [];
  for (const [index, variable] of variables.entries()) {
    const path = `${pathPrefix}.${index}`;
    if (!isRecord(variable)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'variable definition', variable));
      continue;
    }

    if (
      typeof variable.name !== 'string' ||
      variable.name.trim() === '' ||
      variable.type !== 'int' ||
      !isFiniteNumber(variable.init) ||
      !isFiniteNumber(variable.min) ||
      !isFiniteNumber(variable.max)
    ) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'variable definition', variable));
      continue;
    }

    lowered.push({
      name: variable.name,
      type: 'int',
      init: variable.init,
      min: variable.min,
      max: variable.max,
    });
  }
  return lowered;
}

export function lowerTokenTypes(tokenTypes: GameSpecDoc['tokenTypes'], diagnostics: Diagnostic[]): readonly TokenTypeDef[] {
  if (tokenTypes === null) {
    return [];
  }

  const lowered: TokenTypeDef[] = [];
  for (const [index, tokenType] of tokenTypes.entries()) {
    const path = `doc.tokenTypes.${index}`;
    if (!isRecord(tokenType) || typeof tokenType.id !== 'string' || tokenType.id.trim() === '' || !isRecord(tokenType.props)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'token type definition', tokenType));
      continue;
    }

    const props: Record<string, 'int' | 'string' | 'boolean'> = {};
    let validProps = true;
    for (const [propName, propType] of Object.entries(tokenType.props)) {
      if (propType !== 'int' && propType !== 'string' && propType !== 'boolean') {
        diagnostics.push(
          missingCapabilityDiagnostic(`${path}.props.${propName}`, 'token prop type', propType, ['int', 'string', 'boolean']),
        );
        validProps = false;
      } else {
        props[propName] = propType;
      }
    }
    if (!validProps) {
      continue;
    }
    lowered.push({
      id: tokenType.id,
      props,
    });
  }
  return lowered;
}

export function lowerTurnStructure(
  turnStructure: NonNullable<GameSpecDoc['turnStructure']>,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): TurnStructure {
  const phasesSource = Array.isArray(turnStructure.phases) ? turnStructure.phases : [];
  const phases: PhaseDef[] = phasesSource.map((phase, phaseIndex) => {
    const path = `doc.turnStructure.phases.${phaseIndex}`;
    if (!isRecord(phase) || typeof phase.id !== 'string' || phase.id.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(path, 'phase definition', phase));
      return {
        id: asPhaseId(`invalid-phase-${phaseIndex}`),
      };
    }

    const onEnter = Array.isArray(phase.onEnter)
      ? lowerEffectsWithDiagnostics(phase.onEnter, ownershipByBase, diagnostics, `${path}.onEnter`)
      : undefined;
    const onExit = Array.isArray(phase.onExit)
      ? lowerEffectsWithDiagnostics(phase.onExit, ownershipByBase, diagnostics, `${path}.onExit`)
      : undefined;

    return {
      id: asPhaseId(phase.id),
      ...(onEnter === undefined ? {} : { onEnter }),
      ...(onExit === undefined ? {} : { onExit }),
    };
  });

  const activePlayerOrder =
    turnStructure.activePlayerOrder === 'roundRobin' || turnStructure.activePlayerOrder === 'fixed'
      ? turnStructure.activePlayerOrder
      : 'roundRobin';

  if (activePlayerOrder !== turnStructure.activePlayerOrder) {
    diagnostics.push(
      missingCapabilityDiagnostic('doc.turnStructure.activePlayerOrder', 'turnStructure.activePlayerOrder', turnStructure.activePlayerOrder, [
        'roundRobin',
        'fixed',
      ]),
    );
  }

  return {
    phases,
    activePlayerOrder,
  };
}

export function lowerActions(
  actions: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly ActionDef[] {
  const lowered: ActionDef[] = [];
  for (const [index, action] of actions.entries()) {
    const path = `doc.actions.${index}`;
    if (!isRecord(action)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'action definition', action));
      continue;
    }

    if (typeof action.id !== 'string' || action.id.trim() === '' || typeof action.phase !== 'string' || action.phase.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(path, 'action definition', action));
      continue;
    }

    const actor = normalizePlayerSelector(action.actor, `${path}.actor`);
    diagnostics.push(...actor.diagnostics);

    const params = lowerActionParams(action.params, ownershipByBase, diagnostics, `${path}.params`);
    const bindingScope = params.bindingScope;
    const pre = lowerOptionalCondition(action.pre, ownershipByBase, bindingScope, diagnostics, `${path}.pre`);
    const cost = lowerEffectsWithDiagnostics(action.cost, ownershipByBase, diagnostics, `${path}.cost`, bindingScope);
    const effects = lowerEffectsWithDiagnostics(action.effects, ownershipByBase, diagnostics, `${path}.effects`, bindingScope);
    const limits = lowerActionLimits(action.limits, diagnostics, `${path}.limits`);

    if (actor.value === null || (action.pre !== null && pre === null)) {
      continue;
    }

    lowered.push({
      id: asActionId(action.id),
      actor: actor.value,
      phase: asPhaseId(action.phase),
      params: params.value,
      pre: pre ?? null,
      cost,
      effects,
      limits,
    });
  }

  return lowered;
}

function lowerActionParams(
  paramsSource: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
): {
  readonly value: readonly ParamDef[];
  readonly bindingScope: readonly string[];
} {
  if (!Array.isArray(paramsSource)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'action params', paramsSource, ['array']));
    return { value: [], bindingScope: [] };
  }

  const value: ParamDef[] = [];
  const bindingScope: string[] = [];
  paramsSource.forEach((param, paramIndex) => {
    const paramPath = `${path}.${paramIndex}`;
    if (!isRecord(param) || typeof param.name !== 'string' || param.name.trim() === '') {
      diagnostics.push(missingCapabilityDiagnostic(paramPath, 'action param', param));
      return;
    }

    const domain = lowerQueryNode(param.domain, { ownershipByBase }, `${paramPath}.domain`);
    diagnostics.push(...domain.diagnostics);
    if (domain.value === null) {
      return;
    }

    value.push({
      name: param.name,
      domain: domain.value,
    });
    bindingScope.push(toBindingToken(param.name));
  });

  return {
    value,
    bindingScope,
  };
}

function lowerActionLimits(limitsSource: unknown, diagnostics: Diagnostic[], path: string): readonly LimitDef[] {
  if (!Array.isArray(limitsSource)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'action limits', limitsSource, ['array']));
    return [];
  }

  const limits: LimitDef[] = [];
  for (const [index, limit] of limitsSource.entries()) {
    const limitPath = `${path}.${index}`;
    const maxValue = isRecord(limit) && typeof limit.max === 'number' ? limit.max : null;
    if (
      !isRecord(limit) ||
      (limit.scope !== 'turn' && limit.scope !== 'phase' && limit.scope !== 'game') ||
      maxValue === null ||
      !Number.isInteger(maxValue) ||
      maxValue < 0
    ) {
      diagnostics.push(missingCapabilityDiagnostic(limitPath, 'action limit', limit, ['{ scope: turn|phase|game, max: int>=0 }']));
      continue;
    }
    limits.push({
      scope: limit.scope,
      max: maxValue,
    });
  }
  return limits;
}

export function lowerTriggers(
  triggers: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly TriggerDef[] {
  const lowered: TriggerDef[] = [];
  for (const [index, trigger] of triggers.entries()) {
    const path = `doc.triggers.${index}`;
    if (!isRecord(trigger)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'trigger definition', trigger));
      continue;
    }

    const event = lowerTriggerEvent(trigger.event, ownershipByBase, diagnostics, `${path}.event`);
    const match = lowerOptionalCondition(trigger.match, ownershipByBase, [], diagnostics, `${path}.match`);
    const when = lowerOptionalCondition(trigger.when, ownershipByBase, [], diagnostics, `${path}.when`);
    const effects = lowerEffectsWithDiagnostics(trigger.effects, ownershipByBase, diagnostics, `${path}.effects`);

    if (event === null || match === null || when === null) {
      continue;
    }

    const triggerId = typeof trigger.id === 'string' && trigger.id.trim() !== '' ? trigger.id : `trigger_${index}`;
    lowered.push({
      id: asTriggerId(triggerId),
      event,
      ...(match === undefined ? {} : { match }),
      ...(when === undefined ? {} : { when }),
      effects,
    });
  }
  return lowered;
}

function lowerTriggerEvent(
  event: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
): TriggerEvent | null {
  if (!isRecord(event) || typeof event.type !== 'string') {
    diagnostics.push(missingCapabilityDiagnostic(path, 'trigger event', event));
    return null;
  }

  switch (event.type) {
    case 'phaseEnter':
    case 'phaseExit':
      if (typeof event.phase !== 'string' || event.phase.trim() === '') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.phase`, `${event.type} phase`, event.phase, ['phase id']));
        return null;
      }
      return { type: event.type, phase: asPhaseId(event.phase) };
    case 'turnStart':
    case 'turnEnd':
      return { type: event.type };
    case 'actionResolved':
      if (event.action === undefined) {
        return { type: 'actionResolved' };
      }
      if (typeof event.action !== 'string' || event.action.trim() === '') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.action`, 'actionResolved action', event.action, ['action id']));
        return null;
      }
      return { type: 'actionResolved', action: asActionId(event.action) };
    case 'tokenEntered':
      if (event.zone === undefined) {
        return { type: 'tokenEntered' };
      }
      if (typeof event.zone !== 'string') {
        diagnostics.push(missingCapabilityDiagnostic(`${path}.zone`, 'tokenEntered zone', event.zone, ['zone selector string']));
        return null;
      }
      return { type: 'tokenEntered', zone: event.zone as GameDef['zones'][number]['id'] };
    default:
      diagnostics.push(
        missingCapabilityDiagnostic(`${path}.type`, 'trigger event type', event.type, [
          'phaseEnter',
          'phaseExit',
          'turnStart',
          'turnEnd',
          'actionResolved',
          'tokenEntered',
        ]),
      );
      return null;
  }
}

export function lowerEndConditions(
  endConditions: readonly unknown[],
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
): readonly EndCondition[] {
  const lowered: EndCondition[] = [];
  for (const [index, endCondition] of endConditions.entries()) {
    const path = `doc.endConditions.${index}`;
    if (!isRecord(endCondition)) {
      diagnostics.push(missingCapabilityDiagnostic(path, 'end condition', endCondition));
      continue;
    }

    const when = lowerConditionNode(endCondition.when, { ownershipByBase }, `${path}.when`);
    diagnostics.push(...when.diagnostics);
    const result = lowerTerminalResult(endCondition.result, diagnostics, `${path}.result`);

    if (when.value === null || result === null) {
      continue;
    }

    lowered.push({
      when: when.value,
      result,
    });
  }
  return lowered;
}

function lowerTerminalResult(
  result: unknown,
  diagnostics: Diagnostic[],
  path: string,
): EndCondition['result'] | null {
  if (!isRecord(result) || typeof result.type !== 'string') {
    diagnostics.push(missingCapabilityDiagnostic(path, 'end condition result', result));
    return null;
  }

  switch (result.type) {
    case 'draw':
      return { type: 'draw' };
    case 'lossAll':
      return { type: 'lossAll' };
    case 'score':
      return { type: 'score' };
    case 'win': {
      const player = normalizePlayerSelector(result.player, `${path}.player`);
      diagnostics.push(...player.diagnostics);
      if (player.value === null) {
        return null;
      }
      return {
        type: 'win',
        player: player.value,
      };
    }
    default:
      diagnostics.push(missingCapabilityDiagnostic(`${path}.type`, 'end condition result type', result.type, ['win', 'lossAll', 'draw', 'score']));
      return null;
  }
}

export function lowerOptionalCondition(
  source: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  bindingScope: readonly string[],
  diagnostics: Diagnostic[],
  path: string,
): ConditionAST | null | undefined {
  if (source === null) {
    return null;
  }
  if (source === undefined) {
    return undefined;
  }
  const lowered = lowerConditionNode(source, { ownershipByBase, bindingScope }, path);
  diagnostics.push(...lowered.diagnostics);
  return lowered.value;
}

export function lowerEffectsWithDiagnostics(
  source: unknown,
  ownershipByBase: Readonly<Record<string, 'none' | 'player' | 'mixed'>>,
  diagnostics: Diagnostic[],
  path: string,
  bindingScope: readonly string[] = [],
): readonly EffectAST[] {
  if (!Array.isArray(source)) {
    diagnostics.push(missingCapabilityDiagnostic(path, 'effects array', source, ['array']));
    return [];
  }

  const lowered = lowerEffectArray(source, { ownershipByBase, bindingScope }, path);
  diagnostics.push(...lowered.diagnostics);
  return lowered.value ?? [];
}

export function missingCapabilityDiagnostic(
  path: string,
  label: string,
  actual: unknown,
  alternatives: readonly string[] = [],
): Diagnostic {
  return {
    code: 'CNL_COMPILER_MISSING_CAPABILITY',
    path,
    severity: 'error',
    message: `Cannot lower ${label}: ${formatValue(actual)}.`,
    suggestion: alternatives.length > 0 ? `Use one of the supported forms.` : 'Use a supported compiler shape.',
    ...(alternatives.length === 0 ? {} : { alternatives: [...alternatives] }),
  };
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function toBindingToken(name: string): string {
  return name.startsWith('$') ? name : `$${name}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeIdentifier(value: string): string {
  return value.trim().normalize('NFC');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
