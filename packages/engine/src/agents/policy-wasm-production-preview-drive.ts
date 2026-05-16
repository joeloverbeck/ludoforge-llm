import {
  asPolicyWasmPreviewI32Literal,
  buildPolicyWasmPreviewMarkerValues,
  buildPolicyWasmPreviewZoneVarValues,
  buildPolicyWasmPreviewRootBindings,
  buildPolicyWasmPreviewZoneValues,
  findPolicyWasmPreviewAction,
  findPolicyWasmPreviewActionPipeline,
  findPolicyWasmPreviewTokenZone,
  findPolicyWasmPreviewMarkerDefault,
  isPolicyWasmPreviewScalarValue,
  materializePolicyWasmPreviewQueryValues,
  materializePolicyWasmPreviewState,
  moveAllPolicyWasmPreviewTokens,
  movePolicyWasmPreviewToken,
  policyWasmPreviewEffectKind,
  policyWasmPreviewMarkerStateAllowedForConstraints,
  policyWasmPreviewZonePropIncludes,
  parsePolicyWasmPreviewGlobalSlot,
  readPolicyWasmPreviewRootSlot,
  readPolicyWasmPreviewZoneVar,
  policyWasmPreviewMarkerKey,
  policyWasmPreviewMarkerStateAllowed,
  resolvePolicyWasmPreviewBindingName,
  resolvePolicyWasmPreviewMarkerShift,
  resolvePolicyWasmPreviewTokenProp,
  resolvePolicyWasmPreviewZoneProp,
  setPolicyWasmPreviewZoneVar,
  setPolicyWasmPreviewTokenProp,
  type PolicyWasmPreviewScalarArrayValue,
  type PolicyWasmPreviewScalarValue,
  type PolicyWasmPreviewValue,
  type PolicyWasmPreviewZoneValues,
  type PolicyWasmPreviewZoneVarValues,
} from './policy-wasm-production-preview-values.js';
import { materializePolicyWasmPreviewStatePatch } from './policy-wasm-preview-drive-state-patch.js';
import {
  classifyPolicyWasmPreviewStateSlots,
  evalPolicyWasmPreviewSurfaceSlot,
  evalPolicyWasmPreviewStateFeature,
} from './policy-wasm-production-preview-feature-slots.js';
import { lowerProductionPreviewDriveIr } from './policy-wasm-production-preview-drive-lowering.js';
import type { ConditionAST, EffectAST, GameState, OptionsQuery, ScopedVarNameExpr, ValueExpr } from '../kernel/index.js';
import type {
  PolicyWasmProductionPreviewDriveInput,
  PolicyWasmProductionPreviewDriveIrOp,
  PolicyWasmProductionPreviewDriveIrProgram,
} from './policy-wasm-production-preview-drive-types.js';
import type {
  PolicyWasmPreviewDriveResult,
  PolicyWasmPreviewStatePatchOp,
  PolicyWasmPreviewDriveUnsupportedClass,
  PolicyWasmPreviewStateSlot,
} from './policy-wasm-preview-drive.js';
import { definePolicyWasmPreviewStateSlot } from './policy-wasm-preview-drive.js';

export type {
  PolicyWasmProductionPreviewDriveCandidate,
  PolicyWasmProductionPreviewDriveInput,
  PolicyWasmProductionPreviewDriveIrOp,
  PolicyWasmProductionPreviewDriveIrProgram,
} from './policy-wasm-production-preview-drive-types.js';

interface UnsupportedProductionPreviewDrive { readonly unsupportedClass: PolicyWasmPreviewDriveUnsupportedClass; readonly owner: string; readonly reason: string; }

type CompileResult =
  | { readonly kind: 'supported'; readonly program: PolicyWasmProductionPreviewDriveIrProgram }
  | ({ readonly kind: 'unsupported' } & UnsupportedProductionPreviewDrive);

const unsupported = (
  unsupportedClass: PolicyWasmPreviewDriveUnsupportedClass,
  owner: string,
  reason: string,
): CompileResult => ({ kind: 'unsupported', unsupportedClass, owner, reason });

export const evaluateProductionPreviewDriveBatchWithWasm = (
  input: PolicyWasmProductionPreviewDriveInput,
): PolicyWasmPreviewDriveResult => {
  productionPreviewDriveBatchCount += 1;
  const compiled = compileProductionPreviewDrive(input);
  if (compiled.kind === 'unsupported') {
    return {
      kind: 'unsupported',
      profileId: input.profileId,
      candidateCount: input.candidates.length,
      unsupportedDriveClass: compiled.unsupportedClass,
      unsupportedOwner: compiled.owner,
      reason: compiled.reason,
    };
  }

  const batch = lowerProductionPreviewDriveIr(input, compiled.program);
  const result = input.runtime.evaluatePreviewDriveBatch(batch);
  if (result.kind !== 'supported' || input.materializeStatePatch !== true) {
    return result;
  }
  return {
    ...result,
    rows: result.rows.map((row) => {
      if (row.statePatch === undefined) {
        throw new Error('Policy WASM preview-drive supported row did not return a state patch.');
      }
      return {
        ...row,
        projectedState: materializePolicyWasmPreviewStatePatch({
          def: input.def,
          state: input.state,
          patch: row.statePatch,
          ...(input.gameDefRuntime === undefined ? {} : { runtime: input.gameDefRuntime }),
        }).state,
      };
    }),
  };
};

