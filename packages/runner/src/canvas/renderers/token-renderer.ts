import { Circle, Container, Graphics, Polygon, Rectangle, Text } from 'pixi.js';
import { asPlayerId } from '@ludoforge/engine/runtime';

import type { RenderToken } from '../../model/render-model';
import type { TokenShape } from '../../config/visual-config-defaults.js';
import type {
  ResolvedStackBadgeStyle,
  ResolvedTokenVisual,
} from '../../config/visual-config-provider.js';
import type { CardTemplate } from '../../config/visual-config-types.js';
import type { DisposalQueue } from './disposal-queue.js';
import type { TokenFaceController, TokenRenderer, TokenRenderStyleProvider } from './renderer-types';
import { buildRegularPolygonPoints, parseHexColor } from './shape-utils';
import { drawTokenShape } from './token-shape-drawer.js';
import { drawTokenSymbol } from './token-symbol-drawer.js';
import { drawCardContent, destroyCardContentPool } from './card-template-renderer.js';
import { safeDestroyContainer } from './safe-destroy.js';
import {
  type ResolvedTokenRenderStyle,
  resolveTokenRenderStyle,
  type PresentationTokenNode,
} from '../../presentation/token-presentation.js';

const NEUTRAL_TOKEN_COLOR = 0x6b7280;
const CARD_BACK_COLOR = 0x1f2937;

const DEFAULT_STROKE = {
  color: 0x0f172a,
  width: 1.5,
  alpha: 0.9,
} as const;

const SELECTABLE_STROKE = {
  color: 0x93c5fd,
  width: 2.5,
  alpha: 0.95,
} as const;

const SELECTED_STROKE = {
  color: 0xf8fafc,
  width: 3.5,
  alpha: 1,
} as const;

interface TokenVisualElements {
  readonly frontBase: Graphics;
  readonly frontSymbol: Graphics;
  readonly backBase: Graphics;
  readonly backSymbol: Graphics;
  readonly countBadge: Text;
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
  tokenRenderStyleProvider: TokenRenderStyleProvider,
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
      highlightedTokenIDs: ReadonlySet<string> = new Set<string>(),
    ): void {
      const badgeStyle = tokenRenderStyleProvider.getStackBadgeStyle();
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
        const token = entry.representative;
        const renderStyle = resolveTokenRenderStyle(token, tokenRenderStyleProvider);
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
          if (boundTokenId !== token.id) {
            const cleanup = selectionCleanupByRenderId.get(entry.renderId);
            cleanup?.();

            selectionCleanupByRenderId.set(
              entry.renderId,
              options.bindSelection(
                tokenContainer,
                token.id,
                () => selectableByTokenId.get(token.id) === true,
              ),
            );
            boundTokenIdByRenderId.set(entry.renderId, token.id);
          }
        }

        if (entry.stackCount === 1) {
          selectableByTokenId.set(token.id, token.isSelectable);
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
          token,
          entry.stackCount,
          renderStyle,
          badgeStyle,
          tokenRenderStyleProvider,
          highlightedTokenIDs.has(token.id),
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

  const countBadge = new Text({
    text: '',
    style: {
      fill: '#f8fafc',
      fontSize: 10,
      fontFamily: 'monospace',
    },
  });
  countBadge.anchor.set(1, 0);
  countBadge.eventMode = 'none';
  countBadge.interactiveChildren = false;
  countBadge.visible = false;

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
  token: RenderToken,
  tokenCount: number,
  renderStyle: ResolvedTokenRenderStyle,
  badgeStyle: ResolvedStackBadgeStyle,
  tokenRenderStyleProvider: TokenRenderStyleProvider,
  isInteractionHighlighted: boolean,
): void {
  const tokenSymbols = tokenRenderStyleProvider.resolveTokenSymbols(token.type, token.properties);
  const fillColor = resolveTokenColor(token, renderStyle.tokenVisual, tokenRenderStyleProvider);
  const stroke = resolveStroke(token, isInteractionHighlighted);
  const isFaceUp = token.faceUp;

  drawTokenShape(visuals.frontBase, renderStyle.shape, renderStyle.dimensions, fillColor, stroke);
  drawTokenShape(visuals.backBase, renderStyle.shape, renderStyle.dimensions, CARD_BACK_COLOR, stroke);
  drawTokenSymbol(visuals.frontSymbol, tokenSymbols.symbol, resolveSymbolSize(renderStyle.shape, renderStyle.dimensions));
  drawTokenSymbol(visuals.backSymbol, tokenSymbols.backSymbol, resolveSymbolSize(renderStyle.shape, renderStyle.dimensions));
  tokenContainer.hitArea = resolveTokenHitArea(renderStyle.shape, renderStyle.dimensions);
  syncCardContent(tokenContainer, visuals, token, renderStyle.cardTemplate, isFaceUp);
  setTokenFaceVisibility(visuals, isFaceUp);
  visuals.countBadge.text = tokenCount > 1 ? String(tokenCount) : '';
  visuals.countBadge.visible = tokenCount > 1;
  visuals.countBadge.style = {
    fill: badgeStyle.fill,
    fontFamily: badgeStyle.fontFamily,
    fontSize: badgeStyle.fontSize,
    stroke: {
      color: badgeStyle.stroke,
      width: badgeStyle.strokeWidth,
    },
  };
  visuals.countBadge.anchor.set(badgeStyle.anchorX, badgeStyle.anchorY);
  visuals.countBadge.position.set(
    renderStyle.dimensions.width / 2 + badgeStyle.offsetX,
    -renderStyle.dimensions.height / 2 + badgeStyle.offsetY,
  );
  tokenContainer.scale.set(token.isSelected ? 1.08 : 1, token.isSelected ? 1.08 : 1);
}

