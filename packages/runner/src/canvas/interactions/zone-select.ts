import type { Container, FederatedPointerEvent } from 'pixi.js';
import type { HoveredCanvasTarget } from '../hover-anchor-contract.js';

const DRAG_INTENT_THRESHOLD_PX = 5;

type PointerEventLike = Pick<FederatedPointerEvent, 'global'>;

export function attachZoneSelectHandlers(
  zoneContainer: Container,
  zoneId: string,
  isSelectable: () => boolean,
  dispatcher: (target: { readonly type: 'zone'; readonly id: string }) => void,
  options: {
    readonly onHoverEnter?: (target: HoveredCanvasTarget) => void;
    readonly onHoverLeave?: (target: HoveredCanvasTarget) => void;
  } = {},
): () => void {
  const hoverTarget: HoveredCanvasTarget = { kind: 'zone', id: zoneId };
  let pointerDown = false;
  let dragIntent = false;
  let hoverActive = false;
  let pointerDownX = 0;
  let pointerDownY = 0;

  const onPointerDown = (event: PointerEventLike): void => {
    pointerDown = true;
    dragIntent = false;
    pointerDownX = event.global.x;
    pointerDownY = event.global.y;
  };

  const onPointerMove = (event: PointerEventLike): void => {
    if (!pointerDown || dragIntent) {
      return;
    }

    const dx = event.global.x - pointerDownX;
    const dy = event.global.y - pointerDownY;
    if (Math.hypot(dx, dy) > DRAG_INTENT_THRESHOLD_PX) {
      dragIntent = true;
    }
  };

  const onPointerUp = (): void => {
    const shouldDispatch = pointerDown && !dragIntent && isSelectable();
    pointerDown = false;
    dragIntent = false;

    if (!shouldDispatch) {
      return;
    }

    dispatcher({ type: 'zone', id: zoneId });
  };

  const onPointerOver = (): void => {
    if (hoverActive) {
      return;
    }
    hoverActive = true;
    zoneContainer.cursor = isSelectable() ? 'pointer' : 'default';
    options.onHoverEnter?.(hoverTarget);
  };

  const onPointerOut = (): void => {
    if (!hoverActive) {
      pointerDown = false;
      dragIntent = false;
      zoneContainer.cursor = 'default';
      return;
    }
    hoverActive = false;
    zoneContainer.cursor = 'default';
    pointerDown = false;
    dragIntent = false;
    options.onHoverLeave?.(hoverTarget);
  };

  zoneContainer.eventMode = 'static';
  zoneContainer.interactiveChildren = false;
  zoneContainer.on('pointerdown', onPointerDown);
  zoneContainer.on('pointermove', onPointerMove);
  zoneContainer.on('pointerup', onPointerUp);
  zoneContainer.on('pointerupoutside', onPointerOut);
  zoneContainer.on('pointerenter', onPointerOver);
  zoneContainer.on('pointerleave', onPointerOut);

  return (): void => {
    zoneContainer.off('pointerdown', onPointerDown);
    zoneContainer.off('pointermove', onPointerMove);
    zoneContainer.off('pointerup', onPointerUp);
    zoneContainer.off('pointerupoutside', onPointerOut);
    zoneContainer.off('pointerenter', onPointerOver);
    zoneContainer.off('pointerleave', onPointerOut);
    zoneContainer.cursor = 'default';
  };
}
