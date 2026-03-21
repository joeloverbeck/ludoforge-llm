import { BitmapText, Circle, Container, Graphics, Polygon, Rectangle } from 'pixi.js';

import type { RenderToken } from '../../model/render-model';
import type { TokenShape } from '../../config/visual-config-defaults.js';
import type { DisposalQueue } from './disposal-queue.js';
import type { TokenFaceController, TokenRenderer } from './renderer-types';
import { buildRegularPolygonPoints, parseHexColor } from './shape-utils';
import { drawTokenShape } from './token-shape-drawer.js';
import { drawTokenSymbol } from './token-symbol-drawer.js';
import { destroyCardContentPool, drawResolvedCardContent } from './card-template-renderer.js';
import { createManagedBitmapText } from '../text/bitmap-text-runtime.js';
import { STROKE_LABEL_FONT_NAME } from '../text/bitmap-font-registry.js';
import type { PresentationTokenNode } from '../../presentation/token-presentation.js';

interface TokenVisualElements {
  readonly frontBase: Graphics;
  readonly frontSymbol: Graphics;
  readonly backBase: Graphics;
  readonly backSymbol: Graphics;
  readonly countBadge: BitmapText;
  frontContent: Container | null;
}

interface TokenRendererOptions {
  readonly disposalQueue: DisposalQueue;
  readonly bindSelection?: (
    tokenContainer: Container,
    tokenId: string,
    isSelectable: () => boolean,
  ) => () => void;
}

export function createTokenRenderer(
  parentContainer: Container,
  options: TokenRendererOptions,
): TokenRenderer {
  const tokenContainers = new Map<string, Container>();
  const tokenContainerByTokenId = new Map<string, Container>();
  const tokenFaceControllerByTokenId = new Map<string, TokenFaceController>();
  const visualsByContainer = new WeakMap<Container, TokenVisualElements>();
  const selectionCleanupByRenderId = new Map<string, () => void>();
  const boundTokenIdByRenderId = new Map<string, string>();
  const selectableByTokenId = new Map<string, boolean>();

  return {
    update(
      tokens: readonly PresentationTokenNode[],
      zoneContainers: ReadonlyMap<string, Container>,
    ): void {
      const nextTokenIds = new Set(tokens.map((entry) => entry.renderId));
      tokenContainerByTokenId.clear();
      tokenFaceControllerByTokenId.clear();

      for (const [renderId, tokenContainer] of tokenContainers) {
        if (nextTokenIds.has(renderId)) {
          continue;
        }

        const cleanup = selectionCleanupByRenderId.get(renderId);
        cleanup?.();
        selectionCleanupByRenderId.delete(renderId);
        boundTokenIdByRenderId.delete(renderId);

        const removedVisuals = visualsByContainer.get(tokenContainer);
        if (removedVisuals?.frontContent !== null && removedVisuals?.frontContent !== undefined) {
          destroyCardContentPool(removedVisuals.frontContent);
        }
        options.disposalQueue.enqueue(tokenContainer);
        tokenContainers.delete(renderId);
        visualsByContainer.delete(tokenContainer);
      }

      selectableByTokenId.clear();

      for (const entry of tokens) {
        let tokenContainer = tokenContainers.get(entry.renderId);
        if (tokenContainer === undefined) {
          tokenContainer = new Container();
          const interactive = options.bindSelection !== undefined;
          tokenContainer.eventMode = interactive ? 'static' : 'none';
          tokenContainer.interactiveChildren = false;
          const visuals = createTokenVisualElements();
          tokenContainer.addChild(
            visuals.backBase,
            visuals.backSymbol,
            visuals.frontBase,
            visuals.frontSymbol,
            visuals.countBadge,
          );
          visualsByContainer.set(tokenContainer, visuals);

          tokenContainers.set(entry.renderId, tokenContainer);
          parentContainer.addChild(tokenContainer);
        }

        if (options.bindSelection !== undefined) {
          const boundTokenId = boundTokenIdByRenderId.get(entry.renderId);
          if (boundTokenId !== entry.representativeTokenId) {
            const cleanup = selectionCleanupByRenderId.get(entry.renderId);
            cleanup?.();

            selectionCleanupByRenderId.set(
              entry.renderId,
              options.bindSelection(
                tokenContainer,
                entry.representativeTokenId,
                () => selectableByTokenId.get(entry.representativeTokenId) === true,
              ),
            );
            boundTokenIdByRenderId.set(entry.renderId, entry.representativeTokenId);
          }
        }

        if (entry.stackCount === 1) {
          selectableByTokenId.set(entry.representativeTokenId, entry.isSelectable);
        }
        const visuals = visualsByContainer.get(tokenContainer);
        if (visuals === undefined) {
          continue;
        }
        for (const tokenId of entry.tokenIds) {
          tokenContainerByTokenId.set(tokenId, tokenContainer);
          tokenFaceControllerByTokenId.set(tokenId, createFaceController(visuals));
        }

        updateTokenVisuals(
          tokenContainer,
          visuals,
          entry,
          options.disposalQueue,
        );

        const zoneContainer = zoneContainers.get(entry.zoneId);
        if (zoneContainer === undefined) {
          tokenContainer.visible = false;
          tokenContainer.alpha = 0;
          continue;
        }

        tokenContainer.visible = true;
        tokenContainer.alpha = 1;
        tokenContainer.position.set(
          zoneContainer.position.x + entry.offset.x,
          zoneContainer.position.y + entry.offset.y,
        );
      }
    },

    getContainerMap(): ReadonlyMap<string, Container> {
      return tokenContainerByTokenId;
    },

    getFaceControllerMap(): ReadonlyMap<string, TokenFaceController> {
      return tokenFaceControllerByTokenId;
    },

    reconcileFaceState(tokens: readonly RenderToken[]): void {
      for (const token of tokens) {
        const faceController = tokenFaceControllerByTokenId.get(token.id);
        if (faceController !== undefined) {
          faceController.setFaceUp(token.faceUp);
        }
      }
    },

    destroy(): void {
      for (const cleanup of selectionCleanupByRenderId.values()) {
        cleanup();
      }
      selectionCleanupByRenderId.clear();
      boundTokenIdByRenderId.clear();
      selectableByTokenId.clear();
      tokenContainerByTokenId.clear();
      tokenFaceControllerByTokenId.clear();

      for (const tokenContainer of tokenContainers.values()) {
        const destroyedVisuals = visualsByContainer.get(tokenContainer);
        if (destroyedVisuals?.frontContent !== null && destroyedVisuals?.frontContent !== undefined) {
          destroyCardContentPool(destroyedVisuals.frontContent);
        }
        options.disposalQueue.enqueue(tokenContainer);
        visualsByContainer.delete(tokenContainer);
      }

      tokenContainers.clear();
    },
  };
}

