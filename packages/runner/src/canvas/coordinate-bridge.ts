import type { Viewport } from 'pixi-viewport';

import type { Position } from './geometry';

interface WorldBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface CoordinateBridge {
  canvasToScreen(worldPos: Position): Position;
  screenToCanvas(screenPos: Position): Position;
  canvasBoundsToScreenRect(canvasBounds: WorldBounds): ScreenRect;
  worldBoundsToScreenRect(worldBounds: WorldBounds): ScreenRect;
}

export function createCoordinateBridge(
  viewport: Viewport,
  canvasElement: HTMLCanvasElement,
): CoordinateBridge {
  return {
    canvasToScreen(worldPos: Position): Position {
      assertPosition(worldPos, 'worldPos');
      const point = viewport.toGlobal(worldPos);
      const rect = canvasElement.getBoundingClientRect();
      return {
        x: point.x + rect.left,
        y: point.y + rect.top,
      };
    },

    screenToCanvas(screenPos: Position): Position {
      assertPosition(screenPos, 'screenPos');
      const rect = canvasElement.getBoundingClientRect();
      const point = viewport.toLocal({
        x: screenPos.x - rect.left,
        y: screenPos.y - rect.top,
      });
      return {
        x: point.x,
        y: point.y,
      };
    },

    canvasBoundsToScreenRect(canvasBounds: WorldBounds): ScreenRect {
      assertWorldBounds(canvasBounds);
      const rect = canvasElement.getBoundingClientRect();
      const left = canvasBounds.x + rect.left;
      const top = canvasBounds.y + rect.top;
      const right = left + canvasBounds.width;
      const bottom = top + canvasBounds.height;
      return createScreenRect(left, top, right, bottom);
    },

    worldBoundsToScreenRect(worldBounds: WorldBounds): ScreenRect {
      assertWorldBounds(worldBounds);
      const corners: readonly Position[] = [
        { x: worldBounds.x, y: worldBounds.y },
        { x: worldBounds.x + worldBounds.width, y: worldBounds.y },
        { x: worldBounds.x, y: worldBounds.y + worldBounds.height },
        { x: worldBounds.x + worldBounds.width, y: worldBounds.y + worldBounds.height },
      ];

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const corner of corners) {
        const point = this.canvasToScreen(corner);
        if (point.x < minX) {
          minX = point.x;
        }
        if (point.y < minY) {
          minY = point.y;
        }
        if (point.x > maxX) {
          maxX = point.x;
        }
        if (point.y > maxY) {
          maxY = point.y;
        }
      }

      return createScreenRect(minX, minY, maxX, maxY);
    },
  };
}

function assertPosition(position: Position, label: 'worldPos' | 'screenPos'): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error(`${label} must contain finite numbers`);
  }
}

function assertWorldBounds(bounds: WorldBounds): void {
  if (!Number.isFinite(bounds.x)
    || !Number.isFinite(bounds.y)
    || !Number.isFinite(bounds.width)
    || !Number.isFinite(bounds.height)
  ) {
    throw new Error('world bounds must contain finite numbers');
  }

  if (bounds.width < 0 || bounds.height < 0) {
    throw new Error('world bounds width/height must be non-negative');
  }
}

function createScreenRect(left: number, top: number, right: number, bottom: number): ScreenRect {
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    left,
    top,
    right,
    bottom,
  };
}
