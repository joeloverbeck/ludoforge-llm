import { Graphics } from 'pixi.js';

export const DRAGGABLE_HANDLE_RADIUS = 7;
export const DRAGGABLE_HANDLE_HOVER_RADIUS = 10;
export const DRAGGABLE_GLOW_RADIUS = 14;
export const DRAGGABLE_GLOW_ALPHA = 0.3;
export const MIDPOINT_HANDLE_RADIUS = 5;
export const DRAGGABLE_HANDLE_COLOR = 0xf59e0b; // amber
export const MIDPOINT_HANDLE_COLOR = 0x60a5fa; // blue
export const MIDPOINT_HANDLE_ALPHA = 0.5;
export const DOUBLE_CLICK_MS = 300;

export function drawDraggableHandleState(g: Graphics, hovered: boolean): void {
  g.clear();
  if (hovered) {
    g.circle(0, 0, DRAGGABLE_GLOW_RADIUS)
      .fill({ color: DRAGGABLE_HANDLE_COLOR, alpha: DRAGGABLE_GLOW_ALPHA });
    g.circle(0, 0, DRAGGABLE_HANDLE_HOVER_RADIUS)
      .fill({ color: DRAGGABLE_HANDLE_COLOR })
      .stroke({ color: 0xffffff, width: 1.5 });
  } else {
    g.circle(0, 0, DRAGGABLE_HANDLE_RADIUS)
      .fill({ color: DRAGGABLE_HANDLE_COLOR })
      .stroke({ color: 0xffffff, width: 1.5 });
  }
}

export function createDraggableHandle(x: number, y: number): Graphics {
  const g = new Graphics();
  drawDraggableHandleState(g, false);
  g.position.set(x, y);
  g.eventMode = 'static';
  g.cursor = 'grab';
  g.on('pointerover', () => drawDraggableHandleState(g, true));
  g.on('pointerout', () => drawDraggableHandleState(g, false));
  return g;
}

export function createMidpointHandle(x: number, y: number): Graphics {
  const g = new Graphics();
  g.circle(0, 0, MIDPOINT_HANDLE_RADIUS)
    .fill({ color: MIDPOINT_HANDLE_COLOR, alpha: MIDPOINT_HANDLE_ALPHA })
    .stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
  g.position.set(x, y);
  g.eventMode = 'static';
  g.cursor = 'pointer';
  return g;
}