function createTokenVisualElements(): TokenVisualElements {
  const frontBase = new Graphics();
  const backBase = new Graphics();
  const frontSymbol = new Graphics();
  const backSymbol = new Graphics();

  const countBadge = createManagedBitmapText({
    text: '',
    style: {
      fill: '#f8fafc',
      fontSize: 10,
      fontFamily: STROKE_LABEL_FONT_NAME,
    },
    anchor: { x: 1, y: 0 },
    visible: false,
  });

  return {
    frontBase,
    frontSymbol,
    backBase,
    backSymbol,
    countBadge,
    frontContent: null,
  };
}

function updateTokenVisuals(
  tokenContainer: Container,
  visuals: TokenVisualElements,
  token: PresentationTokenNode,
  disposalQueue: DisposalQueue,
): void {
  const { render } = token;
  const fillColor = parseHexColor(render.frontColor ?? undefined, {
    allowShortHex: true,
    allowNamedColors: true,
  }) ?? 0x6b7280;
  const backColor = parseHexColor(render.backColor ?? undefined, {
    allowShortHex: true,
    allowNamedColors: true,
  }) ?? 0x1f2937;
  const strokeColor = parseHexColor(render.stroke.color ?? undefined, {
    allowShortHex: true,
    allowNamedColors: true,
  }) ?? 0x0f172a;
  const stroke = {
    color: strokeColor,
    width: render.stroke.width,
    alpha: render.stroke.alpha,
  };
  const isFaceUp = token.faceUp;

  drawTokenShape(visuals.frontBase, render.shape, render.dimensions, fillColor, stroke);
  drawTokenShape(visuals.backBase, render.shape, render.dimensions, backColor, stroke);
  drawTokenSymbol(visuals.frontSymbol, render.symbol, resolveSymbolSize(render.shape, render.dimensions));
  drawTokenSymbol(visuals.backSymbol, render.backSymbol, resolveSymbolSize(render.shape, render.dimensions));
  tokenContainer.hitArea = resolveTokenHitArea(render.shape, render.dimensions);
  syncCardContent(tokenContainer, visuals, render.cardContent, isFaceUp, disposalQueue);
  setTokenFaceVisibility(visuals, isFaceUp);
  visuals.countBadge.text = render.stackBadge.text;
  visuals.countBadge.visible = render.stackBadge.visible;
  visuals.countBadge.style = {
    fill: render.stackBadge.style.fill,
    fontFamily: render.stackBadge.style.fontFamily,
    fontSize: render.stackBadge.style.fontSize,
    stroke: {
      color: render.stackBadge.style.stroke,
      width: render.stackBadge.style.strokeWidth,
    },
  };
  visuals.countBadge.anchor.set(render.stackBadge.style.anchorX, render.stackBadge.style.anchorY);
  visuals.countBadge.position.set(
    render.stackBadge.position.x,
    render.stackBadge.position.y,
  );
  tokenContainer.scale.set(render.scale, render.scale);
}


