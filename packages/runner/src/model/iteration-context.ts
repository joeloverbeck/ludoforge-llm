import { parseDecisionKey, type MoveParamValue } from '@ludoforge/engine/runtime';
import type { PartialChoice } from '../store/store-types.js';
import type { RenderZone } from './render-model.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';

export interface IterationContext {
  readonly iterationIndex: number;
  readonly iterationTotal: number;
  readonly currentEntityId: string;
  readonly currentEntityDisplayName: string;
}

// For nested forEach, iterationPath is multi-segment (e.g. "[0][1]").
// We capture only the trailing segment — the innermost loop index —
// which matches findIterationArray's behavior of returning the most
// recent (innermost) array in the choice stack.
const ITERATION_INDEX_PATTERN = /\[(\d+)\]$/;

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

export function parseIterationContext(
  decisionKey: string,
  choiceStack: readonly PartialChoice[],
  zonesById: ReadonlyMap<string, RenderZone>,
): IterationContext | null {
  const parsedDecisionKey = parseDecisionKey(decisionKey as Parameters<typeof parseDecisionKey>[0]);
  if (parsedDecisionKey === null) {
    return null;
  }
  const hasTemplateResolution = parsedDecisionKey.baseId !== parsedDecisionKey.resolvedBind;
  const indexMatch = hasTemplateResolution ? null : ITERATION_INDEX_PATTERN.exec(parsedDecisionKey.iterationPath);

  if (!hasTemplateResolution && indexMatch === null) {
    return null;
  }

  const iterationArray = findIterationArray(choiceStack);
  if (iterationArray === null) {
    return null;
  }

  let iterationIndex: number;
  let currentEntityId: string;

  if (hasTemplateResolution) {
    const idx = iterationArray.indexOf(parsedDecisionKey.resolvedBind);
    if (idx < 0) {
      return null;
    }
    iterationIndex = idx;
    currentEntityId = parsedDecisionKey.resolvedBind;
  } else {
    iterationIndex = Number(indexMatch![1]);
    if (iterationIndex >= iterationArray.length) {
      return null;
    }
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
