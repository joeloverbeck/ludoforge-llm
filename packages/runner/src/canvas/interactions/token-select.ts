import type { Container, FederatedPointerEvent } from 'pixi.js';
import type { HoveredCanvasTarget } from '../hover-anchor-contract.js';

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
    readonly onHoverEnter?: (target: HoveredCanvasTarget) => void;
    readonly onHoverLeave?: (target: HoveredCanvasTarget) => void;
  } = {},
): () => void {
  const hoverTarget: HoveredCanvasTarget = { kind: 'token', id: tokenId };
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
    if (hoverActive) {
      return;
    }
    hoverActive = true;
    tokenContainer.cursor = isSelectable() ? 'pointer' : 'default';
    options.onHoverEnter?.(hoverTarget);
  };

  const onPointerOut = (): void => {
    if (!hoverActive) {
      pointerDown = false;
      dragIntent = false;
      tokenContainer.cursor = 'default';
      return;
    }
    hoverActive = false;
    tokenContainer.cursor = 'default';
    pointerDown = false;
    dragIntent = false;
    options.onHoverLeave?.(hoverTarget);
  };

  tokenContainer.eventMode = 'static';
  tokenContainer.interactiveChildren = false;
  tokenContainer.on('pointerdown', onPointerDown);
  tokenContainer.on('pointermove', onPointerMove);
  tokenContainer.on('pointerup', onPointerUp);
  tokenContainer.on('pointerupoutside', onPointerOut);
  tokenContainer.on('pointerenter', onPointerOver);
  tokenContainer.on('pointerleave', onPointerOut);

  return (): void => {
    tokenContainer.off('pointerdown', onPointerDown);
    tokenContainer.off('pointermove', onPointerMove);
    tokenContainer.off('pointerup', onPointerUp);
    tokenContainer.off('pointerupoutside', onPointerOut);
    tokenContainer.off('pointerenter', onPointerOver);
    tokenContainer.off('pointerleave', onPointerOut);
    tokenContainer.cursor = 'default';
  };
}
