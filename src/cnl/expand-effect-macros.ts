import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  EffectMacroDef,
  GameSpecActionDef,
  GameSpecDoc,
  GameSpecEffect,
  GameSpecTriggerDef,
} from './game-spec-doc.js';

const MAX_EXPANSION_DEPTH = 10;

interface MacroIndex {
  readonly byId: ReadonlyMap<string, EffectMacroDef>;
}

function isParamNode(node: unknown): node is { readonly param: string } {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    'param' in node &&
    typeof (node as Record<string, unknown>).param === 'string' &&
    Object.keys(node as Record<string, unknown>).length === 1
  );
}

function isMacroInvocation(node: unknown): node is { readonly macro: string; readonly args: Record<string, unknown> } {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    'macro' in node &&
    typeof (node as Record<string, unknown>).macro === 'string'
  );
}

function substituteParams(
  node: unknown,
  args: Readonly<Record<string, unknown>>,
): unknown {
  if (isParamNode(node)) {
    const paramName = node.param;
    if (paramName in args) {
      return args[paramName];
    }
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((child) => substituteParams(child, args));
  }

  if (typeof node === 'object' && node !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = substituteParams(value, args);
    }
    return result;
  }

  return node;
}

function expandEffect(
  effect: GameSpecEffect,
  index: MacroIndex,
  diagnostics: Diagnostic[],
  path: string,
  visitedStack: ReadonlySet<string>,
  depth: number,
): readonly GameSpecEffect[] {
  if (!isMacroInvocation(effect)) {
    return [expandEffectsInNode(effect, index, diagnostics, path, visitedStack, depth)];
  }

  const macroId = effect.macro;
  const def = index.byId.get(macroId);
  if (def === undefined) {
    diagnostics.push({
      code: 'EFFECT_MACRO_UNKNOWN',
      path,
      severity: 'error',
      message: `Unknown effect macro "${macroId}".`,
    });
    return [];
  }

  if (visitedStack.has(macroId)) {
    diagnostics.push({
      code: 'EFFECT_MACRO_CYCLE',
      path,
      severity: 'error',
      message: `Circular macro expansion detected: ${[...visitedStack, macroId].join(' → ')}.`,
    });
    return [];
  }

  if (depth >= MAX_EXPANSION_DEPTH) {
    diagnostics.push({
      code: 'EFFECT_MACRO_DEPTH_EXCEEDED',
      path,
      severity: 'error',
      message: `Macro expansion depth exceeds maximum (${MAX_EXPANSION_DEPTH}).`,
    });
    return [];
  }

  const args = (typeof effect.args === 'object' && effect.args !== null && !Array.isArray(effect.args))
    ? effect.args as Record<string, unknown>
    : {};

  const missingParams = def.params.filter((p) => !(p.name in args));
  if (missingParams.length > 0) {
    diagnostics.push({
      code: 'EFFECT_MACRO_MISSING_ARGS',
      path,
      severity: 'error',
      message: `Macro "${macroId}" missing required args: ${missingParams.map((p) => p.name).join(', ')}.`,
    });
    return [];
  }

  const extraArgs = Object.keys(args).filter((k) => !def.params.some((p) => p.name === k));
  if (extraArgs.length > 0) {
    diagnostics.push({
      code: 'EFFECT_MACRO_EXTRA_ARGS',
      path,
      severity: 'warning',
      message: `Macro "${macroId}" received unexpected args: ${extraArgs.join(', ')}.`,
    });
  }

  const substituted = def.effects.map((templateEffect) =>
    substituteParams(templateEffect, args) as GameSpecEffect,
  );

  const nestedVisited = new Set(visitedStack);
  nestedVisited.add(macroId);

  const expanded: GameSpecEffect[] = [];
  for (let i = 0; i < substituted.length; i++) {
    const sub = substituted[i];
    if (sub === undefined) continue;
    const results = expandEffect(sub, index, diagnostics, `${path}[macro:${macroId}][${i}]`, nestedVisited, depth + 1);
    expanded.push(...results);
  }

  return expanded;
}