function ensureFrontContentContainer(
  tokenContainer: Container,
  visuals: TokenVisualElements,
): Container {
  if (visuals.frontContent !== null) {
    return visuals.frontContent;
  }

  const container = new Container();
  container.eventMode = 'none';
  container.interactiveChildren = false;
  tokenContainer.addChild(container);
  visuals.frontContent = container;
  return container;
}

function syncCardContent(
  tokenContainer: Container,
  visuals: TokenVisualElements,
  cardContent: PresentationTokenNode['render']['cardContent'],
  isFaceUp: boolean,
  disposalQueue: DisposalQueue,
): void {
  if (cardContent === null) {
    if (visuals.frontContent !== null) {
      destroyCardContentPool(visuals.frontContent);
      disposalQueue.enqueue(visuals.frontContent);
    }
    visuals.frontContent = null;
    return;
  }

  const contentContainer = ensureFrontContentContainer(tokenContainer, visuals);
  drawResolvedCardContent(contentContainer, cardContent.template, cardContent.fields);
  contentContainer.visible = isFaceUp;
}

function createFaceController(visuals: TokenVisualElements): TokenFaceController {
  return {
    setFaceUp(faceUp: boolean): void {
      setTokenFaceVisibility(visuals, faceUp);
    },
  };
}

function setTokenFaceVisibility(visuals: TokenVisualElements, isFaceUp: boolean): void {
  visuals.frontBase.visible = isFaceUp;
  visuals.frontSymbol.visible = isFaceUp;
  visuals.backBase.visible = !isFaceUp;
  visuals.backSymbol.visible = !isFaceUp;
  if (visuals.frontContent !== null) {
    visuals.frontContent.visible = isFaceUp;
  }
}

function resolveTokenHitArea(
  shape: TokenShape,
  dimensions: { readonly width: number; readonly height: number },
): Circle | Rectangle | Polygon {
  switch (shape) {
    case 'card':
    case 'square':
    case 'cube':
      return new Rectangle(
        -dimensions.width / 2,
        -dimensions.height / 2,
        dimensions.width,
        dimensions.height,
      );
    case 'triangle':
      return new Polygon(buildRegularPolygonPoints(3, dimensions.width, dimensions.height));
    case 'diamond':
      return new Polygon([
        0,
        -dimensions.height / 2,
        dimensions.width / 2,
        0,
        0,
        dimensions.height / 2,
        -dimensions.width / 2,
        0,
      ]);
    case 'hexagon':
    case 'beveled-cylinder':
      return new Polygon(buildRegularPolygonPoints(6, dimensions.width, dimensions.height));
    case 'meeple':
      return new Rectangle(
        -dimensions.width * 0.4,
        -dimensions.height * 0.55,
        dimensions.width * 0.8,
        dimensions.height * 1.1,
      );
    case 'round-disk':
    case 'circle':
    default:
      return new Circle(0, 0, Math.min(dimensions.width, dimensions.height) / 2);
  }
}

function resolveSymbolSize(
  shape: TokenShape,
  dimensions: { readonly width: number; readonly height: number },
): number {
  const base = Math.min(dimensions.width, dimensions.height);
  if (shape === 'card') {
    return base * 0.42;
  }
  return base * 0.58;
}