function resolveTokenColor(
  token: RenderToken,
  tokenVisual: ResolvedTokenVisual,
  tokenRenderStyleProvider: TokenRenderStyleProvider,
): number {
  const resolvedTokenTypeColor = parseHexColor(tokenVisual.color ?? undefined, {
    allowShortHex: true,
    allowNamedColors: true,
  });
  if (resolvedTokenTypeColor !== null) {
    return resolvedTokenTypeColor;
  }

  if (token.factionId !== null) {
    const fallbackPlayer = token.ownerID ?? asPlayerId(0);
    return parseHexColor(tokenRenderStyleProvider.getColor(token.factionId, fallbackPlayer), {
      allowShortHex: true,
      allowNamedColors: true,
    })
      ?? NEUTRAL_TOKEN_COLOR;
  }
  if (token.ownerID !== null) {
    return parseHexColor(tokenRenderStyleProvider.getColor(null, token.ownerID), {
      allowShortHex: true,
      allowNamedColors: true,
    })
      ?? NEUTRAL_TOKEN_COLOR;
  }
  return NEUTRAL_TOKEN_COLOR;
}

function resolveStroke(token: RenderToken, isInteractionHighlighted: boolean): { color: number; width: number; alpha: number } {
  if (token.isSelected) {
    return SELECTED_STROKE;
  }

  if (isInteractionHighlighted) {
    return {
      color: 0x60a5fa,
      width: 3,
      alpha: 1,
    };
  }

  if (token.isSelectable) {
    return SELECTABLE_STROKE;
  }

  return DEFAULT_STROKE;
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
  token: RenderToken,
  cardTemplate: CardTemplate | null,
  isFaceUp: boolean,
): void {
  if (cardTemplate === null) {
    if (visuals.frontContent !== null) {
      destroyCardContentPool(visuals.frontContent);
      visuals.frontContent.removeFromParent();
      safeDestroyContainer(visuals.frontContent);
    }
    visuals.frontContent = null;
    return;
  }

  const contentContainer = ensureFrontContentContainer(tokenContainer, visuals);
  drawCardContent(contentContainer, cardTemplate, token.properties);
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