let productionPreviewDriveBatchCount = 0;

export const policyWasmProductionPreviewDriveInternals = {
  getProductionPreviewDriveBatchCount(): number {
    return productionPreviewDriveBatchCount;
  },
  resetProductionPreviewDriveBatchCount(): void {
    productionPreviewDriveBatchCount = 0;
  },
};

const compileProductionPreviewDrive = (
  input: PolicyWasmProductionPreviewDriveInput,
): CompileResult => {
  if (input.candidates.length === 0) {
    return unsupported('unknown', 'production-preview-drive', 'production preview-drive requires at least one candidate');
  }
  if (input.previewStateSlots.length === 0) {
    return unsupported('unsupported-effect', 'production-preview-drive.previewStateSlots', 'production preview-drive requires at least one scalar preview-state slot');
  }
  const { slotIndexByGlobalVar, featureSlots, surfaceSlots, unsupportedSlot } = classifyPolicyWasmPreviewStateSlots(input.previewStateSlots, parsePolicyWasmPreviewGlobalSlot);
  if (unsupportedSlot !== undefined) {
    return unsupported('unsupported-effect', 'production-preview-drive.previewStateSlots', `unsupported preview-state slot "${unsupportedSlot}"`);
  }
  const surfaceSlotByIndex = new Map(surfaceSlots.map((slot) => [slot.slotIndex, slot]));

  const actionIds = input.candidates.map((candidate) => candidate.actionId ?? String(candidate.move.actionId));
  const actionId = actionIds[0]!;
  if (!actionIds.every((candidateActionId) => candidateActionId === actionId)) {
    return unsupported('unsupported-effect', 'production-preview-drive.actionBatch', 'production preview-drive supports one shared action program per batch');
  }
  const pipeline = findPolicyWasmPreviewActionPipeline(input.def, actionId);
  const action = pipeline === undefined ? findPolicyWasmPreviewAction(input.def, actionId) : undefined;
  if (pipeline === undefined && action === undefined) {
    return unsupported('unsupported-effect', `action:${actionId}`, `action "${actionId}" has no generic production definition`);
  }
  const rootValues = input.previewStateSlots.map((slot, slotIndex) => {
    const featureId = slot.kind === 'feature' && slot.id.startsWith('feature.') ? slot.id.slice('feature.'.length) : undefined;
    if (featureId !== undefined) {
      return evalPolicyWasmPreviewStateFeature(featureId, input.def, input.state, slotIndexByGlobalVar, {
        slotValues: [],
        markerValues: buildPolicyWasmPreviewMarkerValues(input.state),
      }) ?? 0;
    }
    const surfaceSlot = surfaceSlotByIndex.get(slotIndex);
    if (surfaceSlot !== undefined) {
      return evalPolicyWasmPreviewSurfaceSlot(surfaceSlot, input, slotIndexByGlobalVar, {
        slotValues: [],
        markerValues: buildPolicyWasmPreviewMarkerValues(input.state),
        zoneVarValues: buildPolicyWasmPreviewZoneVarValues(input.state),
        zoneValues: buildPolicyWasmPreviewZoneValues(input.state),
      }) ?? 0;
    }
    return readPolicyWasmPreviewRootSlot(input.state, slot.id);
  });
  const rootBindings = buildPolicyWasmPreviewRootBindings(input.candidates, pipeline);
  if (rootBindings === undefined) {
    return unsupported('unsupported-effect', 'production-preview-drive.actionBatch', 'production preview-drive requires deterministic shared scalar runtime bindings');
  }

  const state = {
    beforeFirstDecision: true,
    bindings: rootBindings,
    ops: [] as PolicyWasmProductionPreviewDriveIrOp[],
    statePatchOps: (input.materializeStatePatch === true
      ? [
        nextActionUsagePatch(input.state, actionId),
        {
          kind: 'setMicroturnMetadata' as const,
          nextFrameId: (input.state.nextFrameId ?? 0) + 2,
          nextTurnId: input.originTurnId + 1,
        },
      ]
      : []) as PolicyWasmPreviewStatePatchOp[],
    slotValues: [...rootValues],
    markerValues: buildPolicyWasmPreviewMarkerValues(input.state),
    zoneVarValues: buildPolicyWasmPreviewZoneVarValues(input.state),
    zoneValues: buildPolicyWasmPreviewZoneValues(input.state),
  };
  if (pipeline !== undefined) {
    for (const stage of pipeline.stages) {
      const result = compileEffects(stage.effects, input, slotIndexByGlobalVar, state);
      if (result !== undefined) {
        return result;
      }
    }
  } else if (action !== undefined) {
    const result = compileEffects([...action.cost, ...action.effects], input, slotIndexByGlobalVar, state);
    if (result !== undefined) {
      return result;
    }
  }
  for (const featureSlot of featureSlots) {
    const value = evalPolicyWasmPreviewStateFeature(featureSlot.featureId, input.def, input.state, slotIndexByGlobalVar, state);
    if (value === undefined) {
      return unsupported('unsupported-effect', 'production-preview-drive.previewStateSlots', `unsupported preview-state feature "${featureSlot.featureId}"`);
    }
    state.ops.push({ kind: 'setPreviewSlot', slotIndex: featureSlot.slotIndex, value });
    state.slotValues[featureSlot.slotIndex] = value;
  }
  for (const surfaceSlot of surfaceSlots) {
    const value = evalPolicyWasmPreviewSurfaceSlot(surfaceSlot, input, slotIndexByGlobalVar, state);
    if (value === undefined) {
      return unsupported('unsupported-effect', 'production-preview-drive.previewStateSlots', `unsupported preview surface "${surfaceSlot.family}"`);
    }
    state.ops.push({ kind: 'setPreviewSlot', slotIndex: surfaceSlot.slotIndex, value });
    state.slotValues[surfaceSlot.slotIndex] = value;
  }
  return {
    kind: 'supported',
    program: {
      rootValues,
      ...(input.materializeStatePatch === true ? { statePatchOps: state.statePatchOps } : {}),
      ops: state.ops,
    },
  };
};

