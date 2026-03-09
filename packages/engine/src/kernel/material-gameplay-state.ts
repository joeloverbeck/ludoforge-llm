import type { GameDef, GameState } from './types.js';

const materialVarNames = (
  variables: readonly { readonly name: string; readonly material?: boolean }[],
): ReadonlySet<string> =>
  new Set(
    variables
      .filter((variable) => variable.material !== false)
      .map((variable) => variable.name),
  );

const filterVarBranch = <T extends number | boolean>(
  values: Readonly<Record<string, T>>,
  allowedNames: ReadonlySet<string>,
): Readonly<Record<string, T>> =>
  Object.fromEntries(
    Object.entries(values).filter(([name]) => allowedNames.has(name)),
  );

const materialGlobalVars = (def: GameDef, state: GameState): GameState['globalVars'] =>
  filterVarBranch(state.globalVars, materialVarNames(def.globalVars));

const materialPerPlayerVars = (def: GameDef, state: GameState): GameState['perPlayerVars'] => {
  const allowedNames = materialVarNames(def.perPlayerVars);
  return Object.fromEntries(
    Object.entries(state.perPlayerVars).map(([playerId, values]) => [playerId, filterVarBranch(values, allowedNames)]),
  );
};

const materialZoneVars = (def: GameDef, state: GameState): GameState['zoneVars'] => {
  const allowedNames = materialVarNames(def.zoneVars ?? []);
  return Object.fromEntries(
    Object.entries(state.zoneVars).map(([zoneId, values]) => [zoneId, filterVarBranch(values, allowedNames)]),
  );
};

export const materialGameplayStateProjection = (def: GameDef, state: GameState) => ({
  globalVars: materialGlobalVars(def, state),
  perPlayerVars: materialPerPlayerVars(def, state),
  zoneVars: materialZoneVars(def, state),
  zones: state.zones,
  nextTokenOrdinal: state.nextTokenOrdinal,
  markers: state.markers,
  ...(state.reveals === undefined ? {} : { reveals: state.reveals }),
  ...(state.globalMarkers === undefined ? {} : { globalMarkers: state.globalMarkers }),
  ...(state.activeLastingEffects === undefined ? {} : { activeLastingEffects: state.activeLastingEffects }),
  ...(state.interruptPhaseStack === undefined ? {} : { interruptPhaseStack: state.interruptPhaseStack }),
});
