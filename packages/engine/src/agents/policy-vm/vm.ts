import type { PolicyValue } from '../policy-surface.js';
import type { EncodedState, EncodedStateLayout } from '../../kernel/encoded-state/index.js';
import type { GameDef, GameState, Move } from '../../kernel/types.js';
import { stablePayloadCode, stableStringCode } from '../../cnl/policy-bytecode/feature-table.js';
import { toMoveIdentityKey } from '../../kernel/move-identity.js';
import { Opcode, OPCODE_NAMES, type FeatureRef, type PolicyBytecode } from '../../cnl/policy-bytecode/index.js';

const STACK_SIZE = 256;
const SURFACE_SCOPE_CURRENT = 0;
const SELECTOR_NONE = 0;
const SELECTOR_PLAYER = 1;
const PLAYER_SELF = 0;
const PLAYER_ACTIVE = 1;
const ZONE_PROP_ATTRIBUTE = 0;
const GLOBAL_ZONE_ATTRIBUTE = 0;
const AGG_COUNT = 0;
const AGG_SUM = 1;
const AGG_MIN = 2;
const AGG_MAX = 3;
const ZONE_SCOPE_ALL = 0;
const ZONE_SCOPE_BOARD = 1;
const ZONE_SCOPE_AUX = 2;
const OWNER_NONE = 0;
const OWNER_SELF = 1;
const OWNER_ACTIVE = 2;
const CANDIDATE_INTRINSIC_ACTION_ID = 0;
const CANDIDATE_INTRINSIC_STABLE_MOVE_KEY = 1;
const CANDIDATE_INTRINSIC_PARAM_COUNT = 2;
const UNSUPPORTED_FEATURE = Symbol('unsupported policy bytecode feature');

export class PolicyBytecodeVmUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyBytecodeVmUnsupportedError';
  }
}

export interface VMContext {
  readonly def: GameDef;
  readonly layout: EncodedStateLayout;
  readonly state: GameState;
  readonly candidateIndex?: number;
  readonly depth?: number;
  readonly playerId?: number;
  readonly seatId?: string;
  readonly profileId?: string;
  readonly legalMoves?: readonly Move[];
  readonly resolveFeature?: (ref: FeatureRef, context: VMContext) => PolicyValue;
  readonly resolveRef?: (refId: number, context: VMContext) => PolicyValue;
  readonly resolveDynamic?: (reason: number, context: VMContext) => PolicyValue;
}

export interface VMResult {
  readonly scores: readonly number[];
  readonly value?: PolicyValue;
  readonly pruned?: boolean;
  readonly usedDynamicFallback: boolean;
}

type StackValue = number | boolean | string | readonly string[] | undefined;

const readOperand = (instructions: Int32Array, pc: number, opcode: Opcode): number => {
  const value = instructions[pc];
  if (value === undefined) {
    throw new Error(`Policy bytecode ${OPCODE_NAMES[opcode]} is missing operand at offset ${pc}.`);
  }
  return value;
};

const asNumber = (value: StackValue): number | undefined =>
  typeof value === 'number' ? value : undefined;

const pop = (stack: StackValue[], opcode: Opcode): StackValue => {
  if (stack.length === 0) {
    throw new Error(`Policy bytecode stack underflow while executing ${OPCODE_NAMES[opcode]}.`);
  }
  return stack.pop();
};

const push = (stack: StackValue[], value: StackValue, opcode: Opcode): void => {
  if (stack.length >= STACK_SIZE) {
    throw new Error(`Policy bytecode stack overflow while executing ${OPCODE_NAMES[opcode]}.`);
  }
  stack.push(value);
};

const binaryNumeric = (
  stack: StackValue[],
  opcode: Opcode,
  apply: (left: number, right: number) => number,
): void => {
  const right = asNumber(pop(stack, opcode));
  const left = asNumber(pop(stack, opcode));
  push(stack, left === undefined || right === undefined ? undefined : apply(left, right), opcode);
};

const binaryCompare = (
  stack: StackValue[],
  opcode: Opcode,
  apply: (left: number, right: number) => boolean,
): void => {
  const right = asNumber(pop(stack, opcode));
  const left = asNumber(pop(stack, opcode));
  push(stack, left === undefined || right === undefined ? undefined : apply(left, right), opcode);
};

