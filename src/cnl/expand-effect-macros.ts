import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  EffectMacroDef,
  GameSpecDoc,
  GameSpecEffect,
} from './game-spec-doc.js';

const MAX_EXPANSION_DEPTH = 10;

interface MacroIndex {
  readonly byId: ReadonlyMap<string, EffectMacroDef>;
}

const BINDING_TOKEN_RE = /\$[A-Za-z0-9_]+/g;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeForBindingNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '_');
}

function makeHygienicBindingName(macroId: string, invocationPath: string, bindingName: string): string {
  const stem = bindingName.startsWith('$') ? bindingName.slice(1) : bindingName;
  return `$__macro_${sanitizeForBindingNamespace(macroId)}_${sanitizeForBindingNamespace(invocationPath)}_${sanitizeForBindingNamespace(stem)}`;
}

function collectDeclaredBinders(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectDeclaredBinders(item, into);
    }
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  const chooseOneNode = node.chooseOne;
  if (isRecord(chooseOneNode) && typeof chooseOneNode.bind === 'string') {
    into.add(chooseOneNode.bind);
  }

  const chooseNNode = node.chooseN;
  if (isRecord(chooseNNode) && typeof chooseNNode.bind === 'string') {
    into.add(chooseNNode.bind);
  }

  for (const value of Object.values(node)) {
    collectDeclaredBinders(value, into);
  }
}

function renameBindingTokens(value: string, mappingEntries: readonly [string, string][]): string {
  let output = value;
  for (const [from, to] of mappingEntries) {
    if (output === from) {
      output = to;
      continue;
    }

    const directPattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(from)}(?=$|[^A-Za-z0-9_])`, 'g');
    output = output.replace(directPattern, (_full, prefix: string) => `${prefix}${to}`);

    output = output.replace(BINDING_TOKEN_RE, (token) => (token === from ? to : token));
  }

  return output;
}

function rewriteBindings(node: unknown, mappingEntries: readonly [string, string][]): unknown {
  if (typeof node === 'string') {
    return renameBindingTokens(node, mappingEntries);
  }
  if (Array.isArray(node)) {
    return node.map((item) => rewriteBindings(item, mappingEntries));
  }
  if (!isRecord(node)) {
    return node;
  }

  const rewritten: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    rewritten[key] = rewriteBindings(value, mappingEntries);
  }
  return rewritten;
}

function normalizeExportedBindings(
  macroDef: EffectMacroDef,
  declaredBindings: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): ReadonlySet<string> {
  if (macroDef.exports === undefined) {
    const implicitExports = new Set<string>();
    for (const bindingName of declaredBindings) {
      // Template-style binders are intended to be invocation-local.
      // Non-templated binders remain externally visible by default.
      if (!bindingName.includes('{')) {
        implicitExports.add(bindingName);
      }
    }
    return implicitExports;
  }

  const exported = new Set<string>();

  if (!Array.isArray(macroDef.exports)) {
    diagnostics.push({
      code: 'EFFECT_MACRO_EXPORTS_INVALID',
      path: `effectMacros.${macroDef.id}.exports`,
      severity: 'error',
      message: `Macro "${macroDef.id}" exports must be an array of binding names.`,
      suggestion: 'Provide exports as an array of strings.',
    });
    return exported;
  }
  for (const [index, bindingName] of macroDef.exports.entries()) {
    if (typeof bindingName !== 'string') {
      diagnostics.push({
        code: 'EFFECT_MACRO_EXPORTS_INVALID',
        path: `effectMacros.${macroDef.id}.exports.${index}`,
        severity: 'error',
        message: `Macro "${macroDef.id}" export at index ${index} must be a string.`,
        suggestion: 'Use string binding names in exports.',
      });
      continue;
    }

    if (exported.has(bindingName)) {
      diagnostics.push({
        code: 'EFFECT_MACRO_EXPORT_DUPLICATE',
        path: `effectMacros.${macroDef.id}.exports.${index}`,
        severity: 'error',
        message: `Macro "${macroDef.id}" exports duplicate binding "${bindingName}".`,
        suggestion: 'Remove duplicate exports entries.',
      });
      continue;
    }

    if (!declaredBindings.has(bindingName)) {
      diagnostics.push({
        code: 'EFFECT_MACRO_EXPORT_UNKNOWN_BINDING',
        path: `effectMacros.${macroDef.id}.exports.${index}`,
        severity: 'error',
        message: `Macro "${macroDef.id}" exports undeclared binding "${bindingName}".`,
        suggestion: 'Export only bindings declared by macro bind fields.',
      });
      continue;
    }

    exported.add(bindingName);
  }

  return exported;
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

  const declaredBindings = new Set<string>();
  for (const templateEffect of def.effects) {
    collectDeclaredBinders(templateEffect, declaredBindings);
  }
  const exportedBindings = normalizeExportedBindings(def, declaredBindings, diagnostics);

  const renameMap = new Map<string, string>();
  for (const bindingName of declaredBindings) {
    if (exportedBindings.has(bindingName)) {
      continue;
    }
    renameMap.set(bindingName, makeHygienicBindingName(macroId, path, bindingName));
  }

  const mappingEntries = [...renameMap.entries()].sort((left, right) => right[0].length - left[0].length);
  const hygienicTemplates =
    mappingEntries.length === 0
      ? def.effects
      : def.effects.map((templateEffect) => rewriteBindings(templateEffect, mappingEntries) as GameSpecEffect);
  const hygienicSubstituted = hygienicTemplates.map((templateEffect) =>
    substituteParams(templateEffect, args) as GameSpecEffect,
  );

  const nestedVisited = new Set(visitedStack);
  nestedVisited.add(macroId);

  const expanded: GameSpecEffect[] = [];
  for (let i = 0; i < hygienicSubstituted.length; i++) {
    const sub = hygienicSubstituted[i];
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

  // Walk the entire document tree generically. expandValueRecursive
  // handles arrays (detecting macro invocations), objects, and
  // primitives. Sections without macros pass through unchanged.
  // This avoids enumerating sections explicitly so any new section
  // (e.g. actionPipelines) automatically benefits from expansion.
  const expanded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'effectMacros') {
      expanded[key] = null;
    } else {
      expanded[key] = expandValueRecursive(
        value, index, diagnostics, key, new Set(), 0,
      );
    }
  }

  return {
    doc: expanded as unknown as GameSpecDoc,
    diagnostics,
  };
}
