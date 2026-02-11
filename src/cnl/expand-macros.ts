import { asZoneId } from '../kernel/branded.js';
import type { Diagnostic } from '../kernel/diagnostics.js';
import type { ZoneDef } from '../kernel/types.js';

const GRID_MIN = 1;
const HEX_MIN = 0;

export interface MacroExpansionResult {
  readonly zones: readonly ZoneDef[];
  readonly diagnostics: readonly Diagnostic[];
}

function baseZone(id: string, adjacentTo: readonly string[]): ZoneDef {
  const sortedAdjacentTo = [...adjacentTo].sort((left, right) => left.localeCompare(right));
  return {
    id: asZoneId(id),
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
    adjacentTo: sortedAdjacentTo.map((zoneId) => asZoneId(zoneId)),
  };
}

function encodeHexCoordinate(value: number): string {
  return value < 0 ? `n${Math.abs(value)}` : String(value);
}

function makeMacroDiagnostic(
  path: string,
  message: string,
  suggestion: string,
  alternatives?: readonly string[],
): Diagnostic {
  const diagnostic: Diagnostic = {
    code: 'CNL_BOARD_MACRO_INVALID_ARGUMENT',
    path,
    severity: 'error',
    message,
    suggestion,
  };

  if (alternatives !== undefined) {
    return { ...diagnostic, alternatives };
  }

  return diagnostic;
}

function validateGrid(rows: number, cols: number, path: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!Number.isInteger(rows) || rows < GRID_MIN) {
    diagnostics.push(
      makeMacroDiagnostic(
        `${path}.args[0]`,
        `grid(rows, cols) requires rows to be an integer >= ${GRID_MIN}; received ${rows}.`,
        `Pass an integer rows value >= ${GRID_MIN}.`,
      ),
    );
  }

  if (!Number.isInteger(cols) || cols < GRID_MIN) {
    diagnostics.push(
      makeMacroDiagnostic(
        `${path}.args[1]`,
        `grid(rows, cols) requires cols to be an integer >= ${GRID_MIN}; received ${cols}.`,
        `Pass an integer cols value >= ${GRID_MIN}.`,
      ),
    );
  }

  return diagnostics;
}

function validateHex(radius: number, path: string): readonly Diagnostic[] {
  if (Number.isInteger(radius) && radius >= HEX_MIN) {
    return [];
  }

  return [
    makeMacroDiagnostic(
      `${path}.args[0]`,
      `hex(radius) requires radius to be an integer >= ${HEX_MIN}; received ${radius}.`,
      `Pass an integer radius value >= ${HEX_MIN}.`,
    ),
  ];
}

export function generateGrid(rows: number, cols: number): readonly ZoneDef[] {
  const zones: ZoneDef[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const adjacentTo: string[] = [];

      if (row > 0) {
        adjacentTo.push(`cell_${row - 1}_${col}`);
      }
      if (col + 1 < cols) {
        adjacentTo.push(`cell_${row}_${col + 1}`);
      }
      if (row + 1 < rows) {
        adjacentTo.push(`cell_${row + 1}_${col}`);
      }
      if (col > 0) {
        adjacentTo.push(`cell_${row}_${col - 1}`);
      }

      zones.push(baseZone(`cell_${row}_${col}`, adjacentTo));
    }
  }

  return zones;
}

export function generateHex(radius: number): readonly ZoneDef[] {
  const axialCoords: Array<{ readonly q: number; readonly r: number }> = [];

  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (Math.abs(q + r) <= radius) {
        axialCoords.push({ q, r });
      }
    }
  }

  const idByCoord = new Map<string, string>();
  for (const coord of axialCoords) {
    idByCoord.set(
      `${coord.q},${coord.r}`,
      `hex_${encodeHexCoordinate(coord.q)}_${encodeHexCoordinate(coord.r)}`,
    );
  }

  const directions: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];

  return axialCoords.map((coord) => {
    const adjacentTo = directions
      .map(([dq, dr]) => idByCoord.get(`${coord.q + dq},${coord.r + dr}`))
      .filter((candidate): candidate is string => candidate !== undefined);

    const id = idByCoord.get(`${coord.q},${coord.r}`);
    if (id === undefined) {
      throw new Error('Hex coordinate map missing generated id.');
    }

    return baseZone(id, adjacentTo);
  });
}

export function expandBoardMacro(
  name: string,
  args: readonly number[],
  path = 'boardMacro',
): MacroExpansionResult {
  if (name === 'grid') {
    const [rows, cols] = args;
    const rowsValue = rows ?? Number.NaN;
    const colsValue = cols ?? Number.NaN;
    const diagnostics = validateGrid(rowsValue, colsValue, path);
    if (diagnostics.length > 0) {
      return { zones: [], diagnostics };
    }
    return { zones: generateGrid(rowsValue, colsValue), diagnostics: [] };
  }

  if (name === 'hex') {
    const radius = args[0] ?? Number.NaN;
    const diagnostics = validateHex(radius, path);
    if (diagnostics.length > 0) {
      return { zones: [], diagnostics };
    }
    return { zones: generateHex(radius), diagnostics: [] };
  }

  return {
    zones: [],
    diagnostics: [
      {
        code: 'CNL_BOARD_MACRO_UNKNOWN',
        path: `${path}.name`,
        severity: 'error',
        message: `Unknown board macro \"${name}\".`,
        suggestion: 'Use a supported macro name.',
        alternatives: ['grid', 'hex'],
      },
    ],
  };
}
