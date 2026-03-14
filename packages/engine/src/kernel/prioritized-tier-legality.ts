import type { MoveParamScalar } from './types.js';

type QualifierScalar = string | number | boolean;

export interface PrioritizedTierEntry {
  readonly value: MoveParamScalar;
  readonly qualifier?: QualifierScalar;
}

export interface PrioritizedTierAdmissibility {
  readonly admissibleValues: readonly MoveParamScalar[];
  readonly activeTierIndices: readonly number[];
}

const scalarKey = (value: MoveParamScalar): string => JSON.stringify([typeof value, value]);

const qualifierKey = (value: QualifierScalar | undefined): string => JSON.stringify([typeof value, value ?? null]);

export function computeTierAdmissibility(
  tiers: readonly (readonly PrioritizedTierEntry[])[],
  alreadySelected: readonly MoveParamScalar[],
  qualifierMode: 'none' | 'byQualifier',
): PrioritizedTierAdmissibility {
  const selectedKeys = new Set(alreadySelected.map((value) => scalarKey(value)));

  if (qualifierMode === 'none') {
    for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
      const tier = tiers[tierIndex] ?? [];
      const remainingValues = tier
        .filter((entry) => !selectedKeys.has(scalarKey(entry.value)))
        .map((entry) => entry.value);

      if (remainingValues.length > 0) {
        return {
          admissibleValues: remainingValues,
          activeTierIndices: [tierIndex],
        };
      }
    }

    return {
      admissibleValues: [],
      activeTierIndices: [],
    };
  }

  const activeQualifierKeys = new Set<string>();
  const admissibleValues: MoveParamScalar[] = [];
  const activeTierIndices: number[] = [];

  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
    const tier = tiers[tierIndex] ?? [];
    const remainingGroups = new Map<string, MoveParamScalar[]>();
    const groupOrder: string[] = [];

    for (const entry of tier) {
      if (selectedKeys.has(scalarKey(entry.value))) {
        continue;
      }

      const groupKey = qualifierKey(entry.qualifier);
      const existingGroup = remainingGroups.get(groupKey);
      if (existingGroup === undefined) {
        remainingGroups.set(groupKey, [entry.value]);
        groupOrder.push(groupKey);
      } else {
        existingGroup.push(entry.value);
      }
    }

    let tierIsActive = false;
    for (const groupKey of groupOrder) {
      if (activeQualifierKeys.has(groupKey)) {
        continue;
      }

      activeQualifierKeys.add(groupKey);
      admissibleValues.push(...(remainingGroups.get(groupKey) ?? []));
      tierIsActive = true;
    }

    if (tierIsActive) {
      activeTierIndices.push(tierIndex);
    }
  }

  return {
    admissibleValues,
    activeTierIndices,
  };
}
