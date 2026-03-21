import type { ActionGroupPolicy } from '../config/visual-config-types.js';
import type { RenderAction } from '../model/render-model.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';

export interface TooltipCompanionGroup {
  readonly actionClass: string;
  readonly groupName: string;
  readonly actions: readonly RenderAction[];
}

export function resolveTooltipCompanionGroups(
  groupKey: string,
  policy: ActionGroupPolicy | null,
  hiddenActionsByClass: ReadonlyMap<string, readonly RenderAction[]>,
): readonly TooltipCompanionGroup[] {
  const appendTooltipFrom = policy?.synthesize?.find((rule) => rule.intoGroup === groupKey)?.appendTooltipFrom;
  if (appendTooltipFrom === undefined || appendTooltipFrom.length === 0) {
    return [];
  }

  const seenClasses = new Set<string>();
  const companionGroups: TooltipCompanionGroup[] = [];
  for (const actionClass of appendTooltipFrom) {
    if (seenClasses.has(actionClass)) {
      continue;
    }
    seenClasses.add(actionClass);
    const actions = hiddenActionsByClass.get(actionClass);
    if (actions === undefined || actions.length === 0) {
      continue;
    }
    companionGroups.push({
      actionClass,
      groupName: formatIdAsDisplayName(actionClass),
      actions,
    });
  }

  return companionGroups;
}