function expandEffectsInNode(
  node: GameSpecEffect,
  index: MacroIndex,
  diagnostics: Diagnostic[],
  path: string,
  visitedStack: ReadonlySet<string>,
  depth: number,
): GameSpecEffect {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] = expandValueRecursive(value, index, diagnostics, `${path}.${key}`, visitedStack, depth);
  }
  return result as GameSpecEffect;
}

function expandValueRecursive(
  value: unknown,
  index: MacroIndex,
  diagnostics: Diagnostic[],
  path: string,
  visitedStack: ReadonlySet<string>,
  depth: number,
): unknown {
  if (Array.isArray(value)) {
    const expanded: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i] as unknown;
      if (isMacroInvocation(item)) {
        const results = expandEffect(item as GameSpecEffect, index, diagnostics, `${path}[${i}]`, visitedStack, depth);
        expanded.push(...results);
      } else if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        expanded.push(expandEffectsInNode(item as GameSpecEffect, index, diagnostics, `${path}[${i}]`, visitedStack, depth));
      } else {
        expanded.push(item);
      }
    }
    return expanded;
  }

  if (typeof value === 'object' && value !== null) {
    return expandEffectsInNode(value as GameSpecEffect, index, diagnostics, path, visitedStack, depth);
  }

  return value;
}

function expandEffectList(
  effects: readonly GameSpecEffect[],
  index: MacroIndex,
  diagnostics: Diagnostic[],
  path: string,
): readonly GameSpecEffect[] {
  const result: GameSpecEffect[] = [];
  for (let i = 0; i < effects.length; i++) {
    const eff = effects[i];
    if (eff === undefined) continue;
    const expanded = expandEffect(eff, index, diagnostics, `${path}[${i}]`, new Set(), 0);
    result.push(...expanded);
  }
  return result;
}

function expandActionEffects(
  action: GameSpecActionDef,
  index: MacroIndex,
  diagnostics: Diagnostic[],
  path: string,
): GameSpecActionDef {
  const effects = action.effects;
  if (!Array.isArray(effects)) {
    return action;
  }
  return {
    ...action,
    effects: expandEffectList(effects as readonly GameSpecEffect[], index, diagnostics, `${path}.effects`),
  };
}

function expandTriggerEffects(
  trigger: GameSpecTriggerDef,
  index: MacroIndex,
  diagnostics: Diagnostic[],
  path: string,
): GameSpecTriggerDef {
  const effects = trigger.effects;
  if (!Array.isArray(effects)) {
    return trigger;
  }
  return {
    ...trigger,
    effects: expandEffectList(effects as readonly GameSpecEffect[], index, diagnostics, `${path}.effects`),
  };
}

function buildMacroIndex(
  macros: readonly EffectMacroDef[],
  diagnostics: Diagnostic[],
): MacroIndex {
  const byId = new Map<string, EffectMacroDef>();
  for (const macro of macros) {
    if (byId.has(macro.id)) {
      diagnostics.push({
        code: 'EFFECT_MACRO_DUPLICATE_ID',
        path: `effectMacros.${macro.id}`,
        severity: 'error',
        message: `Duplicate effect macro id "${macro.id}".`,
      });
      continue;
    }
    byId.set(macro.id, macro);
  }
  return { byId };
}

export function expandEffectMacros(
  doc: GameSpecDoc,
): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  if (doc.effectMacros === null || doc.effectMacros.length === 0) {
    return { doc, diagnostics: [] };
  }

  const diagnostics: Diagnostic[] = [];
  const index = buildMacroIndex(doc.effectMacros, diagnostics);

  const expandedSetup = doc.setup !== null
    ? expandEffectList(doc.setup, index, diagnostics, 'setup')
    : null;

  const expandedActions = doc.actions !== null
    ? doc.actions.map((action, i) => expandActionEffects(action, index, diagnostics, `actions[${i}]`))
    : null;

  const expandedTriggers = doc.triggers !== null
    ? doc.triggers.map((trigger, i) => expandTriggerEffects(trigger, index, diagnostics, `triggers[${i}]`))
    : null;

  return {
    doc: {
      ...doc,
      setup: expandedSetup,
      actions: expandedActions,
      triggers: expandedTriggers,
      effectMacros: null,
    },
    diagnostics,
  };
}
