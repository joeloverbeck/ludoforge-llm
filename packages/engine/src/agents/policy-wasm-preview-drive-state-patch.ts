import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';
import type { GameDef, GameState, VariableValue } from '../kernel/index.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { computeFullHash, createZobristTable } from '../kernel/zobrist.js';
import {
  buildPolicyWasmPreviewZoneValues,
  movePolicyWasmPreviewToken,
  policyWasmPreviewMarkerKey,
  setPolicyWasmPreviewTokenProp,
} from './policy-wasm-production-preview-values.js';
import type {
  PolicyWasmPreviewStatePatch,
  PolicyWasmPreviewStatePatchScalar,
} from './policy-wasm-preview-drive.js';

const materializeScalar = (value: PolicyWasmPreviewStatePatchScalar): VariableValue =>
  value.kind === 'number' ? value.value : value.value;

const codeIndex = (values: readonly string[]): ReadonlyMap<number, string> =>
  new Map(values.map((value) => [stablePayloadCode({ literal: value }), value] as const));

const stateTokenIds = (state: GameState): readonly string[] =>
  Object.values(state.zones).flatMap((tokens) => tokens.map((token) => String(token.id)));

const tokenPropIds = (def: GameDef): readonly string[] =>
  [...new Set(def.tokenTypes.flatMap((tokenType) => Object.keys(tokenType.props)))];

const markerStateIds = (def: GameDef): readonly string[] =>
  [...new Set((def.markerLattices ?? []).flatMap((lattice) => lattice.states))];

export interface PolicyWasmPreviewStatePatchMaterializationResult {
  readonly state: GameState;
  readonly stateHash: bigint;
}

