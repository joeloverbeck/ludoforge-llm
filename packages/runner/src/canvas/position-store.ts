import type { Position } from './geometry';

export interface ZonePositionMap {
  readonly positions: ReadonlyMap<string, Position>;
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export interface PositionStoreSnapshot extends ZonePositionMap {
  readonly zoneIDs: readonly string[];
}

export interface PositionStore {
  getSnapshot(): PositionStoreSnapshot;
  setZoneIDs(zoneIDs: readonly string[]): void;
  setPositions(next: ZonePositionMap, zoneIDs?: readonly string[]): void;
  subscribe(listener: (snapshot: PositionStoreSnapshot) => void): () => void;
}

const EMPTY_BOUNDS: ZonePositionMap['bounds'] = {
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
};

const BASE_ZONE_SIZE = 100;
const ZONE_SIZE_SQRT_FACTOR = 24;
const MIN_MARGIN = 24;
const PADDING_RATIO = 0.5;

export function computeGridLayout(zoneIDs: readonly string[]): ZonePositionMap {
  if (zoneIDs.length === 0) {
    return {
      positions: new Map(),
      bounds: EMPTY_BOUNDS,
    };
  }

  const zoneSize = Math.round(BASE_ZONE_SIZE + Math.sqrt(zoneIDs.length) * ZONE_SIZE_SQRT_FACTOR);
  const margin = Math.max(MIN_MARGIN, Math.round(zoneSize * 0.25));
  const stride = zoneSize + margin;
  const padding = Math.round(zoneSize * PADDING_RATIO);

  const columnCount = Math.ceil(Math.sqrt(zoneIDs.length));
  const positions = new Map<string, Position>();

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < zoneIDs.length; index += 1) {
    const zoneID = zoneIDs[index];
    if (zoneID === undefined) {
      continue;
    }
    const x = (index % columnCount) * stride;
    const y = Math.floor(index / columnCount) * stride;

    positions.set(zoneID, { x, y });

    if (x < minX) {
      minX = x;
    }
    if (y < minY) {
      minY = y;
    }
    if (x > maxX) {
      maxX = x;
    }
    if (y > maxY) {
      maxY = y;
    }
  }

  return {
    positions,
    bounds: {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
    },
  };
}

export function createPositionStore(initialZoneIDs: readonly string[] = []): PositionStore {
  let snapshot = createSnapshot(initialZoneIDs, computeGridLayout(initialZoneIDs));
  const listeners = new Set<(next: PositionStoreSnapshot) => void>();

  return {
    getSnapshot(): PositionStoreSnapshot {
      return snapshot;
    },

    setZoneIDs(zoneIDs: readonly string[]): void {
      const nextSnapshot = createSnapshot(zoneIDs, computeGridLayout(zoneIDs));
      if (snapshotsEqual(snapshot, nextSnapshot)) {
        return;
      }
      snapshot = nextSnapshot;
      notifyListeners(listeners, snapshot);
    },

    setPositions(next: ZonePositionMap, zoneIDs: readonly string[] = snapshot.zoneIDs): void {
      const nextSnapshot = createSnapshot(zoneIDs, next);
      if (snapshotsEqual(snapshot, nextSnapshot)) {
        return;
      }
      snapshot = nextSnapshot;
      notifyListeners(listeners, snapshot);
    },

    subscribe(listener: (next: PositionStoreSnapshot) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createSnapshot(zoneIDs: readonly string[], next: ZonePositionMap): PositionStoreSnapshot {
  return {
    zoneIDs: [...zoneIDs],
    positions: new Map(next.positions),
    bounds: {
      minX: next.bounds.minX,
      minY: next.bounds.minY,
      maxX: next.bounds.maxX,
      maxY: next.bounds.maxY,
    },
  };
}

function snapshotsEqual(prev: PositionStoreSnapshot, next: PositionStoreSnapshot): boolean {
  if (!zoneIDsEqual(prev.zoneIDs, next.zoneIDs)) {
    return false;
  }

  if (!positionsEqual(prev.positions, next.positions)) {
    return false;
  }

  return boundsEqual(prev.bounds, next.bounds);
}

function zoneIDsEqual(prev: readonly string[], next: readonly string[]): boolean {
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

function positionsEqual(prev: ReadonlyMap<string, Position>, next: ReadonlyMap<string, Position>): boolean {
  if (prev.size !== next.size) {
    return false;
  }

  for (const [id, position] of prev) {
    const candidate = next.get(id);
    if (candidate === undefined) {
      return false;
    }

    if (candidate.x !== position.x || candidate.y !== position.y) {
      return false;
    }
  }

  return true;
}

function boundsEqual(prev: ZonePositionMap['bounds'], next: ZonePositionMap['bounds']): boolean {
  return (
    prev.minX === next.minX
    && prev.minY === next.minY
    && prev.maxX === next.maxX
    && prev.maxY === next.maxY
  );
}

function notifyListeners(
  listeners: ReadonlySet<(snapshot: PositionStoreSnapshot) => void>,
  next: PositionStoreSnapshot,
): void {
  for (const listener of listeners) {
    listener(next);
  }
}