const hasBit = (array: BigUint64Array, bitIndex: number): boolean => {
  const word = Math.trunc(bitIndex / 64);
  const offset = BigInt(bitIndex % 64);
  return ((array[word] ?? 0n) & (1n << offset)) !== 0n;
};

const markerStateBitOffset = (
  markerIds: readonly string[],
  statesByMarkerId: Readonly<Record<string, readonly string[]>>,
  markerIndex: number,
): number => markerIds
  .slice(0, markerIndex)
  .reduce((offset, markerId) => offset + (statesByMarkerId[markerId]?.length ?? 0), 0);

const zoneMatchesScope = (zoneKind: string | undefined, scopeCode: number): boolean => {
  if (scopeCode === ZONE_SCOPE_ALL) return true;
  if (scopeCode === ZONE_SCOPE_BOARD) return (zoneKind ?? 'board') === 'board';
  if (scopeCode === ZONE_SCOPE_AUX) return (zoneKind ?? 'board') === 'aux';
  return false;
};

function resolvePlayerIndex(context: VMContext, selectorCode: number, selectorValue: number | undefined): number | undefined {
  if (selectorCode === SELECTOR_NONE) {
    return context.playerId ?? Number(context.state.activePlayer);
  }
  if (selectorCode !== SELECTOR_PLAYER) {
    return undefined;
  }
  return selectorValue === PLAYER_SELF
    ? context.playerId ?? Number(context.state.activePlayer)
    : selectorValue === PLAYER_ACTIVE
      ? Number(context.state.activePlayer)
      : undefined;
}

function tokenOccurrencesInZone(encoded: EncodedState, tokenIndex: number, zoneIndex: number): number {
  const occurrenceCount = encoded.tokenOccurrenceCount[tokenIndex] ?? 0;
  if (occurrenceCount <= 0) return 0;
  if (occurrenceCount === 1) {
    return encoded.tokenZone[tokenIndex] === zoneIndex ? 1 : 0;
  }
  const offset = encoded.tokenOccurrenceOffset[tokenIndex];
  if (offset === undefined || offset < 0) return 0;
  let count = 0;
  for (let occurrence = 0; occurrence < occurrenceCount; occurrence += 1) {
    if (encoded.tokenOccurrenceZones[offset + occurrence] === zoneIndex) {
      count += 1;
    }
  }
  return count;
}

function tokenNumericProp(
  encoded: EncodedState,
  layout: EncodedStateLayout,
  tokenIndex: number,
  propIndex: number,
): number | undefined {
  if (propIndex < 0) return undefined;
  const scalarIndex = tokenIndex * layout.tokenLayout.scalarPropIds.length + propIndex;
  return encoded.tokenScalarPropPresent[scalarIndex] === 1
    ? encoded.tokenScalarPropValues[scalarIndex]
    : undefined;
}

function aggregateValues(values: readonly number[], opCode: number): PolicyValue {
  if (opCode === AGG_COUNT) return values.length;
  if (values.length === 0) return opCode === AGG_SUM ? 0 : undefined;
  if (opCode === AGG_SUM) return values.reduce((sum, value) => sum + value, 0);
  if (opCode === AGG_MIN) return Math.min(...values);
  if (opCode === AGG_MAX) return Math.max(...values);
  return undefined;
}

