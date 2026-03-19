import { parseDecisionKey, type DecisionKey, type MoveParamValue } from '@ludoforge/engine/runtime';
import type { PartialChoice } from '../store/store-types.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';

export interface IterationContext {
  readonly iterationIndex: number;
  readonly iterationTotal: number;
  readonly currentEntityId: string;
  readonly currentEntityDisplayName: string;
}

function findIterationArray(
  choiceStack: readonly PartialChoice[],
): readonly MoveParamValue[] | null {
  for (let i = choiceStack.length - 1; i >= 0; i--) {
    const entry = choiceStack[i];
    if (entry !== undefined && Array.isArray(entry.value)) {
      return entry.value as readonly MoveParamValue[];
    }
  }
  return null;
}

function getInnermostIterationIndex(iterationPath: string): number | null {
  if (iterationPath.length < 3 || !iterationPath.endsWith(']')) {
    return null;
  }

  const openBracketIndex = iterationPath.lastIndexOf('[');
  if (openBracketIndex < 0) {
    return null;
  }

  const indexText = iterationPath.slice(openBracketIndex + 1, -1);
  if (indexText.length === 0) {
    return null;
  }

  for (const char of indexText) {
    if (char < '0' || char > '9') {
      return null;
    }
  }

  const index = Number(indexText);
  if (!Number.isSafeInteger(index)) {
    return null;
  }

  return index;
}

export function parseIterationContext(
  decisionKey: DecisionKey,
  choiceStack: readonly PartialChoice[],
  zonesById: ReadonlyMap<string, { readonly id: string; readonly displayName?: string }>,
): IterationContext | null {
  const parsedDecisionKey = parseDecisionKey(decisionKey);
  if (parsedDecisionKey === null) {
    return null;
  }
  const hasTemplateResolution = parsedDecisionKey.baseId !== parsedDecisionKey.resolvedBind;
  const iterationIndexFromPath = getInnermostIterationIndex(parsedDecisionKey.iterationPath);

  // Iteration UI context is only canonical when the key carries an iteration path.
  // Without it, the runner should not infer loop semantics from prior choices.
  if (iterationIndexFromPath === null) {
    return null;
  }

  const iterationArray = findIterationArray(choiceStack);
  if (iterationArray === null) {
    return null;
  }

  let iterationIndex: number;
  let currentEntityId: string;

  iterationIndex = iterationIndexFromPath;
  if (iterationIndex >= iterationArray.length) {
    return null;
  }

  if (hasTemplateResolution) {
    const iteratedEntityId = String(iterationArray[iterationIndex]);
    if (iteratedEntityId !== parsedDecisionKey.resolvedBind) {
      return null;
    }
    currentEntityId = parsedDecisionKey.resolvedBind;
  } else {
    currentEntityId = String(iterationArray[iterationIndex]);
  }

  const zone = zonesById.get(currentEntityId);
  const currentEntityDisplayName = zone?.displayName ?? formatIdAsDisplayName(currentEntityId);

  return {
    iterationIndex,
    iterationTotal: iterationArray.length,
    currentEntityId,
    currentEntityDisplayName,
  };
}
