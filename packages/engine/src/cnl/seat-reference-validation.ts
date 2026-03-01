import type { PieceCatalogPayload, ScenarioPayload } from '../kernel/types.js';
import { normalizeIdentifier } from './validate-spec-shared.js';

export interface InvalidSeatReference {
  readonly path: string;
  readonly seat: string;
  readonly fieldLabel:
    | 'pieceCatalog.payload.pieceTypes[*].seat'
    | 'pieceCatalog.payload.inventory[*].seat'
    | 'scenario.payload.initialPlacements[*].seat'
    | 'scenario.payload.outOfPlay[*].seat'
    | 'scenario.payload.seatPools[*].seat';
}

interface CollectInvalidSeatReferencesInput {
  readonly canonicalSeatIds: readonly string[];
  readonly pieceCatalog?: {
    readonly payload: PieceCatalogPayload;
    readonly path: string;
  };
  readonly scenario?: {
    readonly payload: ScenarioPayload;
    readonly path: string;
  };
}

export function collectInvalidSeatReferences({
  canonicalSeatIds,
  pieceCatalog,
  scenario,
}: CollectInvalidSeatReferencesInput): readonly InvalidSeatReference[] {
  if (canonicalSeatIds.length === 0) {
    return [];
  }

  const canonicalSet = new Set(canonicalSeatIds.map((seatId) => normalizeIdentifier(seatId)));
  const issues: InvalidSeatReference[] = [];

  const pushIfInvalid = (path: string, seat: string, fieldLabel: InvalidSeatReference['fieldLabel']): void => {
    const normalizedSeat = normalizeIdentifier(seat);
    if (normalizedSeat.length === 0 || canonicalSet.has(normalizedSeat)) {
      return;
    }
    issues.push({
      path,
      seat: normalizedSeat,
      fieldLabel,
    });
  };

  if (pieceCatalog !== undefined) {
    for (const [index, pieceType] of pieceCatalog.payload.pieceTypes.entries()) {
      pushIfInvalid(
        `${pieceCatalog.path}.pieceTypes.${index}.seat`,
        pieceType.seat,
        'pieceCatalog.payload.pieceTypes[*].seat',
      );
    }

    for (const [index, inventoryEntry] of pieceCatalog.payload.inventory.entries()) {
      pushIfInvalid(
        `${pieceCatalog.path}.inventory.${index}.seat`,
        inventoryEntry.seat,
        'pieceCatalog.payload.inventory[*].seat',
      );
    }
  }

  if (scenario !== undefined) {
    for (const [index, placement] of (scenario.payload.initialPlacements ?? []).entries()) {
      pushIfInvalid(
        `${scenario.path}.initialPlacements.${index}.seat`,
        placement.seat,
        'scenario.payload.initialPlacements[*].seat',
      );
    }

    for (const [index, outOfPlay] of (scenario.payload.outOfPlay ?? []).entries()) {
      pushIfInvalid(
        `${scenario.path}.outOfPlay.${index}.seat`,
        outOfPlay.seat,
        'scenario.payload.outOfPlay[*].seat',
      );
    }

    for (const [index, seatPool] of (scenario.payload.seatPools ?? []).entries()) {
      pushIfInvalid(
        `${scenario.path}.seatPools.${index}.seat`,
        seatPool.seat,
        'scenario.payload.seatPools[*].seat',
      );
    }
  }

  return issues;
}
