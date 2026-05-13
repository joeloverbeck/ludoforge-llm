import {
  buildMoveRuntimeBindings,
  checkStackingConstraints,
  createEvalContext,
  createEvalRuntimeResources,
  createGameDefRuntime,
  evalQuery,
  resolvePipelineDecisionBindingsForMove,
} from '../kernel/index.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { resolveBindingTemplate } from '../kernel/binding-template.js';
import { applyZoneEntryResets } from '../kernel/effects-token.js';
import type { ActionPipelineDef, ConditionAST, EffectAST, GameDef, GameState, Move, MoveParamValue, OptionsQuery, Token } from '../kernel/index.js';

export type PolicyWasmPreviewScalarValue = string | number | boolean;
export type PolicyWasmPreviewScalarArrayValue = readonly PolicyWasmPreviewScalarValue[];
export type PolicyWasmPreviewValue = PolicyWasmPreviewScalarValue | PolicyWasmPreviewScalarArrayValue;
export type PolicyWasmPreviewZoneValues = ReadonlyMap<string, readonly Token[]>;
export type PolicyWasmPreviewZoneVarValues = ReadonlyMap<string, ReadonlyMap<string, number>>;

export const isPolicyWasmPreviewScalarValue = (value: unknown): value is PolicyWasmPreviewScalarValue =>
  typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string';

export const isPolicyWasmPreviewValue = (value: MoveParamValue | boolean | string): value is PolicyWasmPreviewValue =>
  isPolicyWasmPreviewScalarValue(value) || (Array.isArray(value) && value.every(isPolicyWasmPreviewScalarValue));

export const policyWasmPreviewValuesEqual = (
  left: PolicyWasmPreviewValue,
  right: PolicyWasmPreviewValue | undefined,
): boolean => {
  if (right === undefined) {
    return false;
  }
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return left === right;
  }
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

export const policyWasmPreviewBindingMapsEqual = (
  left: ReadonlyMap<string, PolicyWasmPreviewValue>,
  right: ReadonlyMap<string, PolicyWasmPreviewValue>,
): boolean => {
  if (left.size !== right.size) return false;
  for (const [name, leftValue] of left) {
    if (!policyWasmPreviewValuesEqual(leftValue, right.get(name))) return false;
  }
  return true;
};

export const buildPolicyWasmPreviewRootBindings = (
  candidates: readonly { readonly move: Move }[],
  pipeline: ActionPipelineDef | undefined,
): Map<string, PolicyWasmPreviewValue> | undefined => {
  let bindings: Map<string, PolicyWasmPreviewValue> | undefined;
  for (const candidate of candidates) {
    const candidateBindings = new Map<string, PolicyWasmPreviewValue>();
    const runtimeBindings = buildMoveRuntimeBindings(
      candidate.move,
      resolvePipelineDecisionBindingsForMove(pipeline, candidate.move.params),
    );
    for (const [name, value] of Object.entries(runtimeBindings)) {
      if (!isPolicyWasmPreviewValue(value)) {
        return undefined;
      }
      candidateBindings.set(name, value);
    }
    if (bindings === undefined) {
      bindings = candidateBindings;
      continue;
    }
    if (!policyWasmPreviewBindingMapsEqual(bindings, candidateBindings)) {
      return undefined;
    }
  }
  return bindings ?? new Map();
};

export const asPolicyWasmPreviewI32Literal = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= -0x8000_0000 && value <= 0x7fff_ffff
    ? value
    : undefined;

export const policyWasmPreviewEffectKind = (effect: EffectAST): string =>
  Object.keys(effect).find((key) => key !== '_k') ?? 'unknown';

export const findPolicyWasmPreviewActionPipeline = (
  def: GameDef,
  actionId: string,
): NonNullable<GameDef['actionPipelines']>[number] | undefined =>
  def.actionPipelines?.find((pipeline) => String(pipeline.actionId) === actionId);

export const findPolicyWasmPreviewAction = (
  def: GameDef,
  actionId: string,
): GameDef['actions'][number] | undefined =>
  def.actions.find((action) => String(action.id) === actionId);

export const parsePolicyWasmPreviewGlobalSlot = (slot: string): string | null =>
  slot.startsWith('global.') && slot.length > 'global.'.length ? slot.slice('global.'.length) : null;

export const readPolicyWasmPreviewRootSlot = (state: GameState, slot: string): number => {
  const globalVar = parsePolicyWasmPreviewGlobalSlot(slot);
  const value = globalVar === null ? undefined : state.globalVars[globalVar];
  return typeof value === 'number' ? value : typeof value === 'boolean' ? (value ? 1 : 0) : 0;
};

export const resolvePolicyWasmPreviewBindingName = (
  name: string,
  bindings: ReadonlyMap<string, PolicyWasmPreviewValue>,
): string => resolveBindingTemplate(name, Object.fromEntries(bindings));

