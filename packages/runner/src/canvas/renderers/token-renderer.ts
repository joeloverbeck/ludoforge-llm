import { Container, Graphics, Text } from 'pixi.js';

import type { RenderToken } from '../../model/render-model';
import type { FactionColorProvider, TokenRenderer } from './renderer-types';

const TOKEN_RADIUS = 14;
const TOKENS_PER_ROW = 4;
const TOKEN_SPACING = 30;
const NEUTRAL_TOKEN_COLOR = 0x6b7280;

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
  readonly base: Graphics;
  readonly label: Text;
}

export function createTokenRenderer(
  parentContainer: Container,
  colorProvider: FactionColorProvider,
): TokenRenderer {
  const tokenContainers = new Map<string, Container>();
  const visualsByContainer = new WeakMap<Container, TokenVisualElements>();

  return {
    update(tokens: readonly RenderToken[], zoneContainers: ReadonlyMap<string, Container>): void {
      const nextTokenIds = new Set(tokens.map((token) => token.id));

      for (const [tokenId, tokenContainer] of tokenContainers) {
        if (nextTokenIds.has(tokenId)) {
          continue;
        }

        tokenContainer.removeFromParent();
        tokenContainer.destroy();
        tokenContainers.delete(tokenId);
        visualsByContainer.delete(tokenContainer);
      }

      const zoneTokenCounts = new Map<string, number>();
      for (const token of tokens) {
        let tokenContainer = tokenContainers.get(token.id);
        if (tokenContainer === undefined) {
          tokenContainer = new Container();
          tokenContainer.eventMode = 'none';
          tokenContainer.interactiveChildren = false;

          const visuals = createTokenVisualElements();
          tokenContainer.addChild(visuals.base, visuals.label);
          visualsByContainer.set(tokenContainer, visuals);

          tokenContainers.set(token.id, tokenContainer);
          parentContainer.addChild(tokenContainer);
        }

        const visuals = visualsByContainer.get(tokenContainer);
        if (visuals === undefined) {
          continue;
        }

        const tokenIndexInZone = zoneTokenCounts.get(token.zoneID) ?? 0;
        zoneTokenCounts.set(token.zoneID, tokenIndexInZone + 1);

        updateTokenVisuals(tokenContainer, visuals, token, colorProvider);

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
      return tokenContainers;
    },

    destroy(): void {
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
  const base = new Graphics();

  const label = new Text({
    text: '',
    style: {
      fill: '#f8fafc',
      fontSize: 11,
      fontFamily: 'monospace',
    },
  });

  label.anchor.set(0.5, 0.5);
  label.eventMode = 'none';
  label.interactiveChildren = false;

  return {
    base,
    label,
  };
}

function updateTokenVisuals(
  tokenContainer: Container,
  visuals: TokenVisualElements,
  token: RenderToken,
  colorProvider: FactionColorProvider,
): void {
  const fillColor = resolveTokenColor(token, colorProvider);
  const stroke = resolveStroke(token);

  visuals.base
    .clear()
    .circle(0, 0, TOKEN_RADIUS)
    .fill({ color: fillColor })
    .stroke(stroke);

  visuals.label.text = token.faceUp ? token.type : '?';
  tokenContainer.scale.set(token.isSelected ? 1.08 : 1, token.isSelected ? 1.08 : 1);
}

function resolveTokenColor(token: RenderToken, colorProvider: FactionColorProvider): number {
  if (token.ownerID === null) {
    return NEUTRAL_TOKEN_COLOR;
  }

  return hexToNumber(colorProvider.getColor(token.factionId, token.ownerID));
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

function tokenOffset(index: number): { x: number; y: number } {
  const column = index % TOKENS_PER_ROW;
  const row = Math.floor(index / TOKENS_PER_ROW);

  return {
    x: (column - (TOKENS_PER_ROW - 1) / 2) * TOKEN_SPACING,
    y: row * TOKEN_SPACING - TOKEN_SPACING / 2,
  };
}

function hexToNumber(hex: string): number {
  const normalized = hex.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return Number.parseInt(normalized.slice(1), 16);
  }

  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const [r, g, b] = normalized.slice(1);
    return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
  }

  return NEUTRAL_TOKEN_COLOR;
}
