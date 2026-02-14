import type { Diagnostic } from '../kernel/diagnostics.js';
import {
  collectDeclaredBinderCandidates,
  rewriteDeclaredBindersInEffectNode,
  rewriteKnownReferencersInEffectNode,
} from './binder-surface-registry.js';
import type {
  EffectMacroDef,
  EffectMacroParamPrimitiveLiteral,
  GameSpecDoc,
  GameSpecEffect,
} from './game-spec-doc.js';

const MAX_EXPANSION_DEPTH = 10;

interface MacroIndex {
  readonly byId: ReadonlyMap<string, IndexedMacroDef>;
}

type NormalizedMacroParamConstraint =
  | { readonly kind: 'string' }
  | { readonly kind: 'number' }
  | { readonly kind: 'effect' }
  | { readonly kind: 'effects' }
  | { readonly kind: 'value' }
  | { readonly kind: 'condition' }
  | { readonly kind: 'query' }
  | { readonly kind: 'bindingName' }
  | { readonly kind: 'bindingTemplate' }
  | { readonly kind: 'zoneSelector' }
  | { readonly kind: 'playerSelector' }
  | { readonly kind: 'tokenSelector' }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'literals'; readonly values: readonly EffectMacroParamPrimitiveLiteral[] };

interface IndexedMacroParam {
  readonly name: string;
  readonly declarationPath: string;
  readonly constraint: NormalizedMacroParamConstraint;
}

interface IndexedMacroDef {
  readonly def: EffectMacroDef;
  readonly params: readonly IndexedMacroParam[];
  readonly declaredBindings: ReadonlySet<string>;
  readonly exportedBindings: ReadonlySet<string>;
}

const STRING_PARAM_TYPES = new Set([
  'string',
  'number',
  'effect',
  'effects',
  'value',
  'condition',
  'query',
  'bindingName',
  'bindingTemplate',
  'zoneSelector',
  'playerSelector',
  'tokenSelector',
]);

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

function isPrimitiveLiteral(value: unknown): value is EffectMacroParamPrimitiveLiteral {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isStringMacroParamType(
  type: string,
): type is
  | 'string'
  | 'number'
  | 'effect'
  | 'effects'
  | 'value'
  | 'condition'
  | 'query'
  | 'bindingName'
  | 'bindingTemplate'
  | 'zoneSelector'
  | 'playerSelector'
  | 'tokenSelector' {
  return STRING_PARAM_TYPES.has(type);
}

function normalizeMacroParamConstraint(
  macroId: string,
  paramIndex: number,
  type: unknown,
  diagnostics: Diagnostic[],
): NormalizedMacroParamConstraint | null {
  const typePath = `effectMacros.${macroId}.params.${paramIndex}.type`;
  if (typeof type === 'string') {
    if (!isStringMacroParamType(type)) {
      diagnostics.push({
        code: 'EFFECT_MACRO_PARAM_TYPE_INVALID',
        path: typePath,
        severity: 'error',
        message: `Macro "${macroId}" param type "${type}" is unsupported.`,
        suggestion: 'Use one of: string, number, effect, effects, value, condition, query, bindingName, bindingTemplate, zoneSelector, playerSelector, tokenSelector, or a constrained kind.',
      });
      return null;
    }
    return { kind: type };
  }

  if (!isRecord(type) || typeof type.kind !== 'string') {
    diagnostics.push({
      code: 'EFFECT_MACRO_PARAM_TYPE_INVALID',
      path: typePath,
      severity: 'error',
      message: `Macro "${macroId}" param type must be a known string type or constrained kind object.`,
    });
    return null;
  }

  if (type.kind === 'enum') {
    const values = type.values;
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string' || value.length === 0)) {
      diagnostics.push({
        code: 'EFFECT_MACRO_PARAM_ENUM_INVALID',
        path: `${typePath}.values`,
        severity: 'error',
        message: `Macro "${macroId}" enum param must declare a non-empty string values array.`,
        suggestion: 'Set enum values to one or more non-empty strings.',
      });
      return null;
    }
    return { kind: 'enum', values: [...values] };
  }

  if (type.kind === 'literals') {
    const values = type.values;
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => !isPrimitiveLiteral(value))) {
      diagnostics.push({
        code: 'EFFECT_MACRO_PARAM_LITERALS_INVALID',
        path: `${typePath}.values`,
        severity: 'error',
        message: `Macro "${macroId}" literals param must declare a non-empty array of string/number/boolean/null literals.`,
      });
      return null;
    }
    return { kind: 'literals', values: [...values] };
  }

  diagnostics.push({
    code: 'EFFECT_MACRO_PARAM_TYPE_INVALID',
    path: `${typePath}.kind`,
    severity: 'error',
    message: `Macro "${macroId}" param constraint kind "${type.kind}" is unsupported.`,
    suggestion: 'Use kind: enum or kind: literals.',
  });
  return null;
}

