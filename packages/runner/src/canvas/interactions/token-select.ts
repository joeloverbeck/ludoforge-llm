import type { Container, FederatedPointerEvent } from 'pixi.js';

const DRAG_INTENT_THRESHOLD_PX = 5;

type PointerEventLike = Pick<FederatedPointerEvent, 'global'> & {
  readonly stopPropagation?: () => void;
};

export function attachTokenSelectHandlers(
  tokenContainer: Container,
  tokenId: string,
  isSelectable: () => boolean,
  dispatcher: (target: { readonly type: 'token'; readonly id: string }) => void,
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

  const onPointerUp = (event: PointerEventLike): void => {
    event.stopPropagation?.();
    const shouldDispatch = pointerDown && !dragIntent && isSelectable();
    pointerDown = false;
    dragIntent = false;

    if (!shouldDispatch) {
      return;
    }

    dispatcher({ type: 'token', id: tokenId });
  };

  const onPointerOver = (): void => {
    tokenContainer.cursor = isSelectable() ? 'pointer' : 'default';
    options.onHoverChange?.(true);
  };

  const onPointerOut = (): void => {
    tokenContainer.cursor = 'default';
    pointerDown = false;
    dragIntent = false;
    options.onHoverChange?.(false);
  };

  tokenContainer.eventMode = 'static';
  tokenContainer.interactiveChildren = false;
  tokenContainer.on('pointerdown', onPointerDown);
  tokenContainer.on('pointermove', onPointerMove);
  tokenContainer.on('pointerup', onPointerUp);
  tokenContainer.on('pointerupoutside', onPointerOut);
  tokenContainer.on('pointerover', onPointerOver);
  tokenContainer.on('pointerout', onPointerOut);

  return (): void => {
    tokenContainer.off('pointerdown', onPointerDown);
    tokenContainer.off('pointermove', onPointerMove);
    tokenContainer.off('pointerup', onPointerUp);
    tokenContainer.off('pointerupoutside', onPointerOut);
    tokenContainer.off('pointerover', onPointerOver);
    tokenContainer.off('pointerout', onPointerOut);
    tokenContainer.cursor = 'default';
  };
}
