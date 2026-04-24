import type { GameDefRuntime } from '../gamedef-runtime.js';
import type {
  ChoiceOption,
  ChoicePendingChooseNRequest,
  ChoicePendingChooseOneRequest,
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
} from '../types-core.js';
import type { MoveParamScalar } from '../types-ast.js';
import { resumeSuspendedEffectFrame } from './resume.js';

export interface ProbeContext {
  readonly def: GameDef;
  readonly state: GameState;
  readonly runtime: GameDefRuntime;
  readonly move: Move;
  readonly depthBudget: number;
}

export type ProbeVerdict =
  | { readonly kind: 'bridgeable' }
  | { readonly kind: 'unbridgeable'; readonly reason: ProbeUnbridgeableReason };

export type ProbeUnbridgeableReason =
  | 'noLegalOptions'
  | 'applyThrewIllegal'
  | 'nextFrameHadNoLegal'
  | 'depthExhausted';

export const MICROTURN_PROBE_DEPTH_BUDGET = 3 as const;

const legalOptions = (request: ChoicePendingRequest): readonly ChoiceOption[] =>
  request.options.filter((option) => option.legality !== 'illegal');

const stableValueKey = (value: MoveParamScalar | readonly MoveParamScalar[]): string =>
  JSON.stringify(Array.isArray(value)
    ? value.map((entry) => [typeof entry, entry])
    : [typeof value, value]);

const cacheKey = (
  ctx: ProbeContext,
  request: ChoicePendingRequest,
  value: MoveParamScalar | readonly MoveParamScalar[],
): string =>
  [
    'probe',
    String(ctx.state.stateHash),
    String(ctx.move.actionId),
    String(request.decisionPath ?? 'main'),
    String(request.decisionKey),
    stableValueKey(value),
    String(ctx.depthBudget),
  ].join(':');

const withResolvedDecisionValue = (
  move: Move,
  request: ChoicePendingRequest,
  value: MoveParamScalar | readonly MoveParamScalar[],
): Move => {
  if (request.decisionPath === 'compound.specialActivity') {
    if (move.compound === undefined) {
      return move;
    }
    return {
      ...move,
      compound: {
        ...move.compound,
        specialActivity: {
          ...move.compound.specialActivity,
          params: {
            ...move.compound.specialActivity.params,
            [request.decisionKey]: value,
          },
        },
      },
    };
  }
  return {
    ...move,
    params: {
      ...move.params,
      [request.decisionKey]: value,
    },
  };
};

const probeBridge = (
  ctx: ProbeContext,
  request: ChoicePendingRequest,
  value: MoveParamScalar | readonly MoveParamScalar[],
): boolean => {
  if (ctx.depthBudget <= 0) {
    return true;
  }
  const suspendedFrame = request.suspendedFrame;
  if (suspendedFrame === undefined) {
    return true;
  }

  const key = cacheKey(ctx, request, value);
  const cached = ctx.runtime.publicationProbeCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const bridgeable = (() => {
    try {
      const move = withResolvedDecisionValue(ctx.move, request, value);
      const continuation = resumeSuspendedEffectFrame(ctx.def, suspendedFrame, move, ctx.runtime);
      if (continuation.illegal !== undefined) {
        return false;
      }
      if (continuation.nextDecision === undefined) {
        return continuation.complete;
      }
      return isBridgeableNextDecision(
        {
          ...ctx,
          move: continuation.move,
          depthBudget: ctx.depthBudget - 1,
        },
        continuation.nextDecision,
      );
    } catch {
      return false;
    }
  })();

  ctx.runtime.publicationProbeCache.set(key, bridgeable);
  return bridgeable;
};

const isBridgeableChooseOne = (
  ctx: ProbeContext,
  request: ChoicePendingChooseOneRequest,
): boolean => {
  const options = legalOptions(request);
  return options.length > 0
    && options.some((option) =>
      !Array.isArray(option.value)
      && probeBridge(ctx, request, option.value));
};

const isBridgeableChooseN = (
  ctx: ProbeContext,
  request: ChoicePendingChooseNRequest,
): boolean => {
  const selectedKeys = new Set(request.selected.map((value) => stableValueKey(value)));
  const legalAdd = legalOptions(request)
    .filter((option) => !Array.isArray(option.value))
    .filter((option) => !selectedKeys.has(stableValueKey(option.value as MoveParamScalar)));
  const hasLegalAddThatBridges = legalAdd.some((option) =>
    probeBridge(ctx, request, [...request.selected, option.value as MoveParamScalar]));
  if (hasLegalAddThatBridges) {
    return true;
  }
  return request.canConfirm && probeBridge(ctx, request, request.selected);
};

export const isBridgeableNextDecision = (
  ctx: ProbeContext,
  request: ChoicePendingRequest,
): boolean => {
  if (ctx.depthBudget <= 0) {
    return true;
  }
  switch (request.type) {
    case 'chooseOne':
      return isBridgeableChooseOne(ctx, request);
    case 'chooseN':
      return isBridgeableChooseN(ctx, request);
  }
};
