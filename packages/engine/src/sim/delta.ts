import type { GameState, MoveLog, StateDelta, VariableValue } from '../kernel/types.js';

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

type PerPlayerVars = Readonly<Record<number, Readonly<Record<string, VariableValue>>>>;

const PER_PLAYER_VAR_PATH = /^perPlayerVars\.(\d+)\.(.+)$/;

export const parsePerPlayerVarPath = (path: string): { playerId: number; varName: string } | null => {
  const match = PER_PLAYER_VAR_PATH.exec(path);
  if (match === null) {
    return null;
  }
  const playerIdText = match[1];
  const varName = match[2];
  if (playerIdText === undefined || varName === undefined) {
    return null;
  }

  return {
    playerId: Number(playerIdText),
    varName,
  };
};

const clonePerPlayerVars = (perPlayerVars: PerPlayerVars): Record<number, Record<string, VariableValue>> => {
  const clone: Record<number, Record<string, VariableValue>> = {};
  for (const [playerId, vars] of Object.entries(perPlayerVars)) {
    clone[Number(playerId)] = { ...vars };
  }
  return clone;
};

const applyPerPlayerVarValue = (
  perPlayerVars: Record<number, Record<string, VariableValue>>,
  playerId: number,
  varName: string,
  value: unknown,
): void => {
  const currentVars = perPlayerVars[playerId];
  if (value === undefined) {
    if (currentVars === undefined) {
      return;
    }
    const remainingVars = { ...currentVars };
    delete remainingVars[varName];
    perPlayerVars[playerId] = remainingVars;
    return;
  }

  perPlayerVars[playerId] = {
    ...(currentVars ?? {}),
    [varName]: value as VariableValue,
  };
};

const applyPerPlayerVarDeltas = (
  perPlayerVars: Record<number, Record<string, VariableValue>>,
  deltas: readonly StateDelta[],
  direction: 'before' | 'after',
): void => {
  for (const delta of deltas) {
    const parsedPath = parsePerPlayerVarPath(delta.path);
    if (parsedPath === null) {
      continue;
    }
    applyPerPlayerVarValue(perPlayerVars, parsedPath.playerId, parsedPath.varName, delta[direction]);
  }
};

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

  for (const zoneId of sortedUnionKeys(preState.zoneVars, postState.zoneVars)) {
    const preVars = preState.zoneVars[zoneId] ?? {};
    const postVars = postState.zoneVars[zoneId] ?? {};
    for (const name of sortedUnionKeys(preVars, postVars)) {
      const before = preVars[name];
      const after = postVars[name];
      if (!Object.is(before, after)) {
        deltas.push({ path: `zoneVars.${zoneId}.${name}`, before, after });
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

export const reconstructPerPlayerVarTrajectory = (
  finalPerPlayerVars: PerPlayerVars,
  moves: readonly MoveLog[],
): readonly PerPlayerVars[] => {
  const initialPerPlayerVars = clonePerPlayerVars(finalPerPlayerVars);
  for (let moveIndex = moves.length - 1; moveIndex >= 0; moveIndex -= 1) {
    const move = moves[moveIndex];
    if (move === undefined) {
      continue;
    }
    applyPerPlayerVarDeltas(initialPerPlayerVars, move.deltas, 'before');
  }

  const trajectory: PerPlayerVars[] = [clonePerPlayerVars(initialPerPlayerVars)];
  const workingPerPlayerVars = clonePerPlayerVars(initialPerPlayerVars);

  for (const move of moves) {
    applyPerPlayerVarDeltas(workingPerPlayerVars, move.deltas, 'after');
    trajectory.push(clonePerPlayerVars(workingPerPlayerVars));
  }

  return trajectory;
};