function formatLiteral(value: EffectMacroParamPrimitiveLiteral): string {
  if (value === null) {
    return 'null';
  }
  return JSON.stringify(value);
}

function describeConstraint(constraint: NormalizedMacroParamConstraint): string {
  switch (constraint.kind) {
    case 'string':
    case 'number':
    case 'effect':
    case 'effects':
    case 'value':
    case 'condition':
    case 'query':
    case 'bindingName':
    case 'bindingTemplate':
    case 'zoneSelector':
    case 'playerSelector':
    case 'tokenSelector':
      return constraint.kind;
    case 'enum':
      return `enum(${constraint.values.map((value) => JSON.stringify(value)).join(', ')})`;
    case 'literals':
      return `literals(${constraint.values.map((value) => formatLiteral(value)).join(', ')})`;
  }
}

function describeArgumentKind(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function argumentSatisfiesConstraint(value: unknown, constraint: NormalizedMacroParamConstraint): boolean {
  switch (constraint.kind) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'effect':
      return isRecord(value);
    case 'effects':
      return Array.isArray(value) && value.every((effectNode) => isRecord(effectNode));
    case 'value':
      return isPrimitiveLiteral(value) || isRecord(value);
    case 'condition':
      return typeof value === 'boolean' || isRecord(value);
    case 'query':
      return isRecord(value) && typeof value.query === 'string';
    case 'bindingName':
    case 'bindingTemplate':
    case 'zoneSelector':
    case 'playerSelector':
    case 'tokenSelector':
      return typeof value === 'string';
    case 'enum':
      return typeof value === 'string' && constraint.values.includes(value);
    case 'literals':
      return isPrimitiveLiteral(value) && constraint.values.includes(value);
  }
}

function normalizeMacroParams(
  macroDef: EffectMacroDef,
  diagnostics: Diagnostic[],
): readonly IndexedMacroParam[] {
  const normalized: IndexedMacroParam[] = [];
  const seenNames = new Set<string>();

  for (const [paramIndex, param] of macroDef.params.entries()) {
    const name = param.name;
    const basePath = `effectMacros.${macroDef.id}.params.${paramIndex}`;
    if (typeof name !== 'string' || name.trim() === '') {
      diagnostics.push({
        code: 'EFFECT_MACRO_PARAM_NAME_INVALID',
        path: `${basePath}.name`,
        severity: 'error',
        message: `Macro "${macroDef.id}" param name must be a non-empty string.`,
      });
      continue;
    }

    if (seenNames.has(name)) {
      diagnostics.push({
        code: 'EFFECT_MACRO_PARAM_DUPLICATE',
        path: `${basePath}.name`,
        severity: 'error',
        message: `Macro "${macroDef.id}" declares duplicate param "${name}".`,
      });
      continue;
    }
    seenNames.add(name);

    const constraint = normalizeMacroParamConstraint(macroDef.id, paramIndex, param.type, diagnostics);
    if (constraint === null) {
      continue;
    }

    normalized.push({
      name,
      declarationPath: basePath,
      constraint,
    });
  }

  return normalized;
}

