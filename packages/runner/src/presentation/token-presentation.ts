import { asPlayerId } from '@ludoforge/engine/runtime';

import type { TokenShape } from '../config/visual-config-defaults.js';
import type { ResolvedCardField } from '../config/card-field-resolver.js';
import { resolveCardTemplateFields } from '../config/card-field-resolver.js';
import type {
  ResolvedStackBadgeStyle,
  ResolvedTokenPresentation,
  ResolvedTokenVisual,
} from '../config/visual-config-provider.js';
import type { CardTemplate } from '../config/visual-config-types.js';
import type { RunnerToken, RunnerZone } from '../model/runner-frame.js';
import { computeFanOffset } from '../layout/fan-offset.js';
import type { TokenRenderStyleProvider } from '../canvas/renderers/renderer-types.js';

const TOKEN_RADIUS = 19;
const CARD_WIDTH = 24;
const CARD_HEIGHT = 34;
const STACK_OFFSET_X = 2;
const STACK_OFFSET_Y = 1;
const NEUTRAL_TOKEN_COLOR = '#6b7280';
const CARD_BACK_COLOR = '#1f2937';

interface PresentationStrokeSpec {
  readonly color: string;
  readonly width: number;
  readonly alpha: number;
}

interface PresentationTokenCardContentSpec {
  readonly template: CardTemplate;
  readonly fields: readonly ResolvedCardField[];
}