export const materializePolicyWasmPreviewStatePatch = (
  input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly patch: PolicyWasmPreviewStatePatch;
    readonly runtime?: GameDefRuntime;
  },
): PolicyWasmPreviewStatePatchMaterializationResult => {
  const globalVarByCode = codeIndex(input.def.globalVars.map((entry) => entry.name));
  const zoneByCode = codeIndex(input.def.zones.map((entry) => String(entry.id)));
  const zoneVarByCode = codeIndex((input.def.zoneVars ?? []).map((entry) => entry.name));
  const tokenByCode = codeIndex(stateTokenIds(input.state));
  const tokenPropByCode = codeIndex(tokenPropIds(input.def));
  const markerByCode = codeIndex((input.def.markerLattices ?? []).map((entry) => entry.id));
  const markerStateByCode = codeIndex(markerStateIds(input.def));
  const actionByCode = codeIndex(input.def.actions.map((entry) => String(entry.id)));

  let globalVars: Record<string, VariableValue> = { ...input.state.globalVars };
  let actionUsage: GameState['actionUsage'] = input.state.actionUsage;
  let nextFrameId = input.state.nextFrameId;
  let nextTurnId = input.state.nextTurnId;
  let zoneVars: Record<string, Record<string, number>> = Object.fromEntries(
    Object.entries(input.state.zoneVars).map(([zoneId, vars]) => [zoneId, { ...vars }]),
  );
  let zones = buildPolicyWasmPreviewZoneValues(input.state);
  const markerValues = new Map<string, string>();
  for (const [zoneId, markers] of Object.entries(input.state.markers)) {
    for (const [marker, state] of Object.entries(markers)) {
      markerValues.set(policyWasmPreviewMarkerKey(zoneId, marker), state);
    }
  }

  for (const op of input.patch.ops) {
    switch (op.kind) {
      case 'setGlobalVar': {
        const varName = globalVarByCode.get(stablePayloadCode({ literal: op.varName }));
        if (varName !== op.varName) {
          throw new Error(`Policy WASM state patch referenced unknown global variable "${op.varName}".`);
        }
        globalVars = { ...globalVars, [varName]: materializeScalar(op.value) };
        break;
      }
      case 'setZoneVar': {
        const zoneId = zoneByCode.get(stablePayloadCode({ literal: op.zoneId }));
        const varName = zoneVarByCode.get(stablePayloadCode({ literal: op.varName }));
        if (zoneId !== op.zoneId || varName !== op.varName || zoneVars[zoneId] === undefined) {
          throw new Error(`Policy WASM state patch referenced unknown zone variable "${op.zoneId}.${op.varName}".`);
        }
        zoneVars = {
          ...zoneVars,
          [zoneId]: {
            ...zoneVars[zoneId],
            [varName]: op.value,
          },
        };
        break;
      }
      case 'moveToken': {
        const tokenId = tokenByCode.get(stablePayloadCode({ literal: op.tokenId }));
        const fromZoneId = zoneByCode.get(stablePayloadCode({ literal: op.fromZoneId }));
        const toZoneId = zoneByCode.get(stablePayloadCode({ literal: op.toZoneId }));
        if (tokenId !== op.tokenId || fromZoneId !== op.fromZoneId || toZoneId !== op.toZoneId) {
          throw new Error(`Policy WASM state patch referenced unknown token move "${op.tokenId}".`);
        }
        const nextZones = movePolicyWasmPreviewToken(input.def, zones, tokenId, fromZoneId, toZoneId, op.position);
        if (nextZones === undefined) {
          throw new Error(`Policy WASM state patch token move "${op.tokenId}" is not materializable.`);
        }
        zones = nextZones;
        break;
      }
      case 'setTokenProp': {
        const tokenId = tokenByCode.get(stablePayloadCode({ literal: op.tokenId }));
        const prop = tokenPropByCode.get(stablePayloadCode({ literal: op.prop }));
        if (tokenId !== op.tokenId || prop !== op.prop) {
          throw new Error(`Policy WASM state patch referenced unknown token property "${op.tokenId}.${op.prop}".`);
        }
        const nextZones = setPolicyWasmPreviewTokenProp(input.def, zones, tokenId, prop, materializeScalar(op.value));
        if (nextZones === undefined) {
          throw new Error(`Policy WASM state patch token property "${op.tokenId}.${op.prop}" is not materializable.`);
        }
        zones = nextZones;
        break;
      }
      case 'setMarker': {
        const zoneId = zoneByCode.get(stablePayloadCode({ literal: op.zoneId }));
        const marker = markerByCode.get(stablePayloadCode({ literal: op.marker }));
        const markerState = markerStateByCode.get(stablePayloadCode({ literal: op.state }));
        if (zoneId !== op.zoneId || marker !== op.marker || markerState !== op.state) {
          throw new Error(`Policy WASM state patch referenced unknown marker "${op.zoneId}.${op.marker}".`);
        }
        markerValues.set(policyWasmPreviewMarkerKey(zoneId, marker), markerState);
        break;
      }
      case 'setActionUsage': {
        const actionId = actionByCode.get(stablePayloadCode({ literal: op.actionId }));
        if (actionId !== op.actionId) {
          throw new Error(`Policy WASM state patch referenced unknown action usage "${op.actionId}".`);
        }
        actionUsage = {
          ...actionUsage,
          [actionId]: {
            turnCount: op.turnCount,
            phaseCount: op.phaseCount,
            gameCount: op.gameCount,
          },
        };
        break;
      }
      case 'setMicroturnMetadata':
        nextFrameId = op.nextFrameId as GameState['nextFrameId'];
        nextTurnId = op.nextTurnId as GameState['nextTurnId'];
        break;
    }
  }

  const markers: Record<string, Record<string, string>> = {};
  for (const [key, markerState] of markerValues) {
    const separator = key.indexOf('\u0000');
    if (separator < 0) {
      continue;
    }
    const zoneId = key.slice(0, separator);
    const marker = key.slice(separator + 1);
    markers[zoneId] = {
      ...(markers[zoneId] ?? {}),
      [marker]: markerState,
    };
  }

  const projected: GameState = {
    ...input.state,
    globalVars,
    actionUsage,
    zoneVars,
    zones: Object.fromEntries(zones),
    markers,
    ...(nextFrameId === undefined ? {} : { nextFrameId }),
    ...(nextTurnId === undefined ? {} : { nextTurnId }),
  };
  const stateHash = computeFullHash(input.runtime?.zobristTable ?? createZobristTable(input.def), projected);
  return {
    state: {
      ...projected,
      stateHash,
      _runningHash: stateHash,
    },
    stateHash,
  };
};