function validateMacroArgConstraints(
  macroId: string,
  params: readonly IndexedMacroParam[],
  args: Readonly<Record<string, unknown>>,
  invocationPath: string,
  diagnostics: Diagnostic[],
): boolean {
  let hasViolations = false;
  for (const param of params) {
    if (!(param.name in args)) {
      continue;
    }

    const value = args[param.name];
    if (argumentSatisfiesConstraint(value, param.constraint)) {
      continue;
    }

    hasViolations = true;
    diagnostics.push({
      code: 'EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION',
      path: `${invocationPath}.args.${param.name}`,
      severity: 'error',
      message: `Macro "${macroId}" arg "${param.name}" violates constraint ${describeConstraint(param.constraint)} (received ${describeArgumentKind(value)}).`,
      suggestion: `Update the arg value to satisfy "${param.name}" as declared at ${param.declarationPath}.`,
    });
    diagnostics.push({
      code: 'EFFECT_MACRO_ARG_CONSTRAINT_DECLARATION',
      path: param.declarationPath,
      severity: 'info',
      message: `Parameter "${param.name}" constraint is declared here.`,
    });
  }

  return hasViolations;
}

function sanitizeForBindingNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '_');
}

function makeHygienicBindingName(macroId: string, invocationPath: string, bindingName: string): string {
  const stem = bindingName.startsWith('$') ? bindingName.slice(1) : bindingName;
  return `$__macro_${sanitizeForBindingNamespace(macroId)}_${sanitizeForBindingNamespace(invocationPath)}_${sanitizeForBindingNamespace(stem)}`;
}

function collectDeclaredBinders(node: unknown, path: string, into: Set<string>, diagnostics: Diagnostic[]): void {
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      collectDeclaredBinders(node[index], `${path}.${index}`, into, diagnostics);
    }
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  const declareBinding = (value: unknown, fieldPath: string): void => {
    if (typeof value === 'string') {
      into.add(value);
      return;
    }
    if (value !== undefined) {
      diagnostics.push({
        code: 'EFFECT_MACRO_BINDING_DECLARATION_INVALID',
        path: fieldPath,
        severity: 'error',
        message: 'Macro binding declaration must be a static string literal.',
        suggestion: 'Use a string bind/countBind/remainingBind value; dynamic binder declarations are unsupported.',
      });
    }
  };

  for (const candidate of collectDeclaredBinderCandidates(node)) {
    declareBinding(candidate.value, `${path}.${candidate.path}`);
  }

  for (const [key, value] of Object.entries(node)) {
    collectDeclaredBinders(value, `${path}.${key}`, into, diagnostics);
  }
}

function rewriteBindingTemplate(template: string, renameMap: ReadonlyMap<string, string>): string {
  const directlyMapped = renameMap.get(template);
  if (directlyMapped !== undefined) {
    return directlyMapped;
  }

  return template.replace(/\{([^{}]+)\}/g, (fullMatch, rawName: string) => {
    const trimmed = rawName.trim();
    const renamed = renameMap.get(trimmed);
    if (renamed === undefined) {
      return fullMatch;
    }
    const leadingWhitespace = rawName.match(/^\s*/)?.[0] ?? '';
    const trailingWhitespace = rawName.match(/\s*$/)?.[0] ?? '';
    return `{${leadingWhitespace}${renamed}${trailingWhitespace}}`;
  });
}

function rewriteBindingName(name: string, renameMap: ReadonlyMap<string, string>): string {
  return rewriteBindingTemplate(name, renameMap);
}