interface CompileState { beforeFirstDecision: boolean; bindings: Map<string, PolicyWasmPreviewValue>; ops: PolicyWasmProductionPreviewDriveIrOp[]; statePatchOps: PolicyWasmPreviewStatePatchOp[]; slotValues: number[]; markerValues: Map<string, string>; zoneVarValues: PolicyWasmPreviewZoneVarValues; zoneValues: PolicyWasmPreviewZoneValues; }

const nextActionUsagePatch = (
  state: GameState,
  actionId: string,
): PolicyWasmPreviewStatePatchOp => {
  const usage = state.actionUsage[actionId] ?? { turnCount: 0, phaseCount: 0, gameCount: 0 };
  return {
    kind: 'setActionUsage',
    actionId,
    turnCount: usage.turnCount + 1,
    phaseCount: usage.phaseCount + 1,
    gameCount: usage.gameCount + 1,
  };
};

export const definePolicyWasmProductionPreviewStateSlots = (
  slotIds: readonly string[],
): readonly PolicyWasmPreviewStateSlot[] =>
  slotIds.map((id) => definePolicyWasmPreviewStateSlot(id));

const compileEffects = (
  effects: readonly EffectAST[],
  input: PolicyWasmProductionPreviewDriveInput,
  slotIndexByGlobalVar: ReadonlyMap<string, number>,
  state: CompileState,
): CompileResult | undefined => {
  for (const effect of effects) {
    if ('addVar' in effect) {
      const payload = effect.addVar;
      const varName = resolveScopedVarName(payload.var, state);
      const slotIndex = payload.scope === 'global' && varName !== undefined ? slotIndexByGlobalVar.get(varName) : undefined;
      const zoneId = payload.scope === 'zoneVar' && varName !== undefined ? resolveZoneLikeValue(payload.zone, input, slotIndexByGlobalVar, state) : undefined;
      if (payload.scope === 'zoneVar') {
        const delta = evalI32NumericValue(payload.delta, input, slotIndexByGlobalVar, state);
        const current = zoneId === undefined || varName === undefined ? undefined : readPolicyWasmPreviewZoneVar(state.zoneVarValues, zoneId, varName);
        const nextZoneVars = current === undefined || delta === undefined ? undefined : setPolicyWasmPreviewZoneVar(input.def, state.zoneVarValues, zoneId!, varName!, current + delta);
        if (nextZoneVars === undefined) return unsupported('unsupported-effect', 'production-preview-drive.addVar', 'only deterministic integer zoneVar addVar effects are supported');
        state.beforeFirstDecision = false;
        state.zoneVarValues = nextZoneVars;
        if (input.materializeStatePatch === true) {
          state.statePatchOps.push({ kind: 'setZoneVar', zoneId: zoneId!, varName: varName!, value: current! + delta! });
        }
        continue;
      }
      if (slotIndex === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.addVar', 'only matching global scalar addVar effects are supported');
      }
      const delta = evalI32NumericValue(payload.delta, input, slotIndexByGlobalVar, state);
      if (delta === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.addVar', 'only deterministic integer addVar deltas are supported');
      }
      if (state.beforeFirstDecision) {
        const lastInitialApply = state.ops.at(-1);
        if (slotIndex === 0 && lastInitialApply?.kind === 'applyCandidateDeltas') {
          state.ops[state.ops.length - 1] = {
            kind: 'applyCandidateDeltas',
            candidateDeltas: lastInitialApply.candidateDeltas.map((entry) => entry + delta),
          };
        } else if (slotIndex === 0) {
          state.ops.push({ kind: 'applyCandidateDeltas', candidateDeltas: input.candidates.map(() => delta) });
        } else {
          state.ops.push({ kind: 'addPreviewSlot', slotIndex, delta });
        }
      } else {
        state.ops.push(slotIndex === 0 ? { kind: 'addGlobal', delta } : { kind: 'addPreviewSlot', slotIndex, delta });
      }
      state.slotValues[slotIndex] = (state.slotValues[slotIndex] ?? 0) + delta;
      if (input.materializeStatePatch === true) {
        state.statePatchOps.push({ kind: 'setGlobalVar', varName: varName!, value: { kind: 'number', value: state.slotValues[slotIndex] ?? 0 } });
      }
      continue;
    }

    if ('setVar' in effect) {
      const payload = effect.setVar;
      const varName = resolveScopedVarName(payload.var, state);
      const slotIndex = payload.scope === 'global' && varName !== undefined ? slotIndexByGlobalVar.get(varName) : undefined;
      const zoneId = payload.scope === 'zoneVar' && varName !== undefined ? resolveZoneLikeValue(payload.zone, input, slotIndexByGlobalVar, state) : undefined;
      if (payload.scope === 'zoneVar') {
        const value = evalI32NumericValue(payload.value, input, slotIndexByGlobalVar, state);
        const nextZoneVars = zoneId === undefined || varName === undefined || value === undefined ? undefined : setPolicyWasmPreviewZoneVar(input.def, state.zoneVarValues, zoneId, varName, value);
        if (nextZoneVars === undefined) return unsupported('unsupported-effect', 'production-preview-drive.setVar', 'only deterministic integer zoneVar setVar effects are supported');
        state.beforeFirstDecision = false;
        state.zoneVarValues = nextZoneVars;
        if (input.materializeStatePatch === true) {
          state.statePatchOps.push({ kind: 'setZoneVar', zoneId: zoneId!, varName: varName!, value: value! });
        }
        continue;
      }
      if (slotIndex === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.setVar', 'only matching global scalar setVar effects are supported');
      }
      const value = evalI32NumericValue(payload.value, input, slotIndexByGlobalVar, state);
      if (value === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.setVar', 'only deterministic integer setVar values are supported');
      }
      state.beforeFirstDecision = false;
      state.ops.push(slotIndex === 0 ? { kind: 'setGlobal', value } : { kind: 'setPreviewSlot', slotIndex, value });
      state.slotValues[slotIndex] = value;
      if (input.materializeStatePatch === true) {
        state.statePatchOps.push({ kind: 'setGlobalVar', varName: varName!, value: { kind: 'number', value } });
      }
      continue;
    }

    if ('setMarker' in effect) {
      const spaceId = resolveZoneLikeValue(effect.setMarker.space, input, slotIndexByGlobalVar, state);
      const markerState = evalScalarValue(effect.setMarker.state, input, slotIndexByGlobalVar, state);
      if (spaceId === undefined || typeof markerState !== 'string') {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.setMarker', 'only deterministic scalar setMarker effects are supported');
      }
      if (!policyWasmPreviewMarkerStateAllowed(input.def, effect.setMarker.marker, markerState)) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.setMarker', 'setMarker state must be present in the generic marker lattice');
      }
      state.beforeFirstDecision = false;
      state.markerValues.set(policyWasmPreviewMarkerKey(spaceId, effect.setMarker.marker), markerState);
      if (input.materializeStatePatch === true) {
        state.statePatchOps.push({ kind: 'setMarker', zoneId: spaceId, marker: effect.setMarker.marker, state: markerState });
      }
      continue;
    }

    if ('shiftMarker' in effect) {
      const spaceId = resolveZoneLikeValue(effect.shiftMarker.space, input, slotIndexByGlobalVar, state);
      const delta = evalI32NumericValue(effect.shiftMarker.delta, input, slotIndexByGlobalVar, state);
      const shifted = spaceId === undefined || delta === undefined
        ? undefined
        : resolvePolicyWasmPreviewMarkerShift(input.def, state.markerValues, spaceId, effect.shiftMarker.marker, delta, (candidateState) =>
          policyWasmPreviewMarkerStateAllowedForConstraints(input.def, effect.shiftMarker.marker, candidateState, (condition) => {
            const bindings = new Map(state.bindings);
            bindings.set('$space', spaceId);
            return evalConditionValue(condition, input, slotIndexByGlobalVar, { ...state, bindings });
          }));
      if (spaceId === undefined || shifted === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.shiftMarker', 'only deterministic scalar shiftMarker effects are supported');
      }
      state.beforeFirstDecision = false;
      state.markerValues.set(policyWasmPreviewMarkerKey(spaceId, effect.shiftMarker.marker), shifted);
      if (input.materializeStatePatch === true) {
        state.statePatchOps.push({ kind: 'setMarker', zoneId: spaceId, marker: effect.shiftMarker.marker, state: shifted });
      }
      continue;
    }

    if ('moveToken' in effect) {
      const tokenId = typeof effect.moveToken.token === 'string' ? state.bindings.get(resolveBindingName(effect.moveToken.token, state)) : undefined;
      const fromZoneId = resolveZoneLikeValue(effect.moveToken.from, input, slotIndexByGlobalVar, state);
      const toZoneId = resolveZoneLikeValue(effect.moveToken.to, input, slotIndexByGlobalVar, state);
      const nextZones = typeof tokenId === 'string' && fromZoneId !== undefined && toZoneId !== undefined
        ? movePolicyWasmPreviewToken(input.def, state.zoneValues, tokenId, fromZoneId, toZoneId, effect.moveToken.position)
        : undefined;
      if (nextZones === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.moveToken', 'only deterministic scalar moveToken effects are supported');
      }
      state.beforeFirstDecision = false;
      state.zoneValues = nextZones;
      if (input.materializeStatePatch === true) {
        state.statePatchOps.push({
          kind: 'moveToken',
          tokenId: tokenId as string,
          fromZoneId: fromZoneId!,
          toZoneId: toZoneId!,
          ...(effect.moveToken.position === 'bottom' ? { position: 'bottom' as const } : {}),
        });
      }
      continue;
    }

    if ('moveAll' in effect) {
      if (input.materializeStatePatch === true) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.moveAll', 'state-patch materialization does not yet support moveAll effects');
      }
      const fromZoneId = resolveZoneLikeValue(effect.moveAll.from, input, slotIndexByGlobalVar, state);
      const toZoneId = resolveZoneLikeValue(effect.moveAll.to, input, slotIndexByGlobalVar, state);
      const filter = effect.moveAll.filter;
      const nextZones = fromZoneId !== undefined && toZoneId !== undefined ? moveAllPolicyWasmPreviewTokens(input.def, state.zoneValues, fromZoneId, toZoneId, filter === undefined ? undefined : (token) => evalConditionValue(filter, input, slotIndexByGlobalVar, { ...state, bindings: new Map([...state.bindings, ['$token', String(token.id)]]) })) : undefined;
      if (nextZones === undefined) return unsupported('unsupported-effect', 'production-preview-drive.effect.moveAll', 'only deterministic scalar moveAll effects are supported');
      state.beforeFirstDecision = false; state.zoneValues = nextZones;
      continue;
    }

    if ('setTokenProp' in effect) {
      const tokenId = typeof effect.setTokenProp.token === 'string' ? state.bindings.get(resolveBindingName(effect.setTokenProp.token, state)) : undefined;
      const value = evalScalarValue(effect.setTokenProp.value, input, slotIndexByGlobalVar, state);
      if (input.materializeStatePatch === true && (typeof value === 'string' || Array.isArray(value))) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.setTokenProp', 'state-patch materialization supports numeric and boolean token props only');
      }
      const nextZones = typeof tokenId === 'string' && isPolicyWasmPreviewScalarValue(value)
        ? setPolicyWasmPreviewTokenProp(input.def, state.zoneValues, tokenId, effect.setTokenProp.prop, value)
        : undefined;
      if (nextZones === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.setTokenProp', 'only deterministic scalar setTokenProp effects are supported');
      }
      state.beforeFirstDecision = false;
      state.zoneValues = nextZones;
      if (input.materializeStatePatch === true) {
        state.statePatchOps.push({
          kind: 'setTokenProp',
          tokenId: tokenId as string,
          prop: effect.setTokenProp.prop,
          value: typeof value === 'boolean' ? { kind: 'boolean', value } : { kind: 'number', value: value as number },
        });
      }
      continue;
    }

    if ('removeByPriority' in effect) {
      if (input.materializeStatePatch === true) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.removeByPriority', 'state-patch materialization does not yet support removeByPriority effects');
      }
      const payload = effect.removeByPriority;
      let remaining = evalI32NumericValue(payload.budget, input, slotIndexByGlobalVar, state);
      const owner = 'production-preview-drive.effect.removeByPriority';
      if (remaining === undefined || remaining < 0) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.removeByPriority', 'only deterministic non-negative removeByPriority budgets are supported');
      }
      const exportedBindings = new Map(state.bindings);
      for (const group of payload.groups) {
        let removed = 0;
        if (remaining > 0) {
          const groupItems = evalQueryPreviewValues(group.over, input, { ...state, bindings: exportedBindings });
          if (groupItems === undefined) return unsupported('unsupported-effect', owner, 'only deterministic scalar removeByPriority groups are supported');
          for (const item of groupItems.slice(0, remaining)) {
            if (typeof item !== 'string') return unsupported('unsupported-effect', owner, 'removeByPriority groups must resolve token ids');
            const bindings = new Map(exportedBindings);
            bindings.set(resolveBindingName(group.bind, state), item);
            const groupState = { ...state, bindings };
            const fromZoneId = group.from === undefined ? findPolicyWasmPreviewTokenZone(state.zoneValues, item) : resolveZoneLikeValue(group.from, input, slotIndexByGlobalVar, groupState);
            const toZoneId = resolveZoneLikeValue(group.to, input, slotIndexByGlobalVar, groupState);
            const nextZones = fromZoneId !== undefined && toZoneId !== undefined ? movePolicyWasmPreviewToken(input.def, state.zoneValues, item, fromZoneId, toZoneId, undefined) : undefined;
            if (nextZones === undefined) return unsupported('unsupported-effect', owner, 'removeByPriority groups must move uniquely resolved tokens');
            state.zoneValues = nextZones;
            remaining -= 1; removed += 1;
            if (remaining === 0) break;
          }
        }
        if (group.countBind !== undefined) exportedBindings.set(resolveBindingName(group.countBind, state), removed);
      }
      if (payload.remainingBind !== undefined) exportedBindings.set(resolveBindingName(payload.remainingBind, state), remaining);
      state.beforeFirstDecision = false;
      state.bindings = exportedBindings;
      if (payload.in !== undefined) {
        const result = compileEffects(payload.in, input, slotIndexByGlobalVar, state);
        if (result !== undefined) return result;
      }
      continue;
    }

    if ('chooseOne' in effect) {
      const chooser = effect.chooseOne.chooser;
      if (chooser !== undefined && chooser !== 'active' && chooser !== 'actor') {
        return unsupported('agent-guided-completion', 'production-preview-drive.chooseOne', 'only origin-seat greedy chooseOne publication is supported');
      }
      const optionValues = evalQueryPreviewValues(effect.chooseOne.options, input, state);
      if (optionValues === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.chooseOne', 'only deterministic scalar chooseOne options are supported');
      }
      state.beforeFirstDecision = false;
      state.bindings.set(resolveBindingName(effect.chooseOne.bind, state), optionValues[0] ?? '');
      state.ops.push({ kind: 'chooseOneGreedy', optionDeltas: optionValues.map(() => 0) });
      continue;
    }

    if ('chooseN' in effect) {
      const chooser = effect.chooseN.chooser;
      if (chooser !== undefined && chooser !== 'active' && chooser !== 'actor') {
        return unsupported('agent-guided-completion', 'production-preview-drive.chooseN', 'only origin-seat greedy chooseN publication is supported');
      }
      const optionValues = evalQueryPreviewValues(effect.chooseN.options, input, state);
      if (optionValues === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.chooseN', 'only deterministic scalar chooseN options are supported');
      }
      const min = 'n' in effect.chooseN ? effect.chooseN.n : evalI32NumericValue(effect.chooseN.min ?? 0, input, slotIndexByGlobalVar, state);
      const max = 'n' in effect.chooseN ? effect.chooseN.n : evalI32NumericValue(effect.chooseN.max, input, slotIndexByGlobalVar, state);
      if (min === undefined || max === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.chooseN', 'only deterministic integer chooseN bounds are supported');
      }
      if (min < 0 || max < min) {
        return unsupported('unsupported-effect', 'production-preview-drive.chooseN', 'chooseN bounds must be deterministic non-negative integers');
      }
      state.beforeFirstDecision = false;
      state.bindings.set(resolveBindingName(effect.chooseN.bind, state), optionValues.slice(0, min));
      state.ops.push({ kind: 'chooseNGreedy', min, max: Math.min(max, optionValues.length), optionDeltas: optionValues.map(() => 0) });
      continue;
    }

    if ('rollRandom' in effect) {
      state.beforeFirstDecision = false;
      state.ops.push({ kind: 'stochastic' });
      continue;
    }

    if ('if' in effect) {
      const branch = evalConditionValue(effect.if.when, input, slotIndexByGlobalVar, state);
      if (branch === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.if', 'only deterministic scalar if conditions are supported');
      }
      const result = compileEffects(branch ? effect.if.then : effect.if.else ?? [], input, slotIndexByGlobalVar, state);
      if (result !== undefined) {
        return result;
      }
      continue;
    }

    if ('let' in effect) {
      const value = evalScalarValue(effect.let.value, input, slotIndexByGlobalVar, state);
      if (value === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.let', 'only deterministic scalar let bindings are supported');
      }
      const bindings = new Map(state.bindings);
      bindings.set(effect.let.bind, value);
      const innerState: CompileState = {
        ...state,
        bindings,
      };
      const result = compileEffects(effect.let.in, input, slotIndexByGlobalVar, innerState);
      if (result !== undefined) {
        return result;
      }
      state.beforeFirstDecision = innerState.beforeFirstDecision;
      state.zoneValues = innerState.zoneValues;
      state.markerValues = innerState.markerValues;
      state.zoneVarValues = innerState.zoneVarValues;
      continue;
    }

    if ('forEach' in effect) {
      const items = evalQueryPreviewValues(effect.forEach.over, input, state);
      if (items === undefined) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.forEach', 'only deterministic scalar forEach queries are supported');
      }
      const limit = effect.forEach.limit === undefined
        ? items.length
        : evalI32NumericValue(effect.forEach.limit, input, slotIndexByGlobalVar, state);
      if (limit === undefined || limit < 0) {
        return unsupported('unsupported-effect', 'production-preview-drive.effect.forEach', 'only deterministic non-negative forEach limits are supported');
      }
      const boundedItems = items.slice(0, limit);
      for (const item of boundedItems) {
        const bindings = new Map(state.bindings);
        bindings.set(resolveBindingName(effect.forEach.bind, state), item);
        const innerState: CompileState = {
          ...state,
          bindings,
        };
        const result = compileEffects(effect.forEach.effects, input, slotIndexByGlobalVar, innerState);
        if (result !== undefined) {
          return result;
        }
        state.beforeFirstDecision = innerState.beforeFirstDecision; state.zoneValues = innerState.zoneValues; state.markerValues = innerState.markerValues; state.zoneVarValues = innerState.zoneVarValues;
        for (const [name, value] of innerState.bindings) {
          if (name !== effect.forEach.bind) {
            state.bindings.set(name, value);
          }
        }
      }
      if (effect.forEach.in !== undefined) {
        const bindings = new Map(state.bindings);
        if (effect.forEach.countBind !== undefined) {
          bindings.set(resolveBindingName(effect.forEach.countBind, state), boundedItems.length);
        }
        const innerState: CompileState = {
          ...state,
          bindings,
        };
        const result = compileEffects(effect.forEach.in, input, slotIndexByGlobalVar, innerState);
        if (result !== undefined) {
          return result;
        }
        state.beforeFirstDecision = innerState.beforeFirstDecision; state.zoneValues = innerState.zoneValues; state.markerValues = innerState.markerValues; state.zoneVarValues = innerState.zoneVarValues;
      }
      continue;
    }

    return unsupported(
      'unsupported-effect',
      `production-preview-drive.effect.${policyWasmPreviewEffectKind(effect)}`,
      `unsupported production preview-drive effect ${policyWasmPreviewEffectKind(effect)}`,
    );
  }
  return undefined;
};

