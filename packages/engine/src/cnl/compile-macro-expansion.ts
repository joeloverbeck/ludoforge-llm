import type { Diagnostic } from '../kernel/diagnostics.js';
import { expandBoardMacro } from './expand-macros.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isRecord } from './compile-lowering.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

export function expandZoneMacros(
  zones: GameSpecDoc['zones'],
  maxGeneratedZones: number,
  diagnostics: Diagnostic[],
): GameSpecDoc['zones'] {
  if (zones === null) {
    return null;
  }

  const expandedZones: unknown[] = [];
  let generatedZones = 0;

  for (const [index, zone] of zones.entries()) {
    if (!isBoardMacroZone(zone)) {
      expandedZones.push(zone);
      continue;
    }

    const macroPath = `doc.zones.${index}`;
    const args = zone.args.map((value) => (typeof value === 'number' ? value : Number.NaN));
    const expansion = expandBoardMacro(zone.macro, args, macroPath);
    diagnostics.push(...expansion.diagnostics);
    if (expansion.diagnostics.length > 0) {
      continue;
    }

    const nextGeneratedZones = generatedZones + expansion.zones.length;
    if (nextGeneratedZones > maxGeneratedZones) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_LIMIT_EXCEEDED,
        path: macroPath,
        severity: 'error',
        message: `Macro expansion exceeded maxGeneratedZones (${nextGeneratedZones} > ${maxGeneratedZones}).`,
        suggestion: 'Reduce board macro output size or increase compile limit maxGeneratedZones.',
      });
      continue;
    }

    generatedZones = nextGeneratedZones;
    expandedZones.push(...expansion.zones.map(zoneDefToSpecZone));
  }

  return expandedZones as GameSpecDoc['zones'];
}

export function expandEffectSections(
  sections: Pick<GameSpecDoc, 'setup' | 'actions' | 'triggers' | 'turnStructure' | 'actionPipelines'>,
  maxExpandedEffects: number,
  diagnostics: Diagnostic[],
): Pick<GameSpecDoc, 'setup' | 'actions' | 'triggers' | 'turnStructure' | 'actionPipelines'> {
  const state: ExpansionState = {
    maxExpandedEffects,
    expandedEffects: 0,
    diagnostics,
  };

  return {
    setup:
      sections.setup === null
        ? null
        : (expandEffectArray(sections.setup, 'doc.setup', state) as GameSpecDoc['setup']),
    actions:
      sections.actions === null
        ? null
        : (sections.actions.map((action, actionIndex) =>
            expandActionEffects(action, actionIndex, state),
          ) as GameSpecDoc['actions']),
    triggers:
      sections.triggers === null
        ? null
        : (sections.triggers.map((trigger, triggerIndex) =>
            expandTriggerEffects(trigger, triggerIndex, state),
          ) as GameSpecDoc['triggers']),
    turnStructure: expandTurnStructureEffects(sections.turnStructure, state),
    actionPipelines: expandActionPipelineEffects(sections.actionPipelines, state),
  };
}

function expandTurnStructureEffects(
  turnStructure: GameSpecDoc['turnStructure'],
  state: ExpansionState,
): GameSpecDoc['turnStructure'] {
  if (!isRecord(turnStructure) || !Array.isArray(turnStructure.phases)) {
    return turnStructure;
  }

  const phases = turnStructure.phases.map((phase, phaseIndex) => {
    if (!isRecord(phase)) {
      return phase;
    }
    const onEnter = Array.isArray(phase.onEnter)
      ? expandEffectArray(phase.onEnter, `doc.turnStructure.phases.${phaseIndex}.onEnter`, state)
      : phase.onEnter;
    const onExit = Array.isArray(phase.onExit)
      ? expandEffectArray(phase.onExit, `doc.turnStructure.phases.${phaseIndex}.onExit`, state)
      : phase.onExit;
    return {
      ...phase,
      ...(onEnter !== phase.onEnter ? { onEnter } : {}),
      ...(onExit !== phase.onExit ? { onExit } : {}),
    };
  });

  return {
    ...turnStructure,
    phases,
  } as GameSpecDoc['turnStructure'];
}

function expandActionEffects(action: unknown, actionIndex: number, state: ExpansionState): unknown {
  if (!isRecord(action)) {
    return action;
  }

  const cost = Array.isArray(action.cost)
    ? expandEffectArray(action.cost, `doc.actions.${actionIndex}.cost`, state)
    : action.cost;
  const effects = Array.isArray(action.effects)
    ? expandEffectArray(action.effects, `doc.actions.${actionIndex}.effects`, state)
    : action.effects;

  return {
    ...action,
    ...(cost !== action.cost ? { cost } : {}),
    ...(effects !== action.effects ? { effects } : {}),
  };
}

