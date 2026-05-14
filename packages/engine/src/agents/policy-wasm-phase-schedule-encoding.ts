import type { PolicyBytecode } from '../cnl/policy-bytecode/index.js';
import { stablePayloadCode, stableStringCode } from '../cnl/policy-bytecode/feature-table.js';
import type { CompiledAgentPolicyRef, EncodedStateLayout, GameDef, GameState, Token } from '../kernel/index.js';
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
type ScheduleBoundaryEntry = GameDefRuntime['scheduleIndex']['boundaries'] extends ReadonlyMap<unknown, infer Entry>
  ? Entry
  : never;

export type PolicyWasmPhaseScheduleResolution =
  | {
      readonly kind: 'ready';
      readonly value: PolicyValue;
    }
  | {
      readonly kind: 'partial';
      readonly partialKind: 'lowerBound';
      readonly lowerBound: number;
    }
  | {
      readonly kind: 'unavailable';
    };

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

const boundaryForScheduleDistanceRef = (
  target: { readonly kind: 'boundary'; readonly boundaryId: unknown },
  context: PolicyWasmPhaseScheduleContext,
): ScheduleBoundaryEntry | undefined => {
  const boundaryId = String(target.boundaryId);
  return [...(context.gameDefRuntime?.scheduleIndex.boundaries.values() ?? [])]
    .find((entry) => String(entry.definition.id) === boundaryId);
};

const boundaryForScheduleDistanceFeature = (
  ref: FeatureRef,
  context: PolicyWasmPhaseScheduleContext,
): ScheduleBoundaryEntry | undefined => [...(context.gameDefRuntime?.scheduleIndex.boundaries.values() ?? [])]
  .find((entry) => stableStringCode(entry.definition.id) === ref.aux[1]);

const readPublicZoneCards = (def: GameDef, state: GameState, zoneId: string): readonly Token[] => {
  const zone = def.zones.find((entry) => String(entry.id) === zoneId);
  if (zone?.visibility !== 'public') {
    return [];
  }
  return state.zones[zoneId] ?? [];
};

const matchesCardSelector = (
  def: GameDef,
  token: Token,
  cardSelector: Extract<NonNullable<NonNullable<GameDef['phaseBoundaries']>[number]['schedule']>, { readonly kind: 'cardDraw' }>['cardSelector'],
): boolean => {
  const tokenId = String(token.id);
  if (cardSelector.cardIds?.includes(tokenId) === true) {
    return true;
  }
  const requestedTags = cardSelector.tags ?? [];
  if (requestedTags.length === 0) {
    return false;
  }
  const card = (def.eventDecks ?? [])
    .flatMap((deck) => deck.cards)
    .find((entry) => entry.id === tokenId);
  return requestedTags.some((tag) => card?.tags?.includes(tag) === true);
};

const resolveVisiblePrefixBoundaryCardDistance = (
  context: PolicyWasmPhaseScheduleContext,
  schedule: Extract<NonNullable<NonNullable<GameDef['phaseBoundaries']>[number]['schedule']>, { readonly kind: 'cardDraw' }>,
): PolicyWasmPhaseScheduleResolution => {
  let distance = 0;
  for (const source of schedule.observerPolicy!.visiblePrefix.sources) {
    const slotCards = readPublicZoneCards(context.def, context.state, source.id);
    const taken = Math.min(source.take, slotCards.length);
    for (let index = 0; index < taken; index += 1) {
      const card = slotCards[index]!;
      if (matchesCardSelector(context.def, card, schedule.cardSelector)) {
        return { kind: 'ready', value: distance };
      }
      distance += 1;
    }
  }
  return { kind: 'partial', partialKind: 'lowerBound', lowerBound: distance };
};

const resolveScheduleDistanceValue = (
  unit: 'cards' | 'microturns' | 'actions' | 'turns' | 'rounds' | undefined,
  boundary: ReturnType<typeof boundaryForScheduleDistanceFeature>,
  context: PolicyWasmPhaseScheduleContext,
): PolicyWasmPhaseScheduleResolution => {
  if (unit === undefined) {
    return { kind: 'unavailable' };
  }
  const cardDrawState = boundary?.cardDrawState;
  if (boundary === undefined || cardDrawState === undefined) {
    return { kind: 'unavailable' };
  }
  const schedule = boundary.definition.schedule;
  if (schedule?.kind === 'cardDraw' && schedule.observerPolicy?.kind === 'topNVisible' && unit === 'cards') {
    return resolveVisiblePrefixBoundaryCardDistance(context, schedule);
  }
  const deck = (context.def.eventDecks ?? []).find((entry) => entry.id === cardDrawState.deckId);
  const drawZoneVisibility = context.def.zones.find((zone) => String(zone.id) === deck?.drawZone)?.visibility;
  if (drawZoneVisibility !== 'public') {
    return { kind: 'unavailable' };
  }
  const nextPosition = cardDrawState.triggeringCardPositions.find(
    (position) => position > cardDrawState.currentDrawPosition,
  );
  if (nextPosition === undefined) {
    return { kind: 'unavailable' };
  }
  const cardDistance = nextPosition - cardDrawState.currentDrawPosition;
  if (unit === 'cards') {
    return { kind: 'ready', value: cardDistance };
  }
  const rate = boundary.definition.schedule?.kind === 'cardDraw'
    ? boundary.definition.schedule.unitRates?.[unit]
    : undefined;
  return rate === undefined ? { kind: 'unavailable' } : { kind: 'ready', value: cardDistance * rate };
};

const resolveScheduleDistance = (
  ref: FeatureRef,
  context: PolicyWasmPhaseScheduleContext,
): PolicyWasmPhaseScheduleResolution => {
  const targetCode = ref.aux[0];
  if (targetCode === 0 && ref.aux[2] === -1) {
    const value = resolveNextBoundaryId(context);
    return value === undefined ? { kind: 'unavailable' } : { kind: 'ready', value };
  }
  if (targetCode !== 1 || context.gameDefRuntime === undefined) {
    return { kind: 'unavailable' };
  }
  return resolveScheduleDistanceValue(
    scheduleUnitFromCode(ref.aux[2] ?? -1),
    boundaryForScheduleDistanceFeature(ref, context),
    context,
  );
};

export const resolveWasmScheduleDistanceRef = (
  ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'scheduleDistance' }>,
  context: PolicyWasmPhaseScheduleContext,
): PolicyWasmPhaseScheduleResolution => {
  if (ref.target.kind === 'nextBoundary') {
    const value = resolveNextBoundaryId(context);
    return value === undefined ? { kind: 'unavailable' } : { kind: 'ready', value };
  }
  return resolveScheduleDistanceValue(
    ref.unit ?? 'cards',
    boundaryForScheduleDistanceRef(ref.target, context),
    context,
  );
};

export const encodeWasmPhaseScheduleValue = (
  ref: FeatureRef,
  context: PolicyWasmPhaseScheduleContext,
): readonly [number, number] | undefined => {
  const resolution = ref.kind === 'scheduleDistance'
    ? resolveScheduleDistance(ref, context)
    : undefined;
  const value = ref.kind === 'phaseIntrinsic'
    ? resolvePhaseIntrinsic(ref, context)
    : resolution?.kind === 'ready'
      ? resolution.value
      : resolution?.kind === 'partial'
        ? resolution.lowerBound
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
