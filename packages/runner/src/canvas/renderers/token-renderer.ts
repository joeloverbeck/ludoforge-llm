import { Circle, Container, Graphics, Text } from 'pixi.js';
import { asPlayerId, type TokenShape } from '@ludoforge/engine/runtime';

import type { RenderToken } from '../../model/render-model';
import type { FactionColorProvider, TokenRenderer } from './renderer-types';
import { parseHexColor } from './shape-utils';

const TOKEN_RADIUS = 14;
const CARD_WIDTH = 24;
const CARD_HEIGHT = 34;
const CARD_CORNER_RADIUS = 4;
const TOKENS_PER_ROW = 4;
const TOKEN_SPACING = 30;
const NEUTRAL_TOKEN_COLOR = 0x6b7280;
const CARD_BACK_COLOR = 0x1f2937;
const CARD_BACK_LABEL_COLOR = '#e2e8f0';

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
  readonly frontLabel: Text;
  readonly backBase: Graphics;
  readonly backLabel: Text;
  readonly countBadge: Text;
}

interface TokenRendererOptions {
  readonly bindSelection?: (
    tokenContainer: Container,
    tokenId: string,
    isSelectable: () => boolean,
  ) => () => void;
}

export function createTokenRenderer(
  parentContainer: Container,
  colorProvider: FactionColorProvider,
  options: TokenRendererOptions = {},
): TokenRenderer {
  const tokenContainers = new Map<string, Container>();
  const tokenContainerByTokenId = new Map<string, Container>();
  const visualsByContainer = new WeakMap<Container, TokenVisualElements>();
  const selectionCleanupByRenderId = new Map<string, () => void>();
  const boundTokenIdByRenderId = new Map<string, string>();
  const selectableByTokenId = new Map<string, boolean>();

  return {
    update(tokens: readonly RenderToken[], zoneContainers: ReadonlyMap<string, Container>): void {
      const renderEntries = buildRenderEntries(tokens);
      const nextTokenIds = new Set(renderEntries.map((entry) => entry.renderId));
      tokenContainerByTokenId.clear();

      for (const [renderId, tokenContainer] of tokenContainers) {
        if (nextTokenIds.has(renderId)) {
          continue;
        }

        const cleanup = selectionCleanupByRenderId.get(renderId);
        cleanup?.();
        selectionCleanupByRenderId.delete(renderId);
        boundTokenIdByRenderId.delete(renderId);

        tokenContainer.removeFromParent();
        tokenContainer.destroy();
        tokenContainers.delete(renderId);
        visualsByContainer.delete(tokenContainer);
      }

      const zoneTokenCounts = new Map<string, number>();
      selectableByTokenId.clear();

      for (const entry of renderEntries) {
        const token = entry.representative;
        let tokenContainer = tokenContainers.get(entry.renderId);
        if (tokenContainer === undefined) {
          tokenContainer = new Container();
          const interactive = options.bindSelection !== undefined;
          tokenContainer.eventMode = interactive ? 'static' : 'none';
          tokenContainer.interactiveChildren = false;
          tokenContainer.hitArea = new Circle(0, 0, TOKEN_RADIUS);

          const visuals = createTokenVisualElements();
          tokenContainer.addChild(
            visuals.backBase,
            visuals.backLabel,
            visuals.frontBase,
            visuals.frontLabel,
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

        if (entry.tokenIds.length === 1) {
          selectableByTokenId.set(token.id, token.isSelectable);
        }
        for (const tokenId of entry.tokenIds) {
          tokenContainerByTokenId.set(tokenId, tokenContainer);
        }

        const visuals = visualsByContainer.get(tokenContainer);
        if (visuals === undefined) {
          continue;
        }

        const tokenIndexInZone = zoneTokenCounts.get(token.zoneID) ?? 0;
        zoneTokenCounts.set(token.zoneID, tokenIndexInZone + 1);

        updateTokenVisuals(tokenContainer, visuals, token, entry.tokenIds.length, colorProvider);

        const zoneContainer = zoneContainers.get(token.zoneID);
        if (zoneContainer === undefined) {
          tokenContainer.visible = false;
          tokenContainer.alpha = 0;
          continue;
        }

        const offset = tokenOffset(tokenIndexInZone);
        tokenContainer.visible = true;
        tokenContainer.alpha = 1;
        tokenContainer.position.set(
          zoneContainer.position.x + offset.x,
          zoneContainer.position.y + offset.y,
        );
      }
    },

    getContainerMap(): ReadonlyMap<string, Container> {
      return tokenContainerByTokenId;
    },

    destroy(): void {
      for (const cleanup of selectionCleanupByRenderId.values()) {
        cleanup();
      }
      selectionCleanupByRenderId.clear();
      boundTokenIdByRenderId.clear();
      selectableByTokenId.clear();
      tokenContainerByTokenId.clear();

      for (const tokenContainer of tokenContainers.values()) {
        tokenContainer.removeFromParent();
        tokenContainer.destroy();
        visualsByContainer.delete(tokenContainer);
      }

      tokenContainers.clear();
    },
  };
}

function createTokenVisualElements(): TokenVisualElements {
  const frontBase = new Graphics();
  const backBase = new Graphics();

  const frontLabel = new Text({
    text: '',
    style: {
      fill: '#f8fafc',
      fontSize: 11,
      fontFamily: 'monospace',
    },
  });

  frontLabel.anchor.set(0.5, 0.5);
  frontLabel.eventMode = 'none';
  frontLabel.interactiveChildren = false;

  const backLabel = new Text({
    text: '?',
    style: {
      fill: CARD_BACK_LABEL_COLOR,
      fontSize: 12,
      fontFamily: 'monospace',
      fontWeight: '700',
    },
  });
  backLabel.anchor.set(0.5, 0.5);
  backLabel.eventMode = 'none';
  backLabel.interactiveChildren = false;

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
    frontLabel,
    backBase,
    backLabel,
    countBadge,
  };
}

function updateTokenVisuals(
  tokenContainer: Container,
  visuals: TokenVisualElements,
  token: RenderToken,
  tokenCount: number,
  colorProvider: FactionColorProvider,
): void {
  const tokenVisual = colorProvider.getTokenTypeVisual(token.type);
  const shape = resolveTokenShape(tokenVisual?.shape);
  const dimensions = resolveTokenDimensions(shape, tokenVisual?.size);
  const fillColor = resolveTokenColor(token, colorProvider);
  const stroke = resolveStroke(token);
  const isFaceUp = token.faceUp;

  drawTokenBase(visuals.frontBase, shape, dimensions, fillColor, stroke);
  drawTokenBase(visuals.backBase, shape, dimensions, CARD_BACK_COLOR, stroke);

  visuals.frontBase.visible = isFaceUp;
  visuals.frontLabel.visible = isFaceUp;
  visuals.backBase.visible = !isFaceUp;
  visuals.backLabel.visible = !isFaceUp;

  visuals.frontLabel.text = tokenLabel(token, tokenVisual?.symbol);
  visuals.backLabel.text = tokenBackLabel(shape, tokenVisual?.symbol);
  visuals.countBadge.text = tokenCount > 1 ? String(tokenCount) : '';
  visuals.countBadge.visible = tokenCount > 1;
  visuals.countBadge.position.set(dimensions.width / 2 - 2, -dimensions.height / 2 + 2);
  tokenContainer.scale.set(token.isSelected ? 1.08 : 1, token.isSelected ? 1.08 : 1);
}

function resolveTokenColor(token: RenderToken, colorProvider: FactionColorProvider): number {
  const tokenTypeColor = colorProvider.getTokenTypeVisual(token.type)?.color;
  const resolvedTokenTypeColor = parseHexColor(tokenTypeColor, {
    allowShortHex: true,
    allowNamedColors: true,
  });
  if (resolvedTokenTypeColor !== null) {
    return resolvedTokenTypeColor;
  }

  if (token.factionId !== null) {
    const fallbackPlayer = token.ownerID ?? asPlayerId(0);
    return parseHexColor(colorProvider.getColor(token.factionId, fallbackPlayer), {
      allowShortHex: true,
      allowNamedColors: true,
    })
      ?? NEUTRAL_TOKEN_COLOR;
  }
  if (token.ownerID !== null) {
    return parseHexColor(colorProvider.getColor(null, token.ownerID), {
      allowShortHex: true,
      allowNamedColors: true,
    })
      ?? NEUTRAL_TOKEN_COLOR;
  }
  return NEUTRAL_TOKEN_COLOR;
}

function resolveStroke(token: RenderToken): { color: number; width: number; alpha: number } {
  if (token.isSelected) {
    return SELECTED_STROKE;
  }

  if (token.isSelectable) {
    return SELECTABLE_STROKE;
  }

  return DEFAULT_STROKE;
}

function drawTokenBase(
  graphics: Graphics,
  shape: 'circle' | 'card',
  dimensions: { readonly width: number; readonly height: number },
  fillColor: number,
  stroke: { color: number; width: number; alpha: number },
): void {
  graphics.clear();
  if (shape === 'card') {
    graphics
      .roundRect(-dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height, CARD_CORNER_RADIUS)
      .fill({ color: fillColor })
      .stroke(stroke);
    return;
  }

  graphics
    .circle(0, 0, dimensions.width / 2)
    .fill({ color: fillColor })
    .stroke(stroke);
}

function resolveTokenShape(shape: TokenShape | undefined): 'circle' | 'card' {
  return shape === 'card' ? 'card' : 'circle';
}

function resolveTokenDimensions(
  shape: 'circle' | 'card',
  size: number | undefined,
): { readonly width: number; readonly height: number } {
  const normalizedSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : TOKEN_RADIUS * 2;
  if (shape === 'card') {
    return {
      width: Math.max(CARD_WIDTH, Math.round(normalizedSize * 0.9)),
      height: Math.max(CARD_HEIGHT, Math.round(normalizedSize * 1.25)),
    };
  }
  return {
    width: normalizedSize,
    height: normalizedSize,
  };
}

function tokenOffset(index: number): { x: number; y: number } {
  const column = index % TOKENS_PER_ROW;
  const row = Math.floor(index / TOKENS_PER_ROW);

  return {
    x: (column - (TOKENS_PER_ROW - 1) / 2) * TOKEN_SPACING,
    y: row * TOKEN_SPACING - TOKEN_SPACING / 2,
  };
}

function tokenLabel(token: RenderToken, symbol: string | undefined): string {
  const trimmedSymbol = typeof symbol === 'string' ? symbol.trim() : '';
  if (trimmedSymbol.length > 0) {
    return trimmedSymbol;
  }
  return toTokenLabel(token.type);
}

function tokenBackLabel(shape: 'circle' | 'card', symbol: string | undefined): string {
  if (shape !== 'card') {
    return '?';
  }

  const trimmedSymbol = typeof symbol === 'string' ? symbol.trim() : '';
  return trimmedSymbol.length > 0 ? '◆' : '?';
}

interface TokenRenderEntry {
  readonly renderId: string;
  readonly representative: RenderToken;
  readonly tokenIds: readonly string[];
}

function buildRenderEntries(tokens: readonly RenderToken[]): readonly TokenRenderEntry[] {
  const entries: TokenRenderEntry[] = [];
  const grouped = new Map<string, RenderToken[]>();

  for (const token of tokens) {
    if (token.isSelectable || token.isSelected) {
      entries.push({
        renderId: token.id,
        representative: token,
        tokenIds: [token.id],
      });
      continue;
    }

    const key = stackGroupKey(token);
    const list = grouped.get(key);
    if (list === undefined) {
      grouped.set(key, [token]);
    } else {
      list.push(token);
    }
  }

  for (const [key, groupedTokens] of grouped.entries()) {
    if (groupedTokens.length === 1) {
      const singleton = groupedTokens[0]!;
      entries.push({
        renderId: singleton.id,
        representative: singleton,
        tokenIds: [singleton.id],
      });
      continue;
    }

    entries.push({
      renderId: key,
      representative: groupedTokens[0]!,
      tokenIds: groupedTokens.map((token) => token.id),
    });
  }

  return entries;
}

function stackGroupKey(token: RenderToken): string {
  return JSON.stringify([
    'stack',
    token.zoneID,
    token.type,
    token.factionId,
    token.ownerID,
    token.faceUp,
  ]);
}

function toTokenLabel(type: string): string {
  const base = type.split('-').pop() ?? type;
  return base.slice(0, 3).toUpperCase();
}
