import type { GameState, StateDelta } from '../kernel/types.js';

const sortedUnionKeys = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): readonly string[] => {
  const keySet = new Set<string>();
  for (const key of Object.keys(left)) {
    keySet.add(key);
  }
  for (const key of Object.keys(right)) {
    keySet.add(key);
  }
  return Array.from(keySet).sort((a, b) => a.localeCompare(b));
};

const arraysEqual = (left: readonly unknown[], right: readonly unknown[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) {
      return false;
    }
  }
  return true;
};

const zoneTokenIds = (state: GameState, zoneId: string): readonly string[] =>
  (state.zones[zoneId] ?? []).map((token) => token.id);

export const computeDeltas = (preState: GameState, postState: GameState): readonly StateDelta[] => {
  const deltas: StateDelta[] = [];

  for (const name of sortedUnionKeys(preState.globalVars, postState.globalVars)) {
    const before = preState.globalVars[name];
    const after = postState.globalVars[name];
    if (!Object.is(before, after)) {
      deltas.push({ path: `globalVars.${name}`, before, after });
    }
  }

  const perPlayerIds = sortedUnionKeys(preState.perPlayerVars, postState.perPlayerVars);
  for (const playerId of perPlayerIds) {
    const preVars = preState.perPlayerVars[Number(playerId)] ?? {};
    const postVars = postState.perPlayerVars[Number(playerId)] ?? {};
    for (const name of sortedUnionKeys(preVars, postVars)) {
      const before = preVars[name];
      const after = postVars[name];
      if (!Object.is(before, after)) {
        deltas.push({ path: `perPlayerVars.${playerId}.${name}`, before, after });
      }
    }
  }

  for (const zoneId of sortedUnionKeys(preState.zones, postState.zones)) {
    const before = zoneTokenIds(preState, zoneId);
    const after = zoneTokenIds(postState, zoneId);
    if (!arraysEqual(before, after)) {
      deltas.push({ path: `zones.${zoneId}`, before, after });
    }
  }

  if (!Object.is(preState.currentPhase, postState.currentPhase)) {
    deltas.push({
      path: 'currentPhase',
      before: preState.currentPhase,
      after: postState.currentPhase,
    });
  }

  if (!Object.is(preState.activePlayer, postState.activePlayer)) {
    deltas.push({
      path: 'activePlayer',
      before: preState.activePlayer,
      after: postState.activePlayer,
    });
  }

  if (!Object.is(preState.turnCount, postState.turnCount)) {
    deltas.push({
      path: 'turnCount',
      before: preState.turnCount,
      after: postState.turnCount,
    });
  }

  deltas.sort((left, right) => left.path.localeCompare(right.path));
  return deltas;
};
