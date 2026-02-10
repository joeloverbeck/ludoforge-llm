import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameDef } from '../kernel/types.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';
import { capDiagnostics, dedupeDiagnostics, sortDiagnosticsDeterministic } from './compiler-diagnostics.js';
import { expandBoardMacro } from './expand-macros.js';

export interface CompileLimits {
  readonly maxExpandedEffects: number;
  readonly maxGeneratedZones: number;
  readonly maxDiagnosticCount: number;
}

export interface CompileOptions {
  readonly sourceMap?: GameSpecSourceMap;
  readonly limits?: Partial<CompileLimits>;
}

export const DEFAULT_COMPILE_LIMITS: CompileLimits = {
  maxExpandedEffects: 20_000,
  maxGeneratedZones: 10_000,
  maxDiagnosticCount: 500,
};

export function resolveCompileLimits(overrides?: Partial<CompileLimits>): CompileLimits {
  const maxExpandedEffects = resolveLimit(
    overrides?.maxExpandedEffects,
    DEFAULT_COMPILE_LIMITS.maxExpandedEffects,
    'maxExpandedEffects',
  );
  const maxGeneratedZones = resolveLimit(
    overrides?.maxGeneratedZones,
    DEFAULT_COMPILE_LIMITS.maxGeneratedZones,
    'maxGeneratedZones',
  );
  const maxDiagnosticCount = resolveLimit(
    overrides?.maxDiagnosticCount,
    DEFAULT_COMPILE_LIMITS.maxDiagnosticCount,
    'maxDiagnosticCount',
  );

  return {
    maxExpandedEffects,
    maxGeneratedZones,
    maxDiagnosticCount,
  };
}

export function expandMacros(
  doc: GameSpecDoc,
  options?: CompileOptions,
): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  const limits = resolveCompileLimits(options?.limits);
  const diagnostics: Diagnostic[] = [];

  const zonesExpansion = expandZoneMacros(doc.zones, limits.maxGeneratedZones, diagnostics);
  const effectsExpansion = expandEffectSections(
    {
      setup: doc.setup,
      actions: doc.actions,
      triggers: doc.triggers,
      turnStructure: doc.turnStructure,
    },
    limits.maxExpandedEffects,
    diagnostics,
  );

  const expandedDoc: GameSpecDoc = {
    ...doc,
    zones: zonesExpansion,
    setup: effectsExpansion.setup,
    actions: effectsExpansion.actions,
    triggers: effectsExpansion.triggers,
    turnStructure: effectsExpansion.turnStructure,
  };

  const finalizedDiagnostics = finalizeDiagnostics(diagnostics, options?.sourceMap, limits.maxDiagnosticCount);

  return {
    doc: expandedDoc,
    diagnostics: finalizedDiagnostics,
  };
}

export function compileGameSpecToGameDef(
  doc: GameSpecDoc,
  options?: CompileOptions,
): {
  readonly gameDef: GameDef | null;
  readonly diagnostics: readonly Diagnostic[];
} {
  const limits = resolveCompileLimits(options?.limits);
  const expanded = expandMacros(doc, options);
  const diagnostics = finalizeDiagnostics(
    [
      ...expanded.diagnostics,
      {
        code: 'CNL_COMPILER_NOT_IMPLEMENTED',
        path: 'doc',
        severity: 'error',
        message: 'Compiler semantic lowering is not implemented yet.',
        suggestion: 'Complete later GAMSPECOM compiler tickets to enable full GameDef emission.',
      },
    ],
    options?.sourceMap,
    limits.maxDiagnosticCount,
  );

  return {
    gameDef: null,
    diagnostics,
  };
}

function finalizeDiagnostics(
  diagnostics: readonly Diagnostic[],
  sourceMap: GameSpecSourceMap | undefined,
  maxDiagnosticCount: number,
): readonly Diagnostic[] {
  const sorted = sortDiagnosticsDeterministic(diagnostics, sourceMap);
  const deduped = dedupeDiagnostics(sorted);
  return capDiagnostics(deduped, maxDiagnosticCount);
}

function resolveLimit(candidate: number | undefined, fallback: number, name: keyof CompileLimits): number {
  if (candidate === undefined) {
    return fallback;
  }
  if (!Number.isInteger(candidate) || candidate < 0) {
    throw new Error(`${name} must be an integer >= 0.`);
  }
  return candidate;
}

function expandZoneMacros(
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
        code: 'CNL_COMPILER_LIMIT_EXCEEDED',
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

function expandEffectSections(
  sections: Pick<GameSpecDoc, 'setup' | 'actions' | 'triggers' | 'turnStructure'>,
  maxExpandedEffects: number,
  diagnostics: Diagnostic[],
): Pick<GameSpecDoc, 'setup' | 'actions' | 'triggers' | 'turnStructure'> {
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

function expandDrawEach(effect: Record<string, unknown>, path: string, state: ExpansionState): unknown | undefined {
  const drawNode = effect.draw;
  if (!isRecord(drawNode) || drawNode.to !== 'hand:each') {
    return undefined;
  }

  const nextExpandedEffects = state.expandedEffects + 1;
  if (nextExpandedEffects > state.maxExpandedEffects) {
    state.diagnostics.push({
      code: 'CNL_COMPILER_LIMIT_EXCEEDED',
      path: `${path}.draw.to`,
      severity: 'error',
      message: `Macro expansion exceeded maxExpandedEffects (${nextExpandedEffects} > ${state.maxExpandedEffects}).`,
      suggestion: 'Reduce draw:each expansion count or increase compile limit maxExpandedEffects.',
    });
    return effect;
  }

  state.expandedEffects = nextExpandedEffects;

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
  readonly adjacentTo?: readonly unknown[];
}): unknown {
  const adjacentTo = zone.adjacentTo?.map((entry) => String(entry));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ExpansionState {
  readonly maxExpandedEffects: number;
  expandedEffects: number;
  readonly diagnostics: Diagnostic[];
}
