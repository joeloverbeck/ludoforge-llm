import type { Diagnostic } from '../kernel/diagnostics.js';
import type { ConditionMacroDef, EffectMacroParam, GameSpecDoc } from './game-spec-doc.js';

const MAX_EXPANSION_DEPTH = 12;

interface IndexedConditionMacroDef {
  readonly id: string;
  readonly declarationPath: string;
  readonly params: readonly EffectMacroParam[];
  readonly condition: unknown;
}

interface ExpansionContext {
  readonly byId: ReadonlyMap<string, IndexedConditionMacroDef>;
  readonly diagnostics: Diagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConditionMacroInvocation(node: unknown): node is { readonly conditionMacro: string; readonly args?: Record<string, unknown> } {
  return isRecord(node) && typeof node.conditionMacro === 'string';
}

function substituteParams(node: unknown, args: Readonly<Record<string, unknown>>): unknown {
  if (isRecord(node) && typeof node.param === 'string' && Object.keys(node).length === 1) {
    const paramName = node.param;
    if (paramName in args) {
      return args[paramName];
    }
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((entry) => substituteParams(entry, args));
  }

  if (isRecord(node)) {
    const rewritten: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      rewritten[key] = substituteParams(value, args);
    }
    return rewritten;
  }

  return node;
}

function buildIndex(defs: readonly ConditionMacroDef[], diagnostics: Diagnostic[]): ReadonlyMap<string, IndexedConditionMacroDef> {
  const byId = new Map<string, IndexedConditionMacroDef>();

  for (const [index, def] of defs.entries()) {
    const path = `conditionMacros[${index}]`;
    if (typeof def.id !== 'string' || def.id.trim() === '') {
      diagnostics.push({
        code: 'CONDITION_MACRO_ID_INVALID',
        path: `${path}.id`,
        severity: 'error',
        message: 'Condition macro id must be a non-empty string.',
      });
      continue;
    }

    if (byId.has(def.id)) {
      diagnostics.push({
        code: 'CONDITION_MACRO_DUPLICATE_ID',
        path,
        severity: 'error',
        message: `Duplicate condition macro id "${def.id}".`,
      });
      continue;
    }

    const seenParams = new Set<string>();
    let hasParamIssues = false;
    for (const [paramIndex, param] of (def.params ?? []).entries()) {
      if (typeof param?.name !== 'string' || param.name.trim() === '') {
        hasParamIssues = true;
        diagnostics.push({
          code: 'CONDITION_MACRO_PARAM_NAME_INVALID',
          path: `${path}.params[${paramIndex}].name`,
          severity: 'error',
          message: `Condition macro "${def.id}" param name must be a non-empty string.`,
        });
        continue;
      }
      if (seenParams.has(param.name)) {
        hasParamIssues = true;
        diagnostics.push({
          code: 'CONDITION_MACRO_PARAM_DUPLICATE',
          path: `${path}.params[${paramIndex}].name`,
          severity: 'error',
          message: `Condition macro "${def.id}" declares duplicate param "${param.name}".`,
        });
        continue;
      }
      seenParams.add(param.name);
    }

    if (hasParamIssues) {
      continue;
    }

    byId.set(def.id, {
      id: def.id,
      declarationPath: path,
      params: def.params ?? [],
      condition: def.condition,
    });
  }

  return byId;
}

function expandInvocation(
  invocation: { readonly conditionMacro: string; readonly args?: Record<string, unknown> },
  ctx: ExpansionContext,
  path: string,
  stack: readonly string[],
  depth: number,
): unknown {
  const macro = ctx.byId.get(invocation.conditionMacro);
  if (macro === undefined) {
    ctx.diagnostics.push({
      code: 'CONDITION_MACRO_UNKNOWN',
      path,
      severity: 'error',
      message: `Unknown condition macro "${invocation.conditionMacro}".`,
    });
    return invocation;
  }

  if (depth > MAX_EXPANSION_DEPTH) {
    ctx.diagnostics.push({
      code: 'CONDITION_MACRO_MAX_DEPTH',
      path,
      severity: 'error',
      message: `Condition macro expansion exceeded max depth (${MAX_EXPANSION_DEPTH}).`,
      suggestion: 'Reduce nested condition macro indirection depth.',
    });
    return invocation;
  }

  if (stack.includes(macro.id)) {
    ctx.diagnostics.push({
      code: 'CONDITION_MACRO_CYCLE',
      path,
      severity: 'error',
      message: `Circular condition macro expansion detected: ${[...stack, macro.id].join(' -> ')}.`,
    });
    return invocation;
  }

  const args = invocation.args ?? {};
  if (!isRecord(args)) {
    ctx.diagnostics.push({
      code: 'CONDITION_MACRO_ARGS_INVALID',
      path: `${path}.args`,
      severity: 'error',
      message: `Condition macro "${macro.id}" args must be an object.`,
    });
    return invocation;
  }

  const paramNames = new Set(macro.params.map((param) => param.name));
  const missing = [...paramNames].filter((name) => !(name in args));
  if (missing.length > 0) {
    ctx.diagnostics.push({
      code: 'CONDITION_MACRO_MISSING_ARGS',
      path,
      severity: 'error',
      message: `Condition macro "${macro.id}" missing required args: ${missing.join(', ')}.`,
    });
    return invocation;
  }

  const extras = Object.keys(args).filter((name) => !paramNames.has(name));
  if (extras.length > 0) {
    ctx.diagnostics.push({
      code: 'CONDITION_MACRO_EXTRA_ARGS',
      path,
      severity: 'error',
      message: `Condition macro "${macro.id}" received unexpected args: ${extras.join(', ')}.`,
    });
    return invocation;
  }

  const substituted = substituteParams(macro.condition, args);
  return expandNode(substituted, ctx, `${path}[conditionMacro:${macro.id}]`, [...stack, macro.id], depth + 1);
}

function expandNode(
  node: unknown,
  ctx: ExpansionContext,
  path: string,
  stack: readonly string[],
  depth: number,
): unknown {
  if (Array.isArray(node)) {
    return node.map((entry, index) => expandNode(entry, ctx, `${path}[${index}]`, stack, depth));
  }

  if (!isRecord(node)) {
    return node;
  }

  if (isConditionMacroInvocation(node)) {
    return expandInvocation(node, ctx, path, stack, depth);
  }

  const rewritten: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    rewritten[key] = expandNode(value, ctx, `${path}.${key}`, stack, depth);
  }
  return rewritten;
}

export function expandConditionMacros(doc: GameSpecDoc): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  if (doc.conditionMacros === null || doc.conditionMacros.length === 0) {
    return { doc, diagnostics: [] };
  }

  const diagnostics: Diagnostic[] = [];
  const byId = buildIndex(doc.conditionMacros, diagnostics);
  const ctx: ExpansionContext = { byId, diagnostics };

  const rewrittenEntries = Object.entries(doc).map(([key, value]) => {
    if (key === 'conditionMacros') {
      return [key, value] as const;
    }
    return [key, expandNode(value, ctx, `doc.${key}`, [], 0)] as const;
  });

  return {
    doc: Object.fromEntries(rewrittenEntries) as GameSpecDoc,
    diagnostics,
  };
}
