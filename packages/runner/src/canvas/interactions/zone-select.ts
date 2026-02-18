import type { Container, FederatedPointerEvent } from 'pixi.js';

const DRAG_INTENT_THRESHOLD_PX = 5;

type PointerEventLike = Pick<FederatedPointerEvent, 'global'>;

export function attachZoneSelectHandlers(
  zoneContainer: Container,
  zoneId: string,
  isSelectable: () => boolean,
  dispatcher: (target: { readonly type: 'zone'; readonly id: string }) => void,
  options: {
    readonly onHoverChange?: (isHovered: boolean) => void;
  } = {},
): () => void {
  let pointerDown = false;
  let dragIntent = false;
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
    zoneContainer.cursor = isSelectable() ? 'pointer' : 'default';
    options.onHoverChange?.(true);
  };

  const onPointerOut = (): void => {
    zoneContainer.cursor = 'default';
    pointerDown = false;
    dragIntent = false;
    options.onHoverChange?.(false);
  };

  zoneContainer.eventMode = 'static';
  zoneContainer.interactiveChildren = false;
  zoneContainer.on('pointerdown', onPointerDown);
  zoneContainer.on('pointermove', onPointerMove);
  zoneContainer.on('pointerup', onPointerUp);
  zoneContainer.on('pointerupoutside', onPointerOut);
  zoneContainer.on('pointerover', onPointerOver);
  zoneContainer.on('pointerout', onPointerOut);

  return (): void => {
    zoneContainer.off('pointerdown', onPointerDown);
    zoneContainer.off('pointermove', onPointerMove);
    zoneContainer.off('pointerup', onPointerUp);
    zoneContainer.off('pointerupoutside', onPointerOut);
    zoneContainer.off('pointerover', onPointerOver);
    zoneContainer.off('pointerout', onPointerOut);
    zoneContainer.cursor = 'default';
  };
}