const resolveBindingName = (name: string, state: CompileState): string =>
  resolvePolicyWasmPreviewBindingName(name, state.bindings);

const evalQueryPreviewValues = (
  query: OptionsQuery,
  input: PolicyWasmProductionPreviewDriveInput,
  state: CompileState,
): PolicyWasmPreviewScalarArrayValue | undefined =>
  materializePolicyWasmPreviewQueryValues(query, {
    def: input.def,
    state: materializePolicyWasmPreviewState(input.state, state.zoneValues, state.zoneVarValues),
    ...(input.gameDefRuntime === undefined ? {} : { runtime: input.gameDefRuntime }),
  }, state.bindings);

const resolveZoneLikeValue = (
  value: unknown,
  input: PolicyWasmProductionPreviewDriveInput,
  slotIndexByGlobalVar: ReadonlyMap<string, number>,
  state: CompileState,
): string | undefined => {
  if (typeof value === 'string') {
    const directBinding = state.bindings.get(resolveBindingName(value, state));
    if (typeof directBinding === 'string') {
      return directBinding;
    }
    const resolved = resolveBindingName(value, state);
    return resolved.startsWith('$') ? undefined : resolved;
  }
  if (typeof value === 'object' && value !== null && 'zoneExpr' in value) {
    const zoneExpr = (value as { readonly zoneExpr: ValueExpr }).zoneExpr;
    const resolved = typeof zoneExpr === 'string' ? resolveZoneLikeValue(zoneExpr, input, slotIndexByGlobalVar, state) : evalScalarValue(zoneExpr, input, slotIndexByGlobalVar, state);
    return typeof resolved === 'string' ? resolved : undefined;
  }
  return undefined;
};

