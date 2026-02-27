import type { EffectMacroOrigin } from '../kernel/types-ast.js';

export type MacroBindingOrigin = EffectMacroOrigin;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasSameMacroBindingOrigin(existing: unknown, origin: MacroBindingOrigin): boolean {
  return isRecord(existing) && existing.macroId === origin.macroId && existing.stem === origin.stem;
}

export function findFirstMacroOriginByBindFields(
  effectNode: Record<string, unknown>,
  bindFields: readonly string[],
  originByBinding: ReadonlyMap<string, MacroBindingOrigin>,
): MacroBindingOrigin | undefined {
  for (const bindField of bindFields) {
    const bindValue = effectNode[bindField];
    if (typeof bindValue !== 'string') {
      continue;
    }
    const origin = originByBinding.get(bindValue);
    if (origin !== undefined) {
      return origin;
    }
  }
  return undefined;
}

function collectUniformGroupOrigin(
  groups: readonly unknown[],
  originByBinding: ReadonlyMap<string, MacroBindingOrigin>,
): MacroBindingOrigin | undefined {
  let uniformOrigin: MacroBindingOrigin | undefined;
  let hasAnyGroup = false;
  for (const group of groups) {
    if (!isRecord(group)) {
      return undefined;
    }
    hasAnyGroup = true;
    const groupOrigin = findFirstMacroOriginByBindFields(group, ['bind'], originByBinding);
    if (groupOrigin === undefined) {
      return undefined;
    }
    if (uniformOrigin === undefined) {
      uniformOrigin = groupOrigin;
      continue;
    }
    if (!hasSameMacroBindingOrigin(uniformOrigin, groupOrigin)) {
      return undefined;
    }
  }
  return hasAnyGroup ? uniformOrigin : undefined;
}

export function resolveRemoveByPriorityParentMacroOrigin(
  removeByPriorityNode: Record<string, unknown>,
  originByBinding: ReadonlyMap<string, MacroBindingOrigin>,
): MacroBindingOrigin | undefined {
  if (typeof removeByPriorityNode.remainingBind === 'string') {
    const remainingOrigin = originByBinding.get(removeByPriorityNode.remainingBind);
    if (remainingOrigin !== undefined) {
      return remainingOrigin;
    }
  }

  if (!Array.isArray(removeByPriorityNode.groups)) {
    return undefined;
  }
  return collectUniformGroupOrigin(removeByPriorityNode.groups, originByBinding);
}
