import type { ScreenRect } from './coordinate-bridge.js';

export type HoveredCanvasTarget =
  | { readonly kind: 'zone'; readonly id: string }
  | { readonly kind: 'token'; readonly id: string };

export interface CanvasWorldBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface HoverAnchorBase {
  readonly target: HoveredCanvasTarget;
  readonly version: number;
}

export type HoverAnchor =
  | (HoverAnchorBase & {
    readonly rect: CanvasWorldBounds;
    readonly space: 'world';
  })
  | (HoverAnchorBase & {
    readonly rect: ScreenRect;
    readonly space: 'screen';
  });
