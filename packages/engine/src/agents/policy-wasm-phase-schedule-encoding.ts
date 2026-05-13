import type { PolicyBytecode } from '../cnl/policy-bytecode/index.js';
import { stablePayloadCode, stableStringCode } from '../cnl/policy-bytecode/feature-table.js';
import type { EncodedStateLayout, GameDef, GameState } from '../kernel/index.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import type { PolicyValue } from './policy-surface.js';

interface PolicyWasmPhaseScheduleContext {
  readonly def: GameDef;
  readonly layout: EncodedStateLayout;
  readonly state: GameState;
  readonly playerId?: number;
  readonly gameDefRuntime?: GameDefRuntime;
}

type FeatureRef = PolicyBytecode['featureTable']['refs'][number];

const phaseSequenceIndex = (def: GameDef, phaseId: string): number =>
  def.turnStructure.phases.findIndex((phase) => String(phase.id) === phaseId);

const phaseBoundaryTargetIndex = (
  def: GameDef,
  boundary: NonNullable<GameDef['phaseBoundaries']>[number],
): number => {
  if (boundary.kind !== 'phaseEntry' && boundary.kind !== 'phaseExit') {
    return -1;
  }
  if (boundary.phaseId === undefined) {
    return -1;
  }
  return phaseSequenceIndex(def, String(boundary.phaseId));
};

const resolvePhaseIntrinsic = (
  ref: FeatureRef,
  context: PolicyWasmPhaseScheduleContext,
): PolicyValue => {
  const nameCode = ref.aux[0];
  if (nameCode === 0) {
    return String(context.state.currentPhase);
  }
  if (nameCode !== 1) {
    return undefined;
  }
  const currentIndex = phaseSequenceIndex(context.def, String(context.state.currentPhase));
  if (currentIndex < 0 || currentIndex >= context.def.turnStructure.phases.length - 1) {
    return undefined;
  }
  return String(context.def.turnStructure.phases[currentIndex + 1]!.id);
};

const resolveNextBoundaryId = (context: PolicyWasmPhaseScheduleContext): PolicyValue => {
  const boundaries = context.def.phaseBoundaries ?? [];
  const currentIndex = phaseSequenceIndex(context.def, String(context.state.currentPhase));
  for (const boundary of boundaries) {
    const targetIndex = phaseBoundaryTargetIndex(context.def, boundary);
    if (targetIndex < 0) {
      continue;
    }
    if (currentIndex < 0 || targetIndex >= currentIndex) {
      return String(boundary.id);
    }
  }
  return undefined;
};

const scheduleUnitFromCode = (code: number): 'cards' | 'microturns' | 'actions' | 'turns' | 'rounds' | undefined => {
  switch (code) {
    case 0:
      return 'cards';
    case 1:
      return 'microturns';
    case 2:
      return 'actions';
    case 3:
      return 'turns';
    case 4:
      return 'rounds';
    default:
      return undefined;
  }
};

const resolveScheduleDistance = (
  ref: FeatureRef,
  context: PolicyWasmPhaseScheduleContext,
): PolicyValue => {
  const targetCode = ref.aux[0];
  if (targetCode === 0 && ref.aux[2] === -1) {
    return resolveNextBoundaryId(context);
  }
  if (targetCode !== 1) {
    return undefined;
  }
  const unit = scheduleUnitFromCode(ref.aux[2] ?? -1);
  if (unit === undefined || context.gameDefRuntime === undefined) {
    return undefined;
  }
  const boundary = [...context.gameDefRuntime.scheduleIndex.boundaries.values()]
    .find((entry) => stableStringCode(entry.definition.id) === ref.aux[1]);
  const cardDrawState = boundary?.cardDrawState;
  if (boundary === undefined || cardDrawState === undefined) {
    return undefined;
  }
  const deck = (context.def.eventDecks ?? []).find((entry) => entry.id === cardDrawState.deckId);
  const drawZoneVisibility = context.def.zones.find((zone) => String(zone.id) === deck?.drawZone)?.visibility;
  if (drawZoneVisibility !== 'public') {
    return undefined;
  }
  const nextPosition = cardDrawState.triggeringCardPositions.find(
    (position) => position > cardDrawState.currentDrawPosition,
  );
  if (nextPosition === undefined) {
    return undefined;
  }
  const cardDistance = nextPosition - cardDrawState.currentDrawPosition;
  if (unit === 'cards') {
    return cardDistance;
  }
  const rate = boundary.definition.schedule?.kind === 'cardDraw'
    ? boundary.definition.schedule.unitRates?.[unit]
    : undefined;
  return rate === undefined ? undefined : cardDistance * rate;
};

export const encodeWasmPhaseScheduleValue = (
  ref: FeatureRef,
  context: PolicyWasmPhaseScheduleContext,
): readonly [number, number] | undefined => {
  const value = ref.kind === 'phaseIntrinsic'
    ? resolvePhaseIntrinsic(ref, context)
    : ref.kind === 'scheduleDistance'
      ? resolveScheduleDistance(ref, context)
      : undefined;
  if (value === undefined && ref.kind !== 'phaseIntrinsic' && ref.kind !== 'scheduleDistance') {
    return undefined;
  }
  if (typeof value === 'string') {
    return [1, stablePayloadCode({ literal: value })];
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return [1, value];
  }
  if (typeof value === 'boolean') {
    return [value ? 3 : 2, value ? 1 : 0];
  }
  return [0, 0];
};