interface PresentationTokenStackBadgeSpec {
  readonly text: string;
  readonly visible: boolean;
  readonly style: ResolvedStackBadgeStyle;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

export interface PresentationTokenRenderSpec {
  readonly shape: TokenShape;
  readonly dimensions: {
    readonly width: number;
    readonly height: number;
  };
  readonly frontColor: string;
  readonly backColor: string;
  readonly stroke: PresentationStrokeSpec;
  readonly symbol: string | null;
  readonly backSymbol: string | null;
  readonly stackBadge: PresentationTokenStackBadgeSpec;
  readonly cardContent: PresentationTokenCardContentSpec | null;
  readonly scale: number;
}

export interface PresentationTokenNode {
  readonly renderId: string;
  readonly representativeTokenId: string;
  readonly tokenIds: readonly string[];
  readonly stackCount: number;
  readonly zoneId: string;
  readonly faceUp: boolean;
  readonly isSelectable: boolean;
  readonly offset: {
    readonly x: number;
    readonly y: number;
  };
  readonly render: PresentationTokenRenderSpec;
  readonly signature: string;
}

interface TokenRenderEntry {
  readonly renderId: string;
  readonly representative: RunnerToken;
  readonly tokenIds: readonly string[];
}

export interface ResolvedTokenRenderStyle {
  readonly tokenVisual: ResolvedTokenVisual;
  readonly presentation: ResolvedTokenPresentation;
  readonly shape: TokenShape;
  readonly cardTemplate: CardTemplate | null;
  readonly dimensions: {
    readonly width: number;
    readonly height: number;
  };
}

export function resolvePresentationTokenNodes(
  tokens: readonly RunnerToken[],
  zones: readonly RunnerZone[],
  tokenRenderStyleProvider: TokenRenderStyleProvider,
  highlightedTokenIDs: ReadonlySet<string> = new Set<string>(),
): readonly PresentationTokenNode[] {
  const entries = buildRenderEntries(tokens);
  const offsetsByRenderId = buildZoneOffsetsByRenderId(entries, zones, tokenRenderStyleProvider);
  const stackBadgeStyle = tokenRenderStyleProvider.getStackBadgeStyle();

  return entries.map((entry) => {
    const offset = offsetsByRenderId.get(entry.renderId) ?? { x: 0, y: 0 };
    const stackCount = entry.tokenIds.length;
    const render = resolveTokenRenderSpec(
      entry.representative,
      stackCount,
      tokenRenderStyleProvider,
      stackBadgeStyle,
      highlightedTokenIDs.has(entry.representative.id),
    );
    return {
      renderId: entry.renderId,
      representativeTokenId: entry.representative.id,
      tokenIds: entry.tokenIds,
      stackCount,
      zoneId: entry.representative.zoneID,
      faceUp: entry.representative.faceUp,
      isSelectable: entry.representative.isSelectable,
      offset,
      render,
      signature: buildTokenNodeSignature(entry, offset, render),
    };
  });
}

export function resolveTokenRenderStyle(
  token: RunnerToken,
  tokenRenderStyleProvider: TokenRenderStyleProvider,
): ResolvedTokenRenderStyle {
  const tokenVisual = tokenRenderStyleProvider.getTokenTypeVisual(token.type);
  const presentation = tokenRenderStyleProvider.getTokenTypePresentation(token.type);
  const shape = resolveTokenShape(tokenVisual.shape);
  const cardTemplate = resolveCardTemplate(shape, token.type, tokenRenderStyleProvider);
  const dimensions = resolveTokenDimensions(shape, tokenVisual.size, cardTemplate, presentation.scale);

  return {
    tokenVisual,
    presentation,
    shape,
    cardTemplate,
    dimensions,
  };
}

function buildTokenNodeSignature(
  entry: TokenRenderEntry,
  offset: { readonly x: number; readonly y: number },
  render: PresentationTokenRenderSpec,
): string {
  const representative = entry.representative;
  return [
    entry.renderId,
    representative.zoneID,
    offset.x,
    offset.y,
    entry.tokenIds.length,
    representative.type,
    representative.ownerID ?? 'none',
    representative.factionId ?? 'none',
    representative.faceUp ? 'up' : 'down',
    render.frontColor,
    render.stroke.color,
    render.stroke.width,
    render.stroke.alpha,
    render.symbol ?? 'none',
    render.backSymbol ?? 'none',
    render.cardContent?.fields.map((field) => `${field.fieldName}:${field.text}:${field.color}`).join(',') ?? 'no-card',
  ].join('|');
}

function resolveTokenRenderSpec(
  token: RunnerToken,
  stackCount: number,
  tokenRenderStyleProvider: TokenRenderStyleProvider,
  stackBadgeStyle: ResolvedStackBadgeStyle,
  isInteractionHighlighted: boolean,
): PresentationTokenRenderSpec {
  const renderStyle = resolveTokenRenderStyle(token, tokenRenderStyleProvider);
  const symbols = tokenRenderStyleProvider.resolveTokenSymbols(token.type, token.properties);

  return {
    shape: renderStyle.shape,
    dimensions: renderStyle.dimensions,
    frontColor: resolveTokenColor(token, renderStyle.tokenVisual, tokenRenderStyleProvider),
    backColor: CARD_BACK_COLOR,
    stroke: resolveStroke(token, isInteractionHighlighted),
    symbol: symbols.symbol,
    backSymbol: symbols.backSymbol,
    stackBadge: {
      text: stackCount > 1 ? String(stackCount) : '',
      visible: stackCount > 1,
      style: stackBadgeStyle,
      position: {
        x: renderStyle.dimensions.width / 2 + stackBadgeStyle.offsetX,
        y: -renderStyle.dimensions.height / 2 + stackBadgeStyle.offsetY,
      },
    },
    cardContent: resolveCardContentSpec(renderStyle.cardTemplate, token.properties),
    scale: token.isSelected ? 1.08 : 1,
  };
}

function buildZoneOffsetsByRenderId(
  entries: readonly TokenRenderEntry[],
  zones: readonly RunnerZone[],
  tokenRenderStyleProvider: TokenRenderStyleProvider,
): ReadonlyMap<string, { x: number; y: number }> {
  const offsetsByRenderId = new Map<string, { x: number; y: number }>();
  const zoneById = new Map(zones.map((zone) => [zone.id, zone] as const));
  const entriesByZoneId = new Map<string, Array<{ entry: TokenRenderEntry; style: ResolvedTokenRenderStyle }>>();

  for (const entry of entries) {
    const zoneEntries = entriesByZoneId.get(entry.representative.zoneID);
    const resolvedEntry = {
      entry,
      style: resolveTokenRenderStyle(entry.representative, tokenRenderStyleProvider),
    };
    if (zoneEntries === undefined) {
      entriesByZoneId.set(entry.representative.zoneID, [resolvedEntry]);
    } else {
      zoneEntries.push(resolvedEntry);
    }
  }

  for (const [zoneId, zoneEntries] of entriesByZoneId.entries()) {
    const zone = zoneById.get(zoneId);
    const layoutRole = resolveZoneLayoutRole(zoneId, tokenRenderStyleProvider);
    if (layoutRole === 'fan') {
      for (const [index, zoneEntry] of zoneEntries.entries()) {
        offsetsByRenderId.set(
          zoneEntry.entry.renderId,
          computeFanOffset(index, zoneEntries.length, resolveItemWidth(zoneEntry.style)),
        );
      }
      continue;
    }
    if (layoutRole === 'stack') {
      for (const [index, zoneEntry] of zoneEntries.entries()) {
        offsetsByRenderId.set(zoneEntry.entry.renderId, stackOffset(index));
      }
      continue;
    }

    const layout = tokenRenderStyleProvider.resolveZoneTokenLayout(zoneId, zone?.category ?? null);
    const zoneOffsets = layout.mode === 'lanes'
      ? laneOffsets(zoneEntries, layout)
      : gridOffsets(zoneEntries, layout.columns, layout.spacingX, layout.spacingY);
    for (const [renderId, offset] of zoneOffsets) {
      offsetsByRenderId.set(renderId, offset);
    }
  }

  return offsetsByRenderId;
}

function resolveZoneLayoutRole(
  zoneId: string,
  tokenRenderStyleProvider: TokenRenderStyleProvider,
): 'fan' | 'stack' | 'grid' {
  if (tokenRenderStyleProvider.isSharedZone(zoneId)) {
    return 'fan';
  }

  const role = tokenRenderStyleProvider.getZoneLayoutRole(zoneId);
  if (role === 'hand') {
    return 'fan';
  }
  if (role === 'card') {
    return 'stack';
  }
  return 'grid';
}

function resolveItemWidth(renderStyle: ResolvedTokenRenderStyle): number {
  if (renderStyle.cardTemplate !== null) {
    return renderStyle.dimensions.width;
  }
  if (renderStyle.shape === 'card') {
    return Math.max(CARD_WIDTH, renderStyle.dimensions.width);
  }
  return renderStyle.dimensions.width;
}

function stackOffset(index: number): { x: number; y: number } {
  return {
    x: index * STACK_OFFSET_X,
    y: index * STACK_OFFSET_Y,
  };
}

function gridOffsets(
  zoneEntries: ReadonlyArray<{ entry: TokenRenderEntry; style: ResolvedTokenRenderStyle }>,
  columns: number,
  spacingX: number,
  spacingY: number,
): ReadonlyMap<string, { x: number; y: number }> {
  const offsets = new Map<string, { x: number; y: number }>();

  for (const [index, zoneEntry] of zoneEntries.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    offsets.set(zoneEntry.entry.renderId, {
      x: (column - (columns - 1) / 2) * spacingX,
      y: row * spacingY - spacingY / 2,
    });
  }

  return offsets;
}

function laneOffsets(
  zoneEntries: ReadonlyArray<{ entry: TokenRenderEntry; style: ResolvedTokenRenderStyle }>,
  layout: Extract<ReturnType<TokenRenderStyleProvider['resolveZoneTokenLayout']>, { mode: 'lanes' }>,
): ReadonlyMap<string, { x: number; y: number }> {
  const offsets = new Map<string, { x: number; y: number }>();
  const entriesByLane = new Map<string, Array<{ entry: TokenRenderEntry; style: ResolvedTokenRenderStyle }>>();

  for (const zoneEntry of zoneEntries) {
    const laneId = resolvePresentationLane(zoneEntry.style.presentation, layout.laneOrder);
    const laneEntries = entriesByLane.get(laneId);
    if (laneEntries === undefined) {
      entriesByLane.set(laneId, [zoneEntry]);
    } else {
      laneEntries.push(zoneEntry);
    }
  }

  let previousLaneCenterY: number | null = null;
  let previousLaneHeight = 0;
  for (const laneId of layout.laneOrder) {
    const laneEntries = entriesByLane.get(laneId) ?? [];
    if (laneEntries.length === 0) {
      continue;
    }

    const laneLayout = layout.lanes[laneId];
    if (laneLayout === undefined) {
      continue;
    }
    const laneHeight = Math.max(...laneEntries.map(({ style }) => style.dimensions.height));
    const laneCenterY: number = laneLayout.anchor === 'belowPreviousLane' && previousLaneCenterY !== null
      ? previousLaneCenterY + previousLaneHeight / 2 + layout.laneGap + laneHeight / 2
      : 0;
    const laneXOffsets = computeCenteredRowOffsets(laneEntries, laneLayout.spacingX);

    for (const [index, laneEntry] of laneEntries.entries()) {
      offsets.set(laneEntry.entry.renderId, {
        x: laneXOffsets[index] ?? 0,
        y: laneCenterY,
      });
    }

    previousLaneCenterY = laneCenterY;
    previousLaneHeight = laneHeight;
  }

  return offsets;
}

function computeCenteredRowOffsets(
  laneEntries: ReadonlyArray<{ entry: TokenRenderEntry; style: ResolvedTokenRenderStyle }>,
  spacingX: number,
): readonly number[] {
  if (laneEntries.length === 0) {
    return [];
  }

  const widths = laneEntries.map(({ style }) => style.dimensions.width);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + spacingX * Math.max(0, laneEntries.length - 1);
  const offsets: number[] = [];
  let cursor = -totalWidth / 2;

  for (const width of widths) {
    offsets.push(cursor + width / 2);
    cursor += width + spacingX;
  }

  return offsets;
}

function resolvePresentationLane(
  presentation: ResolvedTokenPresentation,
  laneOrder: readonly string[],
): string {
  if (presentation.lane !== null && laneOrder.includes(presentation.lane)) {
    return presentation.lane;
  }
  return laneOrder[0] ?? 'default';
}

function buildRenderEntries(tokens: readonly RunnerToken[]): readonly TokenRenderEntry[] {
  const entries: TokenRenderEntry[] = [];
  const grouped = new Map<string, RunnerToken[]>();

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

function stackGroupKey(token: RunnerToken): string {
  return JSON.stringify([
    'stack',
    token.zoneID,
    token.type,
    token.factionId,
    token.ownerID,
    token.faceUp,
  ]);
}

function resolveTokenColor(
  token: RunnerToken,
  tokenVisual: ResolvedTokenVisual,
  tokenRenderStyleProvider: TokenRenderStyleProvider,
): string {
  if (typeof tokenVisual.color === 'string' && tokenVisual.color.trim().length > 0) {
    return tokenVisual.color;
  }

  if (token.factionId !== null) {
    return tokenRenderStyleProvider.getColor(token.factionId, token.ownerID ?? asPlayerId(0));
  }
  if (token.ownerID !== null) {
    return tokenRenderStyleProvider.getColor(null, token.ownerID);
  }
  return NEUTRAL_TOKEN_COLOR;
}

function resolveStroke(token: RunnerToken, isInteractionHighlighted: boolean): PresentationStrokeSpec {
  if (token.isSelected) {
    return {
      color: '#f8fafc',
      width: 3.5,
      alpha: 1,
    };
  }

  if (isInteractionHighlighted) {
    return {
      color: '#60a5fa',
      width: 3,
      alpha: 1,
    };
  }

  if (token.isSelectable) {
    return {
      color: '#93c5fd',
      width: 2.5,
      alpha: 0.95,
    };
  }

  return {
    color: '#0f172a',
    width: 1.5,
    alpha: 0.9,
  };
}

function resolveCardContentSpec(
  cardTemplate: CardTemplate | null,
  tokenProperties: Readonly<Record<string, string | number | boolean>>,
): PresentationTokenCardContentSpec | null {
  if (cardTemplate === null) {
    return null;
  }

  return {
    template: cardTemplate,
    fields: resolveCardTemplateFields(cardTemplate.layout, tokenProperties),
  };
}

function resolveTokenShape(shape: TokenShape | undefined): TokenShape {
  return shape ?? 'circle';
}

function resolveTokenDimensions(
  shape: TokenShape,
  size: number | undefined,
  cardTemplate: CardTemplate | null = null,
  scale = 1,
): { readonly width: number; readonly height: number } {
  const normalizedSize = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : TOKEN_RADIUS * 2;
  const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (shape === 'card') {
    if (cardTemplate !== null) {
      return {
        width: Math.max(1, Math.round(cardTemplate.width * normalizedScale)),
        height: Math.max(1, Math.round(cardTemplate.height * normalizedScale)),
      };
    }
    return {
      width: Math.max(CARD_WIDTH, Math.round(normalizedSize * 0.9 * normalizedScale)),
      height: Math.max(CARD_HEIGHT, Math.round(normalizedSize * 1.25 * normalizedScale)),
    };
  }
  if (shape === 'square' || shape === 'cube') {
    const side = Math.max(16, Math.round(normalizedSize * normalizedScale));
    return {
      width: side,
      height: side,
    };
  }
  if (shape === 'triangle') {
    return {
      width: Math.max(16, Math.round(normalizedSize * 1.06 * normalizedScale)),
      height: Math.max(16, Math.round(normalizedSize * normalizedScale)),
    };
  }
  if (shape === 'meeple') {
    return {
      width: Math.max(16, Math.round(normalizedSize * 0.92 * normalizedScale)),
      height: Math.max(16, Math.round(normalizedSize * 1.12 * normalizedScale)),
    };
  }
  if (shape === 'diamond' || shape === 'hexagon' || shape === 'beveled-cylinder' || shape === 'round-disk') {
    return {
      width: Math.max(16, Math.round(normalizedSize * normalizedScale)),
      height: Math.max(16, Math.round(normalizedSize * normalizedScale)),
    };
  }
  return {
    width: normalizedSize * normalizedScale,
    height: normalizedSize * normalizedScale,
  };
}

function resolveCardTemplate(
  shape: TokenShape,
  tokenTypeId: string,
  tokenRenderStyleProvider: TokenRenderStyleProvider,
): CardTemplate | null {
  if (shape !== 'card') {
    return null;
  }
  return tokenRenderStyleProvider.getCardTemplateForTokenType(tokenTypeId);
}