function rewriteZoneSelectorBinding(zoneSelector: string, renameMap: ReadonlyMap<string, string>): string {
  const exactMatch = renameMap.get(zoneSelector);
  if (exactMatch !== undefined) {
    return exactMatch;
  }

  const splitIndex = zoneSelector.indexOf(':');
  if (splitIndex < 0) {
    return zoneSelector;
  }
  const base = zoneSelector.slice(0, splitIndex);
  const qualifier = zoneSelector.slice(splitIndex + 1);
  const rewrittenQualifier = rewriteBindingTemplate(qualifier, renameMap);
  if (rewrittenQualifier === qualifier) {
    return zoneSelector;
  }
  return `${base}:${rewrittenQualifier}`;
}

function isBindingAwareParamConstraint(constraint: NormalizedMacroParamConstraint): boolean {
  return (
    constraint.kind === 'bindingName' ||
    constraint.kind === 'bindingTemplate' ||
    constraint.kind === 'zoneSelector' ||
    constraint.kind === 'playerSelector' ||
    constraint.kind === 'tokenSelector'
  );
}

function rewriteBindingAwareMacroArgValue(
  value: unknown,
  constraint: NormalizedMacroParamConstraint,
  renameMap: ReadonlyMap<string, string>,
): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  switch (constraint.kind) {
    case 'bindingName':
    case 'bindingTemplate':
    case 'playerSelector':
    case 'tokenSelector':
      return rewriteBindingTemplate(value, renameMap);
    case 'zoneSelector':
      return rewriteZoneSelectorBinding(value, renameMap);
    default:
      return value;
  }
}

function rewriteTypedMacroInvocationArgs(
  node: Record<string, unknown>,
  index: MacroIndex,
  renameMap: ReadonlyMap<string, string>,
): Record<string, unknown> {
  if (!isMacroInvocation(node) || !isRecord(node.args)) {
    return node;
  }

  const callee = index.byId.get(node.macro);
  if (callee === undefined) {
    return node;
  }

  let changed = false;
  const nextArgs: Record<string, unknown> = { ...node.args };

  for (const param of callee.params) {
    if (!isBindingAwareParamConstraint(param.constraint) || !(param.name in nextArgs)) {
      continue;
    }

    const current = nextArgs[param.name];
    const rewritten = rewriteBindingAwareMacroArgValue(current, param.constraint, renameMap);
    if (rewritten !== current) {
      changed = true;
      nextArgs[param.name] = rewritten;
    }
  }

  if (!changed) {
    return node;
  }

  return { ...node, args: nextArgs };
}

