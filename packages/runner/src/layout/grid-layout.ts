import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';

import { centerOnOrigin, computeBounds, EMPTY_BOUNDS, type MutablePosition, selectPrimaryLayoutZones } from './layout-helpers.js';
import type { LayoutResult } from './layout-types.js';

const GRID_SPACING = 140;

export function computeGridLayout(def: GameDef): LayoutResult {
  const gridZones = [...selectPrimaryLayoutZones(def)].sort((left, right) => left.id.localeCompare(right.id));
  if (gridZones.length === 0) {
    return {
      positions: new Map(),
      mode: 'grid',
      boardBounds: EMPTY_BOUNDS,
    };
  }

  const positions = new Map<string, MutablePosition>();
  const occupiedCells = new Set<string>();
  const unattributedZones: ZoneDef[] = [];
  const fallbackColumns = Math.max(1, Math.ceil(Math.sqrt(gridZones.length)));

  for (const zone of gridZones) {
    const row = readNumericAttribute(zone, 'row');
    const col = readNumericAttribute(zone, 'col');
    if (row === null || col === null) {
      unattributedZones.push(zone);
      continue;
    }

    const cellKey = makeCellKey(row, col);
    if (occupiedCells.has(cellKey)) {
      unattributedZones.push(zone);
      continue;
    }

    occupiedCells.add(cellKey);
    positions.set(zone.id, {
      x: col * GRID_SPACING,
      y: row * GRID_SPACING,
    });
  }

  let fallbackIndex = 0;
  for (const zone of unattributedZones) {
    const cell = nextAvailableGridCell(occupiedCells, fallbackIndex, fallbackColumns);
    fallbackIndex = cell.nextIndex;
    positions.set(zone.id, {
      x: cell.col * GRID_SPACING,
      y: cell.row * GRID_SPACING,
    });
  }

  centerOnOrigin(positions);
  return {
    positions,
    mode: 'grid',
    boardBounds: computeBounds(positions),
  };
}

function readNumericAttribute(zone: ZoneDef, key: 'row' | 'col'): number | null {
  const attributes = zone.attributes;
  if (attributes === undefined || attributes === null || typeof attributes !== 'object') {
    return null;
  }

  const record = attributes as Record<string, unknown>;
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function nextAvailableGridCell(
  occupiedCells: Set<string>,
  startIndex: number,
  columns: number,
): { row: number; col: number; nextIndex: number } {
  let index = Math.max(0, startIndex);
  const normalizedColumns = Math.max(1, columns);

  while (true) {
    const row = Math.floor(index / normalizedColumns);
    const col = index % normalizedColumns;
    const cellKey = makeCellKey(row, col);
    index += 1;
    if (occupiedCells.has(cellKey)) {
      continue;
    }
    occupiedCells.add(cellKey);
    return { row, col, nextIndex: index };
  }
}

function makeCellKey(row: number, col: number): string {
  return `${row}:${col}`;
}
