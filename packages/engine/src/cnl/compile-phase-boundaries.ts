import type { Diagnostic } from '../kernel/diagnostics.js';
import type { EventDeckDef, PhaseBoundaryDef, TurnStructure } from '../kernel/types.js';
import { asBoundaryId, asPhaseId } from '../kernel/branded.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type { GameSpecPhaseBoundaryDef } from './game-spec-doc.js';

const NON_CARD_SCHEDULE_DISTANCE_UNITS = ['microturns', 'actions', 'turns', 'rounds'] as const;

export interface PhaseBoundaryValidationContext {
  readonly phaseBoundaries: readonly PhaseBoundaryDef[];
  readonly phaseIds: ReadonlySet<string>;
  readonly phaseEntryBoundaryPhaseIds: ReadonlySet<string>;
}

export function lowerPhaseBoundaries(
  rawBoundaries: readonly GameSpecPhaseBoundaryDef[] | null | undefined,
  turnStructure: TurnStructure | null,
  eventDecks: readonly EventDeckDef[] | null,
  diagnostics: Diagnostic[],
): readonly PhaseBoundaryDef[] | null {
  if (rawBoundaries == null) {
    return null;
  }

  const phaseIds = collectPhaseIds(turnStructure);
  const decksById = new Map((eventDecks ?? []).map((deck) => [deck.id, deck]));
  const seenIds = new Set<string>();
  const lowered: PhaseBoundaryDef[] = [];

  for (const [index, boundary] of rawBoundaries.entries()) {
    const path = `doc.phaseBoundaries.${index}`;
    if (seenIds.has(boundary.id)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_DUPLICATE_ID,
        path: `${path}.id`,
        severity: 'error',
        message: `phaseBoundaries id "${boundary.id}" is declared more than once.`,
        suggestion: 'Use a unique boundary id for each phase boundary declaration.',
      });
    }
    seenIds.add(boundary.id);

    if ((boundary.kind === 'phaseEntry' || boundary.kind === 'phaseExit') && !phaseIds.has(boundary.phaseId ?? '')) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_UNKNOWN_PHASE,
        path: `${path}.phaseId`,
        severity: 'error',
        message: `phase boundary "${boundary.id}" references unknown phase "${boundary.phaseId ?? ''}".`,
        suggestion: 'Reference a phase declared in turnStructure.phases or turnStructure.interrupts.',
      });
    }

    if (boundary.schedule?.kind === 'cardDraw') {
      validateCardDrawSchedule(boundary, path, decksById, diagnostics);
    }

    lowered.push({
      id: asBoundaryId(boundary.id),
      kind: boundary.kind,
      ...(boundary.phaseId === undefined ? {} : { phaseId: asPhaseId(boundary.phaseId) }),
      ...(boundary.schedule === undefined ? {} : { schedule: boundary.schedule }),
    });
  }

  return lowered;
}

export function buildPhaseBoundaryValidationContext(
  phaseBoundaries: readonly PhaseBoundaryDef[] | null | undefined,
  turnStructure: TurnStructure | null,
): PhaseBoundaryValidationContext {
  const boundaries = phaseBoundaries ?? [];
  return {
    phaseBoundaries: boundaries,
    phaseIds: collectPhaseIds(turnStructure),
    phaseEntryBoundaryPhaseIds: new Set(
      boundaries
        .filter((boundary) => boundary.kind === 'phaseEntry' && boundary.phaseId !== undefined)
        .map((boundary) => String(boundary.phaseId)),
    ),
  };
}

export function findPhaseBoundaryById(
  context: PhaseBoundaryValidationContext,
  boundaryId: string,
): PhaseBoundaryDef | undefined {
  return context.phaseBoundaries.find((boundary) => String(boundary.id) === boundaryId);
}