function rewriteBindings(
  node: unknown,
  index: MacroIndex,
  renameMap: ReadonlyMap<string, string>,
): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => rewriteBindings(item, index, renameMap));
  }
  if (typeof node === 'string' || !isRecord(node)) {
    return node;
  }

  let rewrittenMacroArgsNode = rewriteTypedMacroInvocationArgs(node, index, renameMap);
  rewrittenMacroArgsNode = rewriteKnownReferencersInEffectNode(
    rewrittenMacroArgsNode,
    (binding) => rewriteBindingTemplate(binding, renameMap),
    (selector) => rewriteZoneSelectorBinding(selector, renameMap),
  );

  if (rewrittenMacroArgsNode.ref === 'binding' && typeof rewrittenMacroArgsNode.name === 'string') {
    return { ...rewrittenMacroArgsNode, name: rewriteBindingName(rewrittenMacroArgsNode.name, renameMap) };
  }
  if (rewrittenMacroArgsNode.ref === 'tokenProp' && typeof rewrittenMacroArgsNode.token === 'string') {
    return { ...rewrittenMacroArgsNode, token: rewriteBindingTemplate(rewrittenMacroArgsNode.token, renameMap) };
  }
  if (rewrittenMacroArgsNode.ref === 'tokenZone' && typeof rewrittenMacroArgsNode.token === 'string') {
    return { ...rewrittenMacroArgsNode, token: rewriteBindingTemplate(rewrittenMacroArgsNode.token, renameMap) };
  }
  if (rewrittenMacroArgsNode.ref === 'pvar' && isRecord(rewrittenMacroArgsNode.player) && typeof rewrittenMacroArgsNode.player.chosen === 'string') {
    return { ...rewrittenMacroArgsNode, player: { ...rewrittenMacroArgsNode.player, chosen: rewriteBindingTemplate(rewrittenMacroArgsNode.player.chosen, renameMap) } };
  }
  if (rewrittenMacroArgsNode.ref === 'zoneCount' && typeof rewrittenMacroArgsNode.zone === 'string') {
    return { ...rewrittenMacroArgsNode, zone: rewriteZoneSelectorBinding(rewrittenMacroArgsNode.zone, renameMap) };
  }
  if (rewrittenMacroArgsNode.ref === 'zoneProp' && typeof rewrittenMacroArgsNode.zone === 'string') {
    return { ...rewrittenMacroArgsNode, zone: rewriteZoneSelectorBinding(rewrittenMacroArgsNode.zone, renameMap) };
  }
  if (rewrittenMacroArgsNode.ref === 'markerState' && typeof rewrittenMacroArgsNode.space === 'string') {
    return { ...rewrittenMacroArgsNode, space: rewriteZoneSelectorBinding(rewrittenMacroArgsNode.space, renameMap) };
  }
  if (rewrittenMacroArgsNode.query === 'binding' && typeof rewrittenMacroArgsNode.name === 'string') {
    return { ...rewrittenMacroArgsNode, name: rewriteBindingName(rewrittenMacroArgsNode.name, renameMap) };
  }
  if (
    (rewrittenMacroArgsNode.query === 'tokensInZone' ||
      rewrittenMacroArgsNode.query === 'tokensInAdjacentZones' ||
      rewrittenMacroArgsNode.query === 'adjacentZones' ||
      rewrittenMacroArgsNode.query === 'connectedZones') &&
    typeof rewrittenMacroArgsNode.zone === 'string'
  ) {
    return { ...rewrittenMacroArgsNode, zone: rewriteZoneSelectorBinding(rewrittenMacroArgsNode.zone, renameMap) };
  }
  if (rewrittenMacroArgsNode.query === 'zones' || rewrittenMacroArgsNode.query === 'mapSpaces') {
    const filter = isRecord(rewrittenMacroArgsNode.filter) ? rewrittenMacroArgsNode.filter : null;
    const owner = filter !== null && isRecord(filter.owner) ? filter.owner : null;
    if (owner !== null && typeof owner.chosen === 'string') {
      return {
        ...rewrittenMacroArgsNode,
        filter: {
          ...filter,
          owner: {
            ...owner,
            chosen: rewriteBindingTemplate(owner.chosen, renameMap),
          },
        },
      };
    }
  }
  if (rewrittenMacroArgsNode.op === 'adjacent') {
    const left =
      typeof rewrittenMacroArgsNode.left === 'string'
        ? rewriteZoneSelectorBinding(rewrittenMacroArgsNode.left, renameMap)
        : rewrittenMacroArgsNode.left;
    const right =
      typeof rewrittenMacroArgsNode.right === 'string'
        ? rewriteZoneSelectorBinding(rewrittenMacroArgsNode.right, renameMap)
        : rewrittenMacroArgsNode.right;
    if (left !== rewrittenMacroArgsNode.left || right !== rewrittenMacroArgsNode.right) {
      return { ...rewrittenMacroArgsNode, left, right };
    }
  }
  if (rewrittenMacroArgsNode.op === 'connected') {
    const from =
      typeof rewrittenMacroArgsNode.from === 'string'
        ? rewriteZoneSelectorBinding(rewrittenMacroArgsNode.from, renameMap)
        : rewrittenMacroArgsNode.from;
    const to =
      typeof rewrittenMacroArgsNode.to === 'string'
        ? rewriteZoneSelectorBinding(rewrittenMacroArgsNode.to, renameMap)
        : rewrittenMacroArgsNode.to;
    if (from !== rewrittenMacroArgsNode.from || to !== rewrittenMacroArgsNode.to) {
      return { ...rewrittenMacroArgsNode, from, to };
    }
  }
  if (rewrittenMacroArgsNode.op === 'zonePropIncludes' && typeof rewrittenMacroArgsNode.zone === 'string') {
    return { ...rewrittenMacroArgsNode, zone: rewriteZoneSelectorBinding(rewrittenMacroArgsNode.zone, renameMap) };
  }

  const rewrittenFromRegistry = rewriteDeclaredBindersInEffectNode(
    rewrittenMacroArgsNode,
    (binding) => rewriteBindingTemplate(binding, renameMap),
  );
  const rewritten: Record<string, unknown> =
    rewrittenFromRegistry === rewrittenMacroArgsNode ? { ...rewrittenMacroArgsNode } : rewrittenFromRegistry;

  if (isRecord(rewritten.forEach)) {
    const forEachNode = rewritten.forEach;
    rewritten.forEach = {
      ...forEachNode,
      ...(forEachNode.over === undefined ? {} : { over: rewriteBindings(forEachNode.over, index, renameMap) }),
      ...(Array.isArray(forEachNode.effects) ? { effects: rewriteBindings(forEachNode.effects, index, renameMap) } : {}),
      ...(Array.isArray(forEachNode.in) ? { in: rewriteBindings(forEachNode.in, index, renameMap) } : {}),
      ...(forEachNode.limit === undefined ? {} : { limit: rewriteBindings(forEachNode.limit, index, renameMap) }),
    };
    return rewritten;
  }

  if (isRecord(rewritten.removeByPriority)) {
    const removeByPriorityNode = rewritten.removeByPriority;
    rewritten.removeByPriority = {
      ...removeByPriorityNode,
      ...(Array.isArray(removeByPriorityNode.groups)
        ? {
            groups: removeByPriorityNode.groups.map((group) =>
              !isRecord(group)
                ? group
                : {
                    ...group,
                    ...(group.over === undefined ? {} : { over: rewriteBindings(group.over, index, renameMap) }),
                    ...(group.to === undefined ? {} : { to: rewriteBindings(group.to, index, renameMap) }),
                    ...(group.from === undefined ? {} : { from: rewriteBindings(group.from, index, renameMap) }),
                  },
            ),
          }
        : {}),
      ...(Array.isArray(removeByPriorityNode.in) ? { in: rewriteBindings(removeByPriorityNode.in, index, renameMap) } : {}),
      ...(removeByPriorityNode.budget === undefined
        ? {}
        : { budget: rewriteBindings(removeByPriorityNode.budget, index, renameMap) }),
    };
    return rewritten;
  }

  if (isRecord(rewritten.let)) {
    const letNode = rewritten.let;
    rewritten.let = {
      ...letNode,
      ...(letNode.value === undefined ? {} : { value: rewriteBindings(letNode.value, index, renameMap) }),
      ...(Array.isArray(letNode.in) ? { in: rewriteBindings(letNode.in, index, renameMap) } : {}),
    };
    return rewritten;
  }

  if (isRecord(rewritten.chooseOne)) {
    const chooseOneNode = rewritten.chooseOne;
    rewritten.chooseOne = {
      ...chooseOneNode,
      ...(chooseOneNode.options === undefined ? {} : { options: rewriteBindings(chooseOneNode.options, index, renameMap) }),
    };
    return rewritten;
  }

  if (isRecord(rewritten.chooseN)) {
    const chooseNNode = rewritten.chooseN;
    rewritten.chooseN = {
      ...chooseNNode,
      ...(chooseNNode.options === undefined ? {} : { options: rewriteBindings(chooseNNode.options, index, renameMap) }),
      ...(chooseNNode.n === undefined ? {} : { n: rewriteBindings(chooseNNode.n, index, renameMap) }),
      ...(chooseNNode.min === undefined ? {} : { min: rewriteBindings(chooseNNode.min, index, renameMap) }),
      ...(chooseNNode.max === undefined ? {} : { max: rewriteBindings(chooseNNode.max, index, renameMap) }),
    };
    return rewritten;
  }

  if (isRecord(rewritten.rollRandom)) {
    const rollRandomNode = rewritten.rollRandom;
    rewritten.rollRandom = {
      ...rollRandomNode,
      ...(rollRandomNode.min === undefined ? {} : { min: rewriteBindings(rollRandomNode.min, index, renameMap) }),
      ...(rollRandomNode.max === undefined ? {} : { max: rewriteBindings(rollRandomNode.max, index, renameMap) }),
      ...(Array.isArray(rollRandomNode.in) ? { in: rewriteBindings(rollRandomNode.in, index, renameMap) } : {}),
    };
    return rewritten;
  }

  for (const [key, value] of Object.entries(rewritten)) {
    rewritten[key] = rewriteBindings(value, index, renameMap);
  }
  return rewritten;
}

