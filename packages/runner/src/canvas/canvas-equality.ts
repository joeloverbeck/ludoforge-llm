import type {
  RenderAdjacency,
  RenderMarker,
  RenderToken,
  RenderZone,
} from '../model/render-model';

export type ZoneVisualComparator = (prev: RenderZone, next: RenderZone) => boolean;
export type TokenVisualComparator = (prev: RenderToken, next: RenderToken) => boolean;
export type AdjacencyVisualComparator = (prev: RenderAdjacency, next: RenderAdjacency) => boolean;

export interface CanvasEqualityComparators {
  zonesVisuallyEqual(prev: readonly RenderZone[], next: readonly RenderZone[]): boolean;
  tokensVisuallyEqual(prev: readonly RenderToken[], next: readonly RenderToken[]): boolean;
  adjacenciesVisuallyEqual(prev: readonly RenderAdjacency[], next: readonly RenderAdjacency[]): boolean;
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
    zonesVisuallyEqual(prev: readonly RenderZone[], next: readonly RenderZone[]): boolean {
      return orderedArrayEqual(prev, next, zoneComparator);
    },
    tokensVisuallyEqual(prev: readonly RenderToken[], next: readonly RenderToken[]): boolean {
      return orderedArrayEqual(prev, next, tokenComparator);
    },
    adjacenciesVisuallyEqual(prev: readonly RenderAdjacency[], next: readonly RenderAdjacency[]): boolean {
      return orderedArrayEqual(prev, next, adjacencyComparator);
    },
  };
}

const DEFAULT_CANVAS_EQUALITY_COMPARATORS = createCanvasEqualityComparators();

export function zonesVisuallyEqual(
  prev: readonly RenderZone[],
  next: readonly RenderZone[],
): boolean {
  return DEFAULT_CANVAS_EQUALITY_COMPARATORS.zonesVisuallyEqual(prev, next);
}

export function tokensVisuallyEqual(
  prev: readonly RenderToken[],
  next: readonly RenderToken[],
): boolean {
  return DEFAULT_CANVAS_EQUALITY_COMPARATORS.tokensVisuallyEqual(prev, next);
}

export function adjacenciesVisuallyEqual(
  prev: readonly RenderAdjacency[],
  next: readonly RenderAdjacency[],
): boolean {
  return DEFAULT_CANVAS_EQUALITY_COMPARATORS.adjacenciesVisuallyEqual(prev, next);
}

function zonesVisuallyEqualItem(previous: RenderZone, current: RenderZone): boolean {
  return (
    previous.id === current.id
    && previous.displayName === current.displayName
    && previous.visibility === current.visibility
    && previous.ownerID === current.ownerID
    && previous.category === current.category
    && isZoneVisualEqual(previous.visual, current.visual)
    && previous.isSelectable === current.isSelectable
    && previous.isHighlighted === current.isHighlighted
    && previous.hiddenTokenCount === current.hiddenTokenCount
    && stringArraysEqual(previous.tokenIDs, current.tokenIDs)
    && markersEqual(previous.markers, current.markers)
  );
}

function tokensVisuallyEqualItem(previous: RenderToken, current: RenderToken): boolean {
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

function adjacenciesVisuallyEqualItem(previous: RenderAdjacency, current: RenderAdjacency): boolean {
  return (
    previous.from === current.from
    && previous.to === current.to
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

function markersEqual(prev: readonly RenderMarker[], next: readonly RenderMarker[]): boolean {
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
      || previous.displayName !== current.displayName
      || previous.state !== current.state
    ) {
      return false;
    }
  }

  return true;
}

function isZoneVisualEqual(previous: RenderZone['visual'], current: RenderZone['visual']): boolean {
  return previous.shape === current.shape
    && previous.width === current.width
    && previous.height === current.height
    && previous.color === current.color;
}