function expandTriggerEffects(trigger: unknown, triggerIndex: number, state: ExpansionState): unknown {
  if (!isRecord(trigger) || !Array.isArray(trigger.effects)) {
    return trigger;
  }

  return {
    ...trigger,
    effects: expandEffectArray(trigger.effects, `doc.triggers.${triggerIndex}.effects`, state),
  };
}

function expandActionPipelineEffects(
  pipelines: GameSpecDoc['actionPipelines'],
  state: ExpansionState,
): GameSpecDoc['actionPipelines'] {
  if (pipelines === null) {
    return null;
  }
  return pipelines.map((pipeline, pipelineIndex) => {
    if (!isRecord(pipeline)) return pipeline;
    const stages = pipeline.stages;
    if (!Array.isArray(stages)) return pipeline;
    const expandedStages = stages.map((stage, stageIndex) => {
      if (!isRecord(stage) || !Array.isArray(stage.effects)) return stage;
      return {
        ...stage,
        effects: expandEffectArray(
          stage.effects,
          `doc.actionPipelines.${pipelineIndex}.stages.${stageIndex}.effects`,
          state,
        ),
      };
    });
    let expandedCostEffects = pipeline.costEffects;
    if (Array.isArray(pipeline.costEffects)) {
      expandedCostEffects = expandEffectArray(
        pipeline.costEffects,
        `doc.actionPipelines.${pipelineIndex}.costEffects`,
        state,
      );
    }
    return { ...pipeline, stages: expandedStages, costEffects: expandedCostEffects };
  }) as GameSpecDoc['actionPipelines'];
}

function expandEffectArray(effects: readonly unknown[], path: string, state: ExpansionState): readonly unknown[] {
  const expanded: unknown[] = [];
  for (const [index, effect] of effects.entries()) {
    expanded.push(...expandSingleEffect(effect, `${path}.${index}`, state));
  }
  return expanded;
}

function expandSingleEffect(effect: unknown, path: string, state: ExpansionState): readonly unknown[] {
  if (!isRecord(effect)) {
    return [effect];
  }

  const refillToSize = expandRefillToSize(effect, path, state);
  if (refillToSize !== undefined) {
    return refillToSize;
  }

  const discardDownTo = expandDiscardDownTo(effect, path, state);
  if (discardDownTo !== undefined) {
    return [discardDownTo];
  }

  const drawEach = expandDrawEach(effect, path, state);
  if (drawEach !== undefined) {
    return [drawEach];
  }

  if (isRecord(effect.if)) {
    const thenEffects = Array.isArray(effect.if.then)
      ? expandEffectArray(effect.if.then, `${path}.if.then`, state)
      : effect.if.then;
    const elseEffects = Array.isArray(effect.if.else)
      ? expandEffectArray(effect.if.else, `${path}.if.else`, state)
      : effect.if.else;

    return [
      {
        ...effect,
        if: {
          ...effect.if,
          ...(thenEffects !== effect.if.then ? { then: thenEffects } : {}),
          ...(elseEffects !== effect.if.else ? { else: elseEffects } : {}),
        },
      },
    ];
  }

  if (isRecord(effect.forEach) && Array.isArray(effect.forEach.effects)) {
    return [
      {
        ...effect,
        forEach: {
          ...effect.forEach,
          effects: expandEffectArray(effect.forEach.effects, `${path}.forEach.effects`, state),
        },
      },
    ];
  }

  if (isRecord(effect.reduce) && Array.isArray(effect.reduce.in)) {
    return [
      {
        ...effect,
        reduce: {
          ...effect.reduce,
          in: expandEffectArray(effect.reduce.in, `${path}.reduce.in`, state),
        },
      },
    ];
  }

  if (isRecord(effect.let) && Array.isArray(effect.let.in)) {
    return [
      {
        ...effect,
        let: {
          ...effect.let,
          in: expandEffectArray(effect.let.in, `${path}.let.in`, state),
        },
      },
    ];
  }

  return [effect];
}

function expandRefillToSize(
  effect: Record<string, unknown>,
  path: string,
  state: ExpansionState,
): readonly unknown[] | undefined {
  const refillNode = effect.refillToSize;
  if (!isRecord(refillNode)) {
    return undefined;
  }

  if (!isValidMacroSize(refillNode.size)) {
    state.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path: `${path}.refillToSize.size`,
      severity: 'error',
      message: 'refillToSize requires compile-time integer literal size >= 0.',
      suggestion:
        'Use a non-negative integer literal size, or rewrite as explicit if + draw effects with count: 1.',
    });
    return [effect];
  }

  if (typeof refillNode.zone !== 'string' || typeof refillNode.fromZone !== 'string') {
    return [effect];
  }

  const size = refillNode.size;
  if (!consumeExpandedEffects(path, state, size, 'refillToSize')) {
    return [effect];
  }

  const expanded: unknown[] = [];
  for (let index = 0; index < size; index += 1) {
    expanded.push({
      if: {
        when: {
          op: '<',
          left: { ref: 'zoneCount', zone: refillNode.zone },
          right: size,
        },
        then: [{ draw: { from: refillNode.fromZone, to: refillNode.zone, count: 1 } }],
        else: [],
      },
    });
  }

  return expanded;
}