const resolveScopedVarName = (value: ScopedVarNameExpr, state: CompileState): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (value.ref !== 'binding') {
    return undefined;
  }
  const resolved = state.bindings.get(resolveBindingName(value.name, state));
  return typeof resolved === 'string' ? resolved : undefined;
};

const evalI32NumericValue = (
  value: ValueExpr,
  input: PolicyWasmProductionPreviewDriveInput,
  slotIndexByGlobalVar: ReadonlyMap<string, number>,
  state: CompileState,
): number | undefined => {
  const resolved = evalScalarValue(value, input, slotIndexByGlobalVar, state);
  return asPolicyWasmPreviewI32Literal(resolved);
};

const evalScalarValue = (
  value: ValueExpr,
  input: PolicyWasmProductionPreviewDriveInput,
  slotIndexByGlobalVar: ReadonlyMap<string, number>,
  state: CompileState,
): PolicyWasmPreviewValue | undefined => {
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (value._t === 1) {
    return value.scalarArray;
  }
  if (value._t === 2) {
    if (value.ref === 'binding') {
      return state.bindings.get(resolveBindingName(value.name, state));
    }
    if (value.ref === 'globalMarkerState') {
      return input.state.globalMarkers?.[value.marker] ?? '';
    }
    if (value.ref === 'markerState') {
      const spaceId = resolveZoneLikeValue(value.space, input, slotIndexByGlobalVar, state);
      if (spaceId === undefined) {
        return undefined;
      }
      return state.markerValues.get(policyWasmPreviewMarkerKey(spaceId, value.marker))
        ?? findPolicyWasmPreviewMarkerDefault(input.def, value.marker)
        ?? '';
    }
    if (value.ref === 'zoneProp') {
      const zoneId = resolveZoneLikeValue(value.zone, input, slotIndexByGlobalVar, state);
      return zoneId === undefined ? undefined : resolvePolicyWasmPreviewZoneProp(input.def, zoneId, value.prop);
    }
    if (value.ref === 'zoneVar') { const zoneId = resolveZoneLikeValue(value.zone, input, slotIndexByGlobalVar, state); const varName = resolveScopedVarName(value.var, state); return zoneId === undefined || varName === undefined ? undefined : readPolicyWasmPreviewZoneVar(state.zoneVarValues, zoneId, varName); }
    if (value.ref === 'tokenZone') {
      const tokenId = typeof value.token === 'string' ? state.bindings.get(resolveBindingName(value.token, state)) : undefined;
      return typeof tokenId === 'string' ? findPolicyWasmPreviewTokenZone(state.zoneValues, tokenId) : undefined;
    }
    if (value.ref === 'tokenProp') {
      const tokenId = typeof value.token === 'string' ? state.bindings.get(resolveBindingName(value.token, state)) : undefined;
      return typeof tokenId === 'string' ? resolvePolicyWasmPreviewTokenProp(state.zoneValues, tokenId, value.prop) : undefined;
    }
    if (value.ref === 'grantContext') {
      return undefined;
    }
    if (value.ref === 'gvar') {
      const varName = resolveScopedVarName(value.var, state);
      if (varName === undefined) {
        return undefined;
      }
      const slotIndex = slotIndexByGlobalVar.get(varName);
      if (slotIndex !== undefined) {
        return state.slotValues[slotIndex] ?? 0;
      }
      const rootValue = input.state.globalVars[varName];
      return typeof rootValue === 'number' || typeof rootValue === 'boolean' || typeof rootValue === 'string'
        ? rootValue
        : undefined;
    }
    return undefined;
  }
  if (value._t === 3) {
    const parts = value.concat.map((part) => evalScalarValue(part, input, slotIndexByGlobalVar, state));
    return parts.every(isPolicyWasmPreviewScalarValue) ? parts.join('') : undefined;
  }
  if (value._t === 4) {
    const branch = evalConditionValue(value.if.when, input, slotIndexByGlobalVar, state);
    return branch === undefined
      ? undefined
      : evalScalarValue(branch ? value.if.then : value.if.else, input, slotIndexByGlobalVar, state);
  }
  if (value._t !== 6) {
    if (value._t === 5 && value.aggregate.op === 'count') {
      return evalCountQuery(value.aggregate.query, input, state);
    }
    return undefined;
  }
  const left = evalI32NumericValue(value.left, input, slotIndexByGlobalVar, state);
  const right = evalI32NumericValue(value.right, input, slotIndexByGlobalVar, state);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if ((value.op === '/' || value.op === 'floorDiv' || value.op === 'ceilDiv') && right === 0) {
    return undefined;
  }
  const result =
    value.op === '+' ? left + right
      : value.op === '-' ? left - right
        : value.op === '*' ? left * right
          : value.op === '/' ? Math.trunc(left / right)
            : value.op === 'floorDiv' ? Math.floor(left / right)
              : value.op === 'ceilDiv' ? Math.ceil(left / right)
                : value.op === 'min' ? Math.min(left, right)
                  : Math.max(left, right);
  return asPolicyWasmPreviewI32Literal(result);
};