function normalizeExportedBindings(
  macroDef: EffectMacroDef,
  declaredBindings: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): ReadonlySet<string> {
  if (macroDef.exports === undefined) {
    diagnostics.push({
      code: 'EFFECT_MACRO_EXPORTS_REQUIRED',
      path: `effectMacros.${macroDef.id}.exports`,
      severity: 'error',
      message: `Macro "${macroDef.id}" must declare exports explicitly.`,
      suggestion: 'Set exports to an explicit array (for example [] when no binders are public).',
    });
    return new Set<string>();
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
  const indexedMacro = index.byId.get(macroId);
  if (indexedMacro === undefined) {
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

  const { def, params } = indexedMacro;
  const missingParams = params.filter((p) => !(p.name in args));
  if (missingParams.length > 0) {
    diagnostics.push({
      code: 'EFFECT_MACRO_MISSING_ARGS',
      path,
      severity: 'error',
      message: `Macro "${macroId}" missing required args: ${missingParams.map((p) => p.name).join(', ')}.`,
    });
    return [];
  }

  const extraArgs = Object.keys(args).filter((k) => !params.some((p) => p.name === k));
  if (extraArgs.length > 0) {
    diagnostics.push({
      code: 'EFFECT_MACRO_EXTRA_ARGS',
      path,
      severity: 'error',
      message: `Macro "${macroId}" received unexpected args: ${extraArgs.join(', ')}.`,
    });
    return [];
  }

  const hasConstraintViolations = validateMacroArgConstraints(macroId, params, args, path, diagnostics);
  if (hasConstraintViolations) {
    return [];
  }

  const renameMap = new Map<string, string>();
  for (const bindingName of indexedMacro.declaredBindings) {
    if (indexedMacro.exportedBindings.has(bindingName)) {
      continue;
    }
    renameMap.set(bindingName, makeHygienicBindingName(macroId, path, bindingName));
  }

  const hygienicTemplates =
    renameMap.size === 0
      ? def.effects
      : def.effects.map((templateEffect) => rewriteBindings(templateEffect, index, renameMap) as GameSpecEffect);
  const hygienicSubstituted = hygienicTemplates.map((templateEffect) => substituteParams(templateEffect, args) as GameSpecEffect);

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
  const byId = new Map<string, IndexedMacroDef>();
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
    const declaredBindings = new Set<string>();
    for (let effectIndex = 0; effectIndex < macro.effects.length; effectIndex += 1) {
      collectDeclaredBinders(macro.effects[effectIndex], `effectMacros.${macro.id}.effects.${effectIndex}`, declaredBindings, diagnostics);
    }
    const exportedBindings = normalizeExportedBindings(macro, declaredBindings, diagnostics);

    byId.set(macro.id, {
      def: macro,
      params: normalizeMacroParams(macro, diagnostics),
      declaredBindings,
      exportedBindings,
    });
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