export const materializePolicyWasmPreviewQueryValues = (
  query: OptionsQuery,
  input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly runtime?: GameDefRuntime;
  },
  bindings: ReadonlyMap<string, PolicyWasmPreviewValue>,
): PolicyWasmPreviewScalarArrayValue | undefined => {
  try {
    const runtime = input.runtime ?? createGameDefRuntime(input.def);
    const values = evalQuery(query, createEvalContext({
      def: input.def,
      adjacencyGraph: runtime.adjacencyGraph,
      state: input.state,
      activePlayer: input.state.activePlayer,
      actorPlayer: input.state.activePlayer,
      bindings: Object.fromEntries(bindings),
      resources: createEvalRuntimeResources({
        tokenStateIndexCache: runtime.tokenStateIndexCache,
      }),
      runtimeTableIndex: runtime.runtimeTableIndex,
      freeOperationOverlay: undefined,
      maxQueryResults: undefined,
    }));
    const materialized = values.map(materializePolicyWasmPreviewQueryValue);
    return materialized.every(isPolicyWasmPreviewScalarValue) ? materialized : undefined;
  } catch {
    return undefined;
  }
};

export const buildPolicyWasmPreviewZoneValues = (state: GameState): Map<string, readonly Token[]> =>
  new Map(Object.entries(state.zones));

export const buildPolicyWasmPreviewZoneVarValues = (state: GameState): Map<string, ReadonlyMap<string, number>> =>
  new Map(Object.entries(state.zoneVars).map(([zoneId, vars]) => [zoneId, new Map(Object.entries(vars))]));

export const materializePolicyWasmPreviewState = (
  state: GameState,
  zones: PolicyWasmPreviewZoneValues,
  zoneVars: PolicyWasmPreviewZoneVarValues,
  markerValues?: ReadonlyMap<string, string>,
  globalVars?: GameState['globalVars'],
): GameState => ({
  ...state,
  ...(globalVars === undefined ? {} : { globalVars }),
  zones: Object.fromEntries(zones),
  zoneVars: Object.fromEntries([...zoneVars].map(([zoneId, vars]) => [zoneId, Object.fromEntries(vars)])),
  ...(markerValues === undefined ? {} : { markers: materializePolicyWasmPreviewMarkers(markerValues) }),
});

export const readPolicyWasmPreviewZoneVar = (
  zoneVars: PolicyWasmPreviewZoneVarValues,
  zoneId: string,
  varName: string,
): number | undefined => zoneVars.get(zoneId)?.get(varName);

export const setPolicyWasmPreviewZoneVar = (
  def: GameDef,
  zoneVars: PolicyWasmPreviewZoneVarValues,
  zoneId: string,
  varName: string,
  value: number,
): Map<string, ReadonlyMap<string, number>> | undefined => {
  const variableDef = def.zoneVars?.find((candidate) => candidate.name === varName);
  if (variableDef === undefined || !Number.isSafeInteger(value) || !zoneVars.has(zoneId)) return undefined;
  const clamped = Math.max(variableDef.min, Math.min(variableDef.max, value));
  const nextZone = new Map(zoneVars.get(zoneId)!);
  nextZone.set(varName, clamped);
  const next = new Map(zoneVars);
  next.set(zoneId, nextZone);
  return next;
};

export const findPolicyWasmPreviewTokenZone = (
  zones: PolicyWasmPreviewZoneValues,
  tokenId: string,
): string | undefined => {
  const matches = [...zones].filter(([, tokens]) => tokens.some((token) => String(token.id) === tokenId));
  return matches.length === 1 ? matches[0]![0] : undefined;
};