function expandDiscardDownTo(
  effect: Record<string, unknown>,
  path: string,
  state: ExpansionState,
): unknown | undefined {
  const discardNode = effect.discardDownTo;
  if (!isRecord(discardNode)) {
    return undefined;
  }

  if (!isValidMacroSize(discardNode.size)) {
    state.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path: `${path}.discardDownTo.size`,
      severity: 'error',
      message: 'discardDownTo requires compile-time integer literal size >= 0.',
      suggestion:
        'Use a non-negative integer literal size, or rewrite as explicit token loop gated by zoneCount(zone) > size.',
    });
    return effect;
  }

  if (typeof discardNode.zone !== 'string') {
    return effect;
  }

  if (!consumeExpandedEffects(path, state, 1, 'discardDownTo')) {
    return effect;
  }

  const surplusGuard = {
    op: '>',
    left: { ref: 'zoneCount', zone: discardNode.zone },
    right: discardNode.size,
  };

  const thenEffects =
    typeof discardNode.to === 'string'
      ? [{ moveToken: { token: '$tok', from: discardNode.zone, to: discardNode.to } }]
      : [{ destroyToken: { token: '$tok' } }];

  return {
    forEach: {
      bind: '$tok',
      over: { query: 'tokensInZone', zone: discardNode.zone },
      effects: [
        {
          if: {
            when: surplusGuard,
            then: thenEffects,
            else: [],
          },
        },
      ],
    },
  };
}

function expandDrawEach(effect: Record<string, unknown>, path: string, state: ExpansionState): unknown | undefined {
  const drawNode = effect.draw;
  if (!isRecord(drawNode) || drawNode.to !== 'hand:each') {
    return undefined;
  }

  if (!consumeExpandedEffects(path, state, 1, 'draw:each', `${path}.draw.to`)) {
    return effect;
  }

  return {
    forEach: {
      bind: '$p',
      over: { query: 'players' },
      effects: [
        {
          draw: {
            ...drawNode,
            to: 'hand:$p',
          },
        },
      ],
    },
  };
}

function zoneDefToSpecZone(zone: {
  readonly id: unknown;
  readonly owner: unknown;
  readonly visibility: unknown;
  readonly ordering: unknown;
  readonly adjacentTo?: readonly {
    readonly to: unknown;
    readonly direction?: unknown;
    readonly category?: unknown;
    readonly attributes?: unknown;
  }[];
}): unknown {
  const adjacentTo = zone.adjacentTo?.map((entry) => ({
    to: String(entry.to),
    ...(entry.direction === undefined ? {} : { direction: entry.direction }),
    ...(entry.category === undefined ? {} : { category: entry.category }),
    ...(entry.attributes === undefined ? {} : { attributes: entry.attributes }),
  }));
  if (adjacentTo === undefined) {
    return {
      id: String(zone.id),
      owner: zone.owner,
      visibility: zone.visibility,
      ordering: zone.ordering,
    };
  }

  return {
    id: String(zone.id),
    owner: zone.owner,
    visibility: zone.visibility,
    ordering: zone.ordering,
    adjacentTo,
  };
}

function isBoardMacroZone(value: unknown): value is { readonly macro: string; readonly args: readonly unknown[] } {
  return isRecord(value) && typeof value.macro === 'string' && Array.isArray(value.args);
}

function isValidMacroSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function consumeExpandedEffects(
  path: string,
  state: ExpansionState,
  count: number,
  macroName: string,
  diagnosticPath = path,
): boolean {
  const nextExpandedEffects = state.expandedEffects + count;
  if (nextExpandedEffects > state.maxExpandedEffects) {
    state.diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_LIMIT_EXCEEDED,
      path: diagnosticPath,
      severity: 'error',
      message: `Macro expansion exceeded maxExpandedEffects (${nextExpandedEffects} > ${state.maxExpandedEffects}).`,
      suggestion: `Reduce ${macroName} expansion count or increase compile limit maxExpandedEffects.`,
    });
    return false;
  }

  state.expandedEffects = nextExpandedEffects;
  return true;
}

interface ExpansionState {
  readonly maxExpandedEffects: number;
  expandedEffects: number;
  readonly diagnostics: Diagnostic[];
}