function resolveBuiltInFeature(
  ref: FeatureRef,
  encoded: EncodedState,
  context: VMContext,
): PolicyValue | typeof UNSUPPORTED_FEATURE {
  const { layout, state } = context;
  switch (ref.kind) {
    case 'globalVar':
      return ref.aux[0] === SURFACE_SCOPE_CURRENT ? encoded.globals[ref.layoutIndex] : UNSUPPORTED_FEATURE;
    case 'playerInt': {
      if (ref.aux[0] !== SURFACE_SCOPE_CURRENT) return UNSUPPORTED_FEATURE;
      const playerIndex = resolvePlayerIndex(context, ref.aux[1] ?? SELECTOR_NONE, ref.aux[2]);
      if (playerIndex === undefined) return undefined;
      const stride = layout.varLayout.perPlayerVariableIds.length;
      return encoded.playerInts[playerIndex * stride + ref.layoutIndex];
    }
    case 'globalMarker': {
      if (ref.aux[0] !== SURFACE_SCOPE_CURRENT) return UNSUPPORTED_FEATURE;
      const markerId = layout.markerLayout.globalMarkerIds[ref.layoutIndex];
      if (markerId === undefined) return undefined;
      const states = layout.markerLayout.markerStateIdsByMarkerId[markerId] ?? [];
      const base = markerStateBitOffset(layout.markerLayout.globalMarkerIds, layout.markerLayout.markerStateIdsByMarkerId, ref.layoutIndex);
      for (const [stateOffset, stateId] of states.entries()) {
        if (hasBit(encoded.globalMarkers, base + stateOffset)) return stateId;
      }
      return context.def.globalMarkerLattices?.find((entry) => entry.id === markerId)?.defaultState;
    }
    case 'zoneProp': {
      const source = ref.aux[0];
      const field = ref.aux[1];
      if (source === ZONE_PROP_ATTRIBUTE) {
        return undefined;
      }
      if (field === undefined) return undefined;
      const stride = layout.varLayout.zoneVariableIds.length;
      return encoded.zoneInts[ref.layoutIndex * stride + field];
    }
    case 'zoneTokenAgg': {
      const ownerCode = ref.aux[0] ?? OWNER_NONE;
      if (ownerCode !== OWNER_NONE && ownerCode !== OWNER_SELF && ownerCode !== OWNER_ACTIVE) return undefined;
      const propIndex = ref.aux[1] ?? -1;
      const opCode = ref.aux[2] ?? AGG_COUNT;
      const values: number[] = [];
      for (let tokenIndex = 0; tokenIndex < encoded.tokenIds.length; tokenIndex += 1) {
        const occurrenceCount = tokenOccurrencesInZone(encoded, tokenIndex, ref.layoutIndex);
        if (occurrenceCount === 0) continue;
        if (opCode === AGG_COUNT) {
          const value = tokenNumericProp(encoded, layout, tokenIndex, propIndex);
          if (value !== undefined) values.push(...Array.from({ length: occurrenceCount }, () => value));
          continue;
        }
        const value = tokenNumericProp(encoded, layout, tokenIndex, propIndex);
        if (value !== undefined) values.push(...Array.from({ length: occurrenceCount }, () => value));
      }
      return opCode === AGG_COUNT ? values.length : aggregateValues(values, opCode);
    }
    case 'globalTokenAgg': {
      const opCode = ref.aux[0] ?? AGG_COUNT;
      const scopeCode = ref.aux[1] ?? ZONE_SCOPE_ALL;
      const propIndex = ref.aux[2] ?? -1;
      const tokenFilterCode = ref.aux[3] ?? 0;
      const zoneFilterCode = ref.aux[4] ?? 0;
      if (tokenFilterCode !== 0 || zoneFilterCode !== 0) {
        return UNSUPPORTED_FEATURE;
      }
      const zoneIndexes = new Set(
        context.def.zones
          .map((zone, index) => zoneMatchesScope(zone.zoneKind, scopeCode) ? index : -1)
          .filter((index) => index >= 0),
      );
      const values: number[] = [];
      for (let tokenIndex = 0; tokenIndex < encoded.tokenIds.length; tokenIndex += 1) {
        let occurrenceCount = 0;
        for (const zoneIndex of zoneIndexes) {
          occurrenceCount += tokenOccurrencesInZone(encoded, tokenIndex, zoneIndex);
        }
        if (occurrenceCount === 0) continue;
        if (opCode === AGG_COUNT) {
          values.push(...Array.from({ length: occurrenceCount }, () => 1));
          continue;
        }
        const value = tokenNumericProp(encoded, layout, tokenIndex, propIndex);
        if (value !== undefined) values.push(...Array.from({ length: occurrenceCount }, () => value));
      }
      return opCode === AGG_COUNT ? values.length : aggregateValues(values, opCode);
    }
    case 'globalZoneAgg': {
      const source = ref.aux[0] ?? GLOBAL_ZONE_ATTRIBUTE;
      const field = ref.aux[1];
      const opCode = ref.aux[2] ?? AGG_COUNT;
      const scopeCode = ref.aux[3] ?? ZONE_SCOPE_ALL;
      const values: number[] = [];
      for (const [zoneIndex, zoneDef] of context.def.zones.entries()) {
        if (!zoneMatchesScope(zoneDef.zoneKind, scopeCode)) continue;
        if (opCode === AGG_COUNT) {
          values.push(1);
          continue;
        }
        if (source !== GLOBAL_ZONE_ATTRIBUTE && field !== undefined) {
          const stride = layout.varLayout.zoneVariableIds.length;
          const value = encoded.zoneInts[zoneIndex * stride + field];
          if (value !== undefined) values.push(value);
        }
      }
      return opCode === AGG_COUNT ? values.length : aggregateValues(values, opCode);
    }
    case 'candidateIntrinsic': {
      const candidate = context.candidateIndex === undefined ? undefined : context.legalMoves?.[context.candidateIndex];
      if (candidate === undefined) return UNSUPPORTED_FEATURE;
      const intrinsicCode = ref.aux[0];
      if (intrinsicCode === CANDIDATE_INTRINSIC_ACTION_ID) {
        return stablePayloadCode({ literal: String(candidate.actionId) });
      }
      if (intrinsicCode === CANDIDATE_INTRINSIC_STABLE_MOVE_KEY) {
        return stablePayloadCode({ literal: toMoveIdentityKey(context.def, candidate) });
      }
      if (intrinsicCode === CANDIDATE_INTRINSIC_PARAM_COUNT) {
        return Object.keys(candidate.params).length;
      }
      return undefined;
    }
    case 'candidateParam': {
      const candidate = context.candidateIndex === undefined ? undefined : context.legalMoves?.[context.candidateIndex];
      if (candidate === undefined) return UNSUPPORTED_FEATURE;
      for (const [id, value] of Object.entries(candidate.params)) {
        if (stableStringCode(id) !== ref.aux[0]) continue;
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'string') return stablePayloadCode({ literal: value });
        return undefined;
      }
      return undefined;
    }
    case 'candidateTag': {
      const candidate = context.candidateIndex === undefined ? undefined : context.legalMoves?.[context.candidateIndex];
      if (candidate === undefined) return UNSUPPORTED_FEATURE;
      const tags = context.def.actionTagIndex?.byAction[String(candidate.actionId)] ?? [];
      return tags.some((tag) => stableStringCode(tag) === ref.aux[0]);
    }
    case 'adjacentTokenAgg':
    case 'seatAgg':
    case 'dynamicRef':
    case 'dynamicSurface':
    case 'dynamicExpr':
    case 'candidateTags':
      return context.resolveFeature === undefined ? UNSUPPORTED_FEATURE : context.resolveFeature(ref, context);
    default:
      return state === context.state && context.resolveFeature !== undefined
        ? context.resolveFeature(ref, context)
        : UNSUPPORTED_FEATURE;
  }
}