export const movePolicyWasmPreviewToken = (
  def: GameDef,
  zones: PolicyWasmPreviewZoneValues,
  tokenId: string,
  fromZoneId: string,
  toZoneId: string,
  position: 'top' | 'bottom' | 'random' | undefined,
): Map<string, readonly Token[]> | undefined => {
  if (position === 'random') {
    return undefined;
  }
  const sourceTokens = zones.get(fromZoneId);
  const destinationTokens = zones.get(toZoneId);
  if (sourceTokens === undefined || destinationTokens === undefined) {
    return undefined;
  }
  const occurrences = [...zones].flatMap(([zoneId, tokens]) =>
    tokens.flatMap((token, index) => String(token.id) === tokenId ? [{ zoneId, index, token }] : []));
  if (occurrences.length !== 1 || occurrences[0]!.zoneId !== fromZoneId) {
    return undefined;
  }
  const occurrence = occurrences[0]!;
  const sourceAfter = [...sourceTokens.slice(0, occurrence.index), ...sourceTokens.slice(occurrence.index + 1)];
  const destinationBase = fromZoneId === toZoneId ? sourceAfter : destinationTokens;
  const tokenTypeDef = def.tokenTypes.find((tokenType) => tokenType.id === occurrence.token.type);
  const destinationZoneDef = def.zones.find((zone) => zone.id === toZoneId);
  const movedToken = applyZoneEntryResets(occurrence.token, tokenTypeDef, destinationZoneDef);
  const insertionIndex = position === 'bottom' ? destinationBase.length : 0;
  const destinationAfter = [
    ...destinationBase.slice(0, insertionIndex),
    movedToken,
    ...destinationBase.slice(insertionIndex),
  ];
  const tokenTypeSeatById = new Map(def.tokenTypes.flatMap((tokenType) =>
    typeof tokenType.seat === 'string' ? [[tokenType.id, tokenType.seat] as const] : []));
  if (checkStackingConstraints(def.stackingConstraints ?? [], def.zones, toZoneId, destinationAfter, tokenTypeSeatById).length > 0) {
    return undefined;
  }
  const next = new Map(zones);
  next.set(fromZoneId, fromZoneId === toZoneId ? destinationAfter : sourceAfter);
  next.set(toZoneId, destinationAfter);
  return next;
};

export const moveAllPolicyWasmPreviewTokens = (
  def: GameDef,
  zones: PolicyWasmPreviewZoneValues,
  fromZoneId: string,
  toZoneId: string,
  shouldMove?: (token: Token) => boolean | undefined,
): Map<string, readonly Token[]> | undefined => {
  const sourceTokens = zones.get(fromZoneId);
  const destinationTokens = zones.get(toZoneId);
  if (sourceTokens === undefined || destinationTokens === undefined) return undefined;
  if (fromZoneId === toZoneId || sourceTokens.length === 0) return new Map(zones);
  const movedSourceTokens: Token[] = [];
  const sourceAfter: Token[] = [];
  for (const token of sourceTokens) {
    const matches = shouldMove === undefined ? true : shouldMove(token);
    if (matches === undefined) return undefined;
    (matches ? movedSourceTokens : sourceAfter).push(token);
  }
  if (movedSourceTokens.length === 0) return new Map(zones);
  const destinationZoneDef = def.zones.find((zone) => zone.id === toZoneId);
  const movedTokens = movedSourceTokens.map((token) => applyZoneEntryResets(
    token,
    def.tokenTypes.find((tokenType) => tokenType.id === token.type),
    destinationZoneDef,
  ));
  const destinationAfter = [...movedTokens, ...destinationTokens];
  const tokenTypeSeatById = new Map(def.tokenTypes.flatMap((tokenType) =>
    typeof tokenType.seat === 'string' ? [[tokenType.id, tokenType.seat] as const] : []));
  if (checkStackingConstraints(def.stackingConstraints ?? [], def.zones, toZoneId, destinationAfter, tokenTypeSeatById).length > 0) {
    return undefined;
  }
  const next = new Map(zones);
  next.set(fromZoneId, sourceAfter);
  next.set(toZoneId, destinationAfter);
  return next;
};

export const setPolicyWasmPreviewTokenProp = (
  def: GameDef,
  zones: PolicyWasmPreviewZoneValues,
  tokenId: string,
  prop: string,
  value: PolicyWasmPreviewScalarValue,
): Map<string, readonly Token[]> | undefined => {
  const occurrences = [...zones].flatMap(([zoneId, tokens]) =>
    tokens.flatMap((token, index) => String(token.id) === tokenId ? [{ zoneId, index, token }] : []));
  if (occurrences.length !== 1) return undefined;
  const occurrence = occurrences[0]!;
  const tokenTypeDef = def.tokenTypes.find((tokenType) => tokenType.id === occurrence.token.type);
  if (tokenTypeDef === undefined || !(prop in tokenTypeDef.props)) return undefined;
  const nextToken = { ...occurrence.token, props: { ...occurrence.token.props, [prop]: value } };
  const nextZone = [...(zones.get(occurrence.zoneId) ?? [])];
  nextZone[occurrence.index] = nextToken;
  const next = new Map(zones);
  next.set(occurrence.zoneId, nextZone);
  return next;
};

export const resolvePolicyWasmPreviewTokenProp = (
  zones: PolicyWasmPreviewZoneValues,
  tokenId: string,
  prop: string,
): PolicyWasmPreviewScalarValue | undefined => {
  const matches = [...zones].flatMap(([, tokens]) =>
    tokens.filter((token) => String(token.id) === tokenId));
  if (matches.length !== 1) return undefined;
  const value = prop === 'id' ? matches[0]!.id : prop === 'type' ? matches[0]!.type : matches[0]!.props[prop];
  return isPolicyWasmPreviewScalarValue(value) ? value : undefined;
};