const evalCountQuery = (
  query: OptionsQuery,
  input: PolicyWasmProductionPreviewDriveInput,
  state: CompileState,
): number | undefined => {
  if (query.query === 'binding' && typeof query.name === 'string') {
    const value = state.bindings.get(resolveBindingName(query.name, state));
    if (value === undefined) {
      return undefined;
    }
    return Array.isArray(value) ? value.length : 1;
  }
  if (query.query === 'grantContext') {
    return 0;
  }
  return evalQueryPreviewValues(query, input, state)?.length;
};

const evalConditionValue = (
  condition: ConditionAST,
  input: PolicyWasmProductionPreviewDriveInput,
  slotIndexByGlobalVar: ReadonlyMap<string, number>,
  state: CompileState,
): boolean | undefined => {
  if (typeof condition === 'boolean') {
    return condition;
  }
  switch (condition.op) {
    case 'and': {
      for (const child of condition.args) {
        const value = evalConditionValue(child, input, slotIndexByGlobalVar, state);
        if (value === undefined) {
          return undefined;
        }
        if (!value) {
          return false;
        }
      }
      return true;
    }
    case 'or': {
      for (const child of condition.args) {
        const value = evalConditionValue(child, input, slotIndexByGlobalVar, state);
        if (value === undefined) {
          return undefined;
        }
        if (value) {
          return true;
        }
      }
      return false;
    }
    case 'not': {
      const value = evalConditionValue(condition.arg, input, slotIndexByGlobalVar, state);
      return value === undefined ? undefined : !value;
    }
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const left = evalScalarValue(condition.left, input, slotIndexByGlobalVar, state);
      const right = evalScalarValue(condition.right, input, slotIndexByGlobalVar, state);
      if (left === undefined || right === undefined) {
        return undefined;
      }
      if (condition.op === '==') {
        return left === right;
      }
      if (condition.op === '!=') {
        return left !== right;
      }
      if (typeof left !== 'number' || typeof right !== 'number') {
        return undefined;
      }
      if (condition.op === '<') {
        return left < right;
      }
      if (condition.op === '<=') {
        return left <= right;
      }
      if (condition.op === '>') {
        return left > right;
      }
      return left >= right;
    }
    case 'in': {
      const item = evalScalarMemberValue(condition.item, input, slotIndexByGlobalVar, state);
      const set = evalScalarSetValue(condition.set, input, slotIndexByGlobalVar, state);
      return item === undefined || set === undefined ? undefined : set.includes(item);
    }
    case 'zonePropIncludes': {
      const zoneId = resolveZoneLikeValue(condition.zone, input, slotIndexByGlobalVar, state);
      const value = evalScalarMemberValue(condition.value, input, slotIndexByGlobalVar, state);
      return zoneId === undefined || value === undefined ? undefined : policyWasmPreviewZonePropIncludes(input.def, zoneId, condition.prop, value);
    }
    default:
      return undefined;
  }
};

const evalScalarMemberValue = (value: ValueExpr, input: PolicyWasmProductionPreviewDriveInput, slotIndexByGlobalVar: ReadonlyMap<string, number>, state: CompileState): PolicyWasmPreviewScalarValue | undefined => {
  const resolved = evalScalarValue(value, input, slotIndexByGlobalVar, state);
  return isPolicyWasmPreviewScalarValue(resolved) ? resolved : undefined;
};

const evalScalarSetValue = (value: ValueExpr, input: PolicyWasmProductionPreviewDriveInput, slotIndexByGlobalVar: ReadonlyMap<string, number>, state: CompileState): PolicyWasmPreviewScalarArrayValue | undefined => {
  const resolved = evalScalarValue(value, input, slotIndexByGlobalVar, state);
  return Array.isArray(resolved) ? resolved : isPolicyWasmPreviewScalarValue(resolved) ? [resolved] : undefined;
};