export function scheduleKindSupportsUnit(
  schedule: PhaseBoundaryDef['schedule'] | undefined,
  unit: string,
): boolean {
  switch (schedule?.kind) {
    case 'cardDraw':
      return unit === 'cards' || (
        isNonCardScheduleDistanceUnit(unit)
        && schedule.unitRates?.[unit] !== undefined
      );
    case 'turnCount':
    case 'condition':
    case undefined:
      return false;
  }
}

export function isScheduleDistanceUnit(value: string): boolean {
  return value === 'cards' || value === 'microturns' || value === 'actions' || value === 'turns' || value === 'rounds';
}

function isNonCardScheduleDistanceUnit(value: string): value is typeof NON_CARD_SCHEDULE_DISTANCE_UNITS[number] {
  return NON_CARD_SCHEDULE_DISTANCE_UNITS.some((unit) => unit === value);
}

function validateCardDrawSchedule(
  boundary: GameSpecPhaseBoundaryDef,
  path: string,
  decksById: ReadonlyMap<string, EventDeckDef>,
  diagnostics: Diagnostic[],
): void {
  const schedule = boundary.schedule;
  if (schedule?.kind !== 'cardDraw') {
    return;
  }
  const deck = decksById.get(schedule.deckId);
  if (deck === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_UNKNOWN_DECK,
      path: `${path}.schedule.deckId`,
      severity: 'error',
      message: `phase boundary "${boundary.id}" references unknown event deck "${schedule.deckId}".`,
      suggestion: 'Reference an id declared in eventDecks.',
    });
    return;
  }

  const tags = schedule.cardSelector.tags ?? [];
  const cardIds = schedule.cardSelector.cardIds ?? [];
  if (tags.length === 0 && cardIds.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_EMPTY_CARD_SELECTOR,
      path: `${path}.schedule.cardSelector`,
      severity: 'error',
      message: `phase boundary "${boundary.id}" cardDraw schedule must select at least one card tag or card id.`,
      suggestion: 'Add cardSelector.tags or cardSelector.cardIds.',
    });
  }

  for (const unit of NON_CARD_SCHEDULE_DISTANCE_UNITS) {
    const rate = schedule.unitRates?.[unit];
    if (rate === undefined) {
      continue;
    }
    if (!Number.isInteger(rate) || rate <= 0) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_INVALID_UNIT_RATE,
        path: `${path}.schedule.unitRates.${unit}`,
        severity: 'error',
        message: `phase boundary "${boundary.id}" cardDraw unit rate "${unit}" must be a positive integer.`,
        suggestion: 'Use exact positive integer rates so non-card schedule distance remains deterministic.',
      });
    }
  }

  const knownTags = new Set(deck.cards.flatMap((card) => card.tags ?? []));
  for (const [tagIndex, tag] of tags.entries()) {
    if (!knownTags.has(tag)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_UNKNOWN_CARD_TAG,
        path: `${path}.schedule.cardSelector.tags.${tagIndex}`,
        severity: 'error',
        message: `phase boundary "${boundary.id}" references unknown card tag "${tag}" in deck "${deck.id}".`,
        suggestion: 'Reference a tag declared by at least one card in the deck.',
      });
    }
  }

  const knownCardIds = new Set(deck.cards.map((card) => card.id));
  for (const [cardIndex, cardId] of cardIds.entries()) {
    if (!knownCardIds.has(cardId)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.PHASE_BOUNDARY_UNKNOWN_CARD_ID,
        path: `${path}.schedule.cardSelector.cardIds.${cardIndex}`,
        severity: 'error',
        message: `phase boundary "${boundary.id}" references unknown card id "${cardId}" in deck "${deck.id}".`,
        suggestion: 'Reference a card id declared in the selected deck.',
      });
    }
  }
}

function collectPhaseIds(turnStructure: TurnStructure | null): ReadonlySet<string> {
  return new Set([
    ...(turnStructure?.phases ?? []).map((phase) => String(phase.id)),
    ...(turnStructure?.interrupts ?? []).map((phase) => String(phase.id)),
  ]);
}