const materializePolicyWasmPreviewQueryValue = (value: unknown): PolicyWasmPreviewScalarValue | undefined => {
  if (isPolicyWasmPreviewScalarValue(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null && typeof (value as { readonly id?: unknown }).id === 'string') {
    return (value as { readonly id: string }).id;
  }
  return undefined;
};

export const buildPolicyWasmPreviewMarkerValues = (state: GameState): Map<string, string> => {
  const values = new Map<string, string>();
  for (const [spaceId, markers] of Object.entries(state.markers)) {
    for (const [marker, markerState] of Object.entries(markers)) {
      values.set(policyWasmPreviewMarkerKey(spaceId, marker), markerState);
    }
  }
  return values;
};

export const policyWasmPreviewMarkerKey = (spaceId: string, marker: string): string => `${spaceId}\u0000${marker}`;

const parsePolicyWasmPreviewMarkerKey = (key: string): { readonly spaceId: string; readonly marker: string } | undefined => {
  const separator = key.indexOf('\u0000');
  return separator < 0
    ? undefined
    : { spaceId: key.slice(0, separator), marker: key.slice(separator + 1) };
};

export const materializePolicyWasmPreviewMarkers = (
  markerValues: ReadonlyMap<string, string>,
): GameState['markers'] => {
  const markers: Record<string, Record<string, string>> = {};
  for (const [key, markerState] of markerValues) {
    const parsed = parsePolicyWasmPreviewMarkerKey(key);
    if (parsed === undefined || parsed.spaceId === '__global__') {
      continue;
    }
    markers[parsed.spaceId] = {
      ...(markers[parsed.spaceId] ?? {}),
      [parsed.marker]: markerState,
    };
  }
  return markers;
};

const findMarkerLattice = (
  def: GameDef,
  marker: string,
): NonNullable<GameDef['markerLattices']>[number] | undefined =>
  def.markerLattices?.find((lattice) => lattice.id === marker);

export const findPolicyWasmPreviewMarkerDefault = (def: GameDef, marker: string): string | undefined =>
  findMarkerLattice(def, marker)?.defaultState;

export const policyWasmPreviewMarkerStateAllowed = (def: GameDef, marker: string, markerState: string): boolean => {
  const lattice = findMarkerLattice(def, marker);
  return lattice !== undefined && lattice.states.includes(markerState);
};

export const resolvePolicyWasmPreviewMarkerShift = (
  def: GameDef,
  markerValues: ReadonlyMap<string, string>,
  spaceId: string,
  marker: string,
  delta: number,
  stateAllowed: (candidateState: string) => boolean,
): string | undefined => {
  const lattice = findMarkerLattice(def, marker);
  if (lattice === undefined) {
    return undefined;
  }
  const currentState = markerValues.get(policyWasmPreviewMarkerKey(spaceId, marker)) ?? lattice.defaultState;
  const currentIndex = lattice.states.indexOf(currentState);
  if (currentIndex < 0) {
    return undefined;
  }
  const destinationIndex = Math.max(0, Math.min(lattice.states.length - 1, currentIndex + delta));
  const destinationState = lattice.states[destinationIndex]!;
  return destinationState === currentState || stateAllowed(destinationState) ? destinationState : currentState;
};

export const resolvePolicyWasmPreviewZoneProp = (
  def: GameDef,
  zoneId: string,
  prop: string,
): PolicyWasmPreviewScalarValue | undefined => {
  const zone = def.zones.find((candidate) => candidate.id === zoneId);
  const value = prop === 'id' ? zone?.id : prop === 'category' ? zone?.category : zone?.attributes?.[prop];
  return isPolicyWasmPreviewScalarValue(value) ? value : undefined;
};

export const policyWasmPreviewZonePropIncludes = (
  def: GameDef,
  zoneId: string,
  prop: string,
  value: PolicyWasmPreviewScalarValue,
): boolean | undefined => {
  const propValue = def.zones.find((candidate) => candidate.id === zoneId)?.attributes?.[prop];
  return Array.isArray(propValue) && propValue.every(isPolicyWasmPreviewScalarValue) ? propValue.includes(value) : undefined;
};

export const policyWasmPreviewMarkerStateAllowedForConstraints = (
  def: GameDef,
  marker: string,
  candidateState: string,
  evaluateCondition: (condition: ConditionAST) => boolean | undefined,
): boolean => {
  const lattice = findMarkerLattice(def, marker);
  if (lattice === undefined || !lattice.states.includes(candidateState)) return false;
  for (const constraint of lattice.constraints ?? []) {
    const applies = evaluateCondition(constraint.when);
    if (applies === undefined || (applies && !constraint.allowedStates.includes(candidateState))) return false;
  }
  return true;
};
