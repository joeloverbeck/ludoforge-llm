import type {
  RunnerAdjacency,
  RunnerMarker,
  RunnerToken,
  RunnerZone,
} from '../model/runner-frame.js';

export type ZoneVisualComparator = (prev: RunnerZone, next: RunnerZone) => boolean;
export type TokenVisualComparator = (prev: RunnerToken, next: RunnerToken) => boolean;
export type AdjacencyVisualComparator = (prev: RunnerAdjacency, next: RunnerAdjacency) => boolean;

export interface CanvasEqualityComparators {
  zonesVisuallyEqual(prev: readonly RunnerZone[], next: readonly RunnerZone[]): boolean;
  tokensVisuallyEqual(prev: readonly RunnerToken[], next: readonly RunnerToken[]): boolean;
  adjacenciesVisuallyEqual(prev: readonly RunnerAdjacency[], next: readonly RunnerAdjacency[]): boolean;
}

export interface CanvasEqualityComparatorOverrides {
  readonly zoneComparator?: ZoneVisualComparator;
  readonly tokenComparator?: TokenVisualComparator;
  readonly adjacencyComparator?: AdjacencyVisualComparator;
}

export function createCanvasEqualityComparators(
  overrides: CanvasEqualityComparatorOverrides = {},
): CanvasEqualityComparators {
  const zoneComparator = overrides.zoneComparator ?? zonesVisuallyEqualItem;
  const tokenComparator = overrides.tokenComparator ?? tokensVisuallyEqualItem;
  const adjacencyComparator = overrides.adjacencyComparator ?? adjacenciesVisuallyEqualItem;

  return {
    zonesVisuallyEqual(prev: readonly RunnerZone[], next: readonly RunnerZone[]): boolean {
      return orderedArrayEqual(prev, next, zoneComparator);
    },
    tokensVisuallyEqual(prev: readonly RunnerToken[], next: readonly RunnerToken[]): boolean {
      return orderedArrayEqual(prev, next, tokenComparator);
    },
    adjacenciesVisuallyEqual(prev: readonly RunnerAdjacency[], next: readonly RunnerAdjacency[]): boolean {
      return orderedArrayEqual(prev, next, adjacencyComparator);
    },
  };
}

const DEFAULT_CANVAS_EQUALITY_COMPARATORS = createCanvasEqualityComparators();

export function zonesVisuallyEqual(
  prev: readonly RunnerZone[],
  next: readonly RunnerZone[],
): boolean {
  return DEFAULT_CANVAS_EQUALITY_COMPARATORS.zonesVisuallyEqual(prev, next);
}

export function tokensVisuallyEqual(
  prev: readonly RunnerToken[],
  next: readonly RunnerToken[],
): boolean {
  return DEFAULT_CANVAS_EQUALITY_COMPARATORS.tokensVisuallyEqual(prev, next);
}

export function adjacenciesVisuallyEqual(
  prev: readonly RunnerAdjacency[],
  next: readonly RunnerAdjacency[],
): boolean {
  return DEFAULT_CANVAS_EQUALITY_COMPARATORS.adjacenciesVisuallyEqual(prev, next);
}

function zonesVisuallyEqualItem(previous: RunnerZone, current: RunnerZone): boolean {
  return (
    previous.id === current.id
    && previous.ordering === current.ordering
    && previous.visibility === current.visibility
    && previous.ownerID === current.ownerID
    && previous.category === current.category
    && previous.isSelectable === current.isSelectable
    && previous.isHighlighted === current.isHighlighted
    && previous.hiddenTokenCount === current.hiddenTokenCount
    && stringArraysEqual(previous.tokenIDs, current.tokenIDs)
    && markersEqual(previous.markers, current.markers)
  );
}

function tokensVisuallyEqualItem(previous: RunnerToken, current: RunnerToken): boolean {
  return (
    previous.id === current.id
    && previous.type === current.type
    && previous.zoneID === current.zoneID
    && previous.ownerID === current.ownerID
    && previous.factionId === current.factionId
    && previous.faceUp === current.faceUp
    && previous.isSelectable === current.isSelectable
    && previous.isSelected === current.isSelected
  );
}

function adjacenciesVisuallyEqualItem(previous: RunnerAdjacency, current: RunnerAdjacency): boolean {
  return (
    previous.from === current.from
    && previous.to === current.to
    && previous.category === current.category
    && previous.isHighlighted === current.isHighlighted
  );
}

function orderedArrayEqual<T>(
  prev: readonly T[],
  next: readonly T[],
  itemComparator: (previous: T, current: T) => boolean,
): boolean {
  if (prev === next) {
    return true;
  }

  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index += 1) {
    const previous = prev[index];
    const current = next[index];

    if (previous === undefined || current === undefined) {
      return false;
    }

    if (!itemComparator(previous, current)) {
      return false;
    }
  }

  return true;
}

function stringArraysEqual(prev: readonly string[], next: readonly string[]): boolean {
  if (prev === next) {
    return true;
  }

  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index] !== next[index]) {
      return false;
    }
  }

  return true;
}

function markersEqual(prev: readonly RunnerMarker[], next: readonly RunnerMarker[]): boolean {
  if (prev === next) {
    return true;
  }

  if (prev.length !== next.length) {
    return false;
  }

  for (let index = 0; index < prev.length; index += 1) {
    const previous = prev[index];
    const current = next[index];

    if (previous === undefined || current === undefined) {
      return false;
    }

    if (
      previous.id !== current.id
      || previous.state !== current.state
    ) {
      return false;
    }
  }

  return true;
}