export function executeBytecode(bytecode: PolicyBytecode, encoded: EncodedState, context: VMContext): VMResult {
  const stack: StackValue[] = [];
  const instructions = bytecode.instructions;
  let pc = 0;
  let usedDynamicFallback = false;

  while (pc < instructions.length) {
    const opcode = instructions[pc] as Opcode | undefined;
    if (opcode === undefined) {
      throw new Error(`Policy bytecode missing opcode at offset ${pc}.`);
    }
    pc += 1;

    switch (opcode) {
      case Opcode.LOAD_FEATURE: {
        const featureId = readOperand(instructions, pc, opcode);
        pc += 1;
        const ref = bytecode.featureTable.refs[featureId];
        if (ref === undefined) {
          throw new Error(`Policy bytecode references unknown feature id ${featureId}.`);
        }
        const value = resolveBuiltInFeature(ref, encoded, context);
        if (value === UNSUPPORTED_FEATURE) {
          throw new PolicyBytecodeVmUnsupportedError(`Policy bytecode feature "${ref.kind}" is not supported by the VM core.`);
        }
        push(stack, value, opcode);
        break;
      }
      case Opcode.LOAD_CONST: {
        const constantId = readOperand(instructions, pc, opcode);
        pc += 1;
        push(stack, bytecode.constants[constantId], opcode);
        break;
      }
      case Opcode.GT:
        binaryCompare(stack, opcode, (left, right) => left > right);
        break;
      case Opcode.LT:
        binaryCompare(stack, opcode, (left, right) => left < right);
        break;
      case Opcode.EQ: {
        const right = pop(stack, opcode);
        const left = pop(stack, opcode);
        push(stack, left === undefined || right === undefined ? undefined : left === right, opcode);
        break;
      }
      case Opcode.NEQ: {
        const right = pop(stack, opcode);
        const left = pop(stack, opcode);
        push(stack, left === undefined || right === undefined ? undefined : left !== right, opcode);
        break;
      }
      case Opcode.GTE:
        binaryCompare(stack, opcode, (left, right) => left >= right);
        break;
      case Opcode.LTE:
        binaryCompare(stack, opcode, (left, right) => left <= right);
        break;
      case Opcode.JUMP_IF_FALSE: {
        const offset = readOperand(instructions, pc, opcode);
        pc += 1;
        const condition = pop(stack, opcode);
        if (condition !== true) {
          pc += offset;
        }
        break;
      }
      case Opcode.ADD_SCORE:
        binaryNumeric(stack, opcode, (left, right) => left + right);
        break;
      case Opcode.SUB_SCORE:
        binaryNumeric(stack, opcode, (left, right) => left - right);
        break;
      case Opcode.MUL_SCORE:
        binaryNumeric(stack, opcode, (left, right) => left * right);
        break;
      case Opcode.DIV_SCORE:
        binaryNumeric(stack, opcode, (left, right) => {
          if (right === 0) throw new Error('Policy bytecode division evaluated with a zero denominator.');
          return Math.trunc(left / right);
        });
        break;
      case Opcode.NEG: {
        const value = asNumber(pop(stack, opcode));
        push(stack, value === undefined ? undefined : -value, opcode);
        break;
      }
      case Opcode.ABS: {
        const value = asNumber(pop(stack, opcode));
        push(stack, value === undefined ? undefined : Math.abs(value), opcode);
        break;
      }
      case Opcode.MIN:
        binaryNumeric(stack, opcode, (left, right) => Math.min(left, right));
        break;
      case Opcode.MAX:
        binaryNumeric(stack, opcode, (left, right) => Math.max(left, right));
        break;
      case Opcode.AND: {
        const right = pop(stack, opcode);
        const left = pop(stack, opcode);
        push(stack, left === false || right === false ? false : left === true && right === true ? true : undefined, opcode);
        break;
      }
      case Opcode.OR: {
        const right = pop(stack, opcode);
        const left = pop(stack, opcode);
        push(stack, left === true || right === true ? true : left === false && right === false ? false : undefined, opcode);
        break;
      }
      case Opcode.NOT: {
        const value = pop(stack, opcode);
        push(stack, typeof value === 'boolean' ? !value : undefined, opcode);
        break;
      }
      case Opcode.COALESCE: {
        const right = pop(stack, opcode);
        const left = pop(stack, opcode);
        push(stack, left !== undefined ? left : right, opcode);
        break;
      }
      case Opcode.BOOL_TO_NUMBER: {
        const value = pop(stack, opcode);
        push(stack, typeof value === 'boolean' ? (value ? 1 : 0) : undefined, opcode);
        break;
      }
      case Opcode.IN: {
        const haystack = pop(stack, opcode);
        const needle = pop(stack, opcode);
        push(stack, Array.isArray(haystack) && needle !== undefined ? haystack.includes(String(needle)) : undefined, opcode);
        break;
      }
      case Opcode.RESOLVE_REF: {
        const refId = readOperand(instructions, pc, opcode);
        pc += 1;
        const value = context.resolveRef?.(refId, context);
        if (value === undefined) {
          throw new PolicyBytecodeVmUnsupportedError(`Policy bytecode ref ${refId} is not supported by the VM core.`);
        }
        push(stack, value, opcode);
        break;
      }
      case Opcode.AGGREGATE_SUM:
      case Opcode.AGGREGATE_COUNT:
      case Opcode.AGGREGATE_MIN:
      case Opcode.AGGREGATE_MAX:
        throw new Error(`Policy bytecode opcode ${OPCODE_NAMES[opcode]} requires compiler-emitted aggregate frames.`);
      case Opcode.RESOLVE_DYNAMIC: {
        const reason = readOperand(instructions, pc, opcode);
        pc += 1;
        usedDynamicFallback = true;
        push(stack, context.resolveDynamic?.(reason, context), opcode);
        break;
      }
      case Opcode.HALT: {
        const value = stack.at(-1);
        return {
          value,
          scores: typeof value === 'number' ? [value] : [],
          usedDynamicFallback,
        };
      }
      default:
        throw new Error(`Unknown policy bytecode opcode ${String(opcode)} at offset ${pc - 1}.`);
    }
  }

  const value = stack.at(-1);
  return {
    value,
    scores: typeof value === 'number' ? [value] : [],
    usedDynamicFallback,
  };
}
