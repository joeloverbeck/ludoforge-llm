import {
  LABEL_FONT_NAME,
  STROKE_LABEL_FONT_NAME,
  type BitmapFontName,
} from '../canvas/text/bitmap-font-registry.js';
import type { Position } from '../spatial/position-types.js';
import {
  computeDefaultFactionColor,
  DEFAULT_TOKEN_SHAPE,
  DEFAULT_TOKEN_SIZE,
  DEFAULT_ZONE_HEIGHT,
  DEFAULT_ZONE_SHAPE,
  DEFAULT_ZONE_WIDTH,
  type TokenShape,
  type ZoneShape,
} from './visual-config-defaults.js';
import { hashStableValue } from '../utils/stable-hash.js';
import type {
  AnimationPresetOverrideKey,
  AnimationSequencingPolicy,
  VisualAnimationDescriptorKind,
} from '../animation/animation-types.js';
import type {
  ActionGroupPolicy,
  ZoneHighlightMoveEndpoints,
  ZoneHighlightSourceKind,
  AttributeRule,
  CardAnimationConfig,
  CardTemplate,
  MarkerBadgeConfig,
  RegionBoundaryConfig,
  RegionStyle,
  ShowdownSurfaceConfig,
  TableBackgroundConfig,
  TableOverlaysConfig,
  TokenTypeDefault,
  TokenTypeSelectors,
  TokenSymbolRule,
  TokenLaneLayoutDefinition,
  LayoutHints,
  LayoutMode,
  LayoutRole,
  StackBadgeStyle,
  VictoryTooltipBreakdown,
  VisualConfig,
  RunnerChromeTopBarStatusAlignment,
  ZoneTokenLayout,
  ConnectionAnchorConfig,
  ConnectionStyleConfig,
  ConnectionRouteDefinition,
} from './visual-config-types.js';
import { cloneConnectionRouteDefinition } from './connection-route-utils.js';

export interface ResolvedZoneVisual {
  readonly shape: ZoneShape;
  readonly width: number;
  readonly height: number;
  readonly color: string | null;
  readonly connectionStyleKey: string | null;
}

export interface ResolvedTokenVisual {
  readonly shape: TokenShape;
  readonly color: string | null;
  readonly size: number;
  readonly symbol: string | null;
  readonly backSymbol: string | null;
}

export interface ResolvedTokenSymbols {
  readonly symbol: string | null;
  readonly backSymbol: string | null;
}

export interface ResolvedTokenPresentation {
  readonly lane: string | null;
  readonly scale: number;
}

export interface ResolvedStackBadgeStyle {
  readonly fontName: BitmapFontName;
  readonly fontSize: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ResolvedTokenGridLayout {
  readonly mode: 'grid';
  readonly columns: number;
  readonly spacingX: number;
  readonly spacingY: number;
}

export interface ResolvedTokenLaneLayoutDefinition {
  readonly anchor: TokenLaneLayoutDefinition['anchor'];
  readonly pack: TokenLaneLayoutDefinition['pack'];
  readonly spacingX: number;
  readonly spacingY: number;
}

export interface ResolvedTokenLaneLayout {
  readonly mode: 'lanes';
  readonly laneGap: number;
  readonly laneOrder: readonly string[];
  readonly lanes: Readonly<Record<string, ResolvedTokenLaneLayoutDefinition>>;
}

export type ResolvedZoneTokenLayout = ResolvedTokenGridLayout | ResolvedTokenLaneLayout;

export interface ResolvedEdgeVisual {
  readonly color: string | null;
  readonly width: number;
  readonly alpha: number;
}

export interface EdgeStrokeStyle {
  readonly color: number;
  readonly width: number;
  readonly alpha: number;
}

export interface ResolvedZoneHighlightPolicy {
  readonly enabled: boolean;
  readonly includeKinds: readonly ZoneHighlightSourceKind[];
  readonly moveEndpoints: ZoneHighlightMoveEndpoints;
}

export interface ResolvedRunnerChromeTopBar {
  readonly statusAlignment: RunnerChromeTopBarStatusAlignment;
}

export class VisualConfigProvider {
  private readonly config: VisualConfig | null;
  readonly configHash: string;

  constructor(config: VisualConfig | null) {
    this.config = config;
    this.configHash = config === null ? 'null' : hashStableValue(config);
  }

  resolveZoneVisual(
    zoneId: string,
    category: string | null,
    attributes: Readonly<Record<string, unknown>> | null,
  ): ResolvedZoneVisual {
    const resolved: ResolvedZoneVisual = {
      shape: DEFAULT_ZONE_SHAPE,
      width: DEFAULT_ZONE_WIDTH,
      height: DEFAULT_ZONE_HEIGHT,
      color: null,
      connectionStyleKey: null,
    };

    const categoryStyle = category === null
      ? undefined
      : this.config?.zones?.categoryStyles?.[category];
    applyZoneStyle(resolved, categoryStyle);

    const rules = this.config?.zones?.attributeRules ?? [];
    for (const rule of rules) {
      if (matchesRule(rule, category, attributes)) {
        applyZoneStyle(resolved, rule.style);
      }
    }

    applyZoneStyle(resolved, this.config?.zones?.overrides?.[zoneId]);
    return resolved;
  }

  resolveConnectionStyle(styleKey: string): ConnectionStyleConfig | null {
    return this.config?.zones?.connectionStyles?.[styleKey] ?? null;
  }

  getConnectionRoutes(): ReadonlyMap<string, ConnectionRouteDefinition> {
    const configured = this.config?.zones?.connectionRoutes;
    if (configured === undefined) {
      return EMPTY_CONNECTION_ROUTES;
    }
    return new Map(
      Object.entries(configured).map(([zoneId, route]) => [
        zoneId,
        cloneConnectionRouteDefinition(route),
      ]),
    );
  }

  getConnectionAnchors(): ReadonlyMap<string, Position> {
    const configured = this.config?.zones?.connectionAnchors;
    if (configured === undefined) {
      return EMPTY_CONNECTION_ANCHORS;
    }
    return new Map(
      Object.entries(configured).map(([anchorId, anchor]) => [anchorId, normalizeConnectionAnchor(anchor)]),
    );
  }

  getZoneLabel(zoneId: string): string | null {
    return this.config?.zones?.overrides?.[zoneId]?.label ?? null;
  }

  getFactionColor(factionId: string): string {
    const configured = this.config?.factions?.[factionId]?.color;
    return configured ?? computeDefaultFactionColor(factionId);
  }

  getFactionDisplayName(factionId: string): string | null {
    return this.config?.factions?.[factionId]?.displayName ?? null;
  }

  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual {
    const style = this.getTokenTypeStyle(tokenTypeId);

    return {
      shape: style?.shape ?? DEFAULT_TOKEN_SHAPE,
      color: style?.color ?? null,
      size: style?.size ?? DEFAULT_TOKEN_SIZE,
      symbol: style?.symbol ?? null,
      backSymbol: style?.backSymbol ?? null,
    };
  }

  getTokenTypeDisplayName(tokenTypeId: string): string | null {
    const style = this.getTokenTypeStyle(tokenTypeId);
    return style?.displayName ?? null;
  }

  resolveTokenSymbols(
    tokenTypeId: string,
    tokenProperties: Readonly<Record<string, string | number | boolean>>,
  ): ResolvedTokenSymbols {
    const style = this.getTokenTypeStyle(tokenTypeId);
    const symbolRules = style?.symbolRules ?? [];

    let symbol: string | null = style?.symbol ?? null;
    let backSymbol: string | null = style?.backSymbol ?? null;

    for (const rule of symbolRules) {
      if (!matchesTokenSymbolRule(rule, tokenProperties)) {
        continue;
      }
      if (rule.symbol !== undefined) {
        symbol = rule.symbol;
      }
      if (rule.backSymbol !== undefined) {
        backSymbol = rule.backSymbol;
      }
    }

    return { symbol, backSymbol };
  }

  getTokenTypePresentation(tokenTypeId: string): ResolvedTokenPresentation {
    const presentation = this.getTokenTypeStyle(tokenTypeId)?.presentation;
    return {
      lane: presentation?.lane ?? null,
      scale: presentation?.scale ?? 1,
    };
  }

  resolveZoneTokenLayout(zoneId: string, category: string | null): ResolvedZoneTokenLayout {
    const configured = this.getConfiguredZoneTokenLayout(zoneId, category);
    return normalizeZoneTokenLayout(configured);
  }

  getStackBadgeStyle(): ResolvedStackBadgeStyle {
    return normalizeStackBadgeStyle(this.config?.tokens?.stackBadge);
  }

  private findTokenTypeDefault(tokenTypeId: string): TokenTypeDefault | null {
    const defaults = this.config?.tokenTypeDefaults ?? [];
    for (const entry of defaults) {
      if (matchesTokenTypeSelectors(tokenTypeId, entry.match)) {
        return entry;
      }
    }
    return null;
  }

  private getTokenTypeStyle(tokenTypeId: string): TokenTypeDefault['style'] | undefined {
    return this.config?.tokenTypes?.[tokenTypeId] ?? this.findTokenTypeDefault(tokenTypeId)?.style;
  }

  private getConfiguredZoneTokenLayout(zoneId: string, category: string | null): ZoneTokenLayout | undefined {
    const tokenLayouts = this.config?.zones?.tokenLayouts;
    if (tokenLayouts === undefined) {
      return undefined;
    }

    const assignedPresetId = category === null ? undefined : tokenLayouts.assignments?.byCategory?.[category];
    if (assignedPresetId !== undefined) {
      return tokenLayouts.presets?.[assignedPresetId];
    }

    const layoutRole = this.getLayoutRole(zoneId);
    if (layoutRole !== null) {
      const roleDefault = tokenLayouts.defaults?.[layoutRole];
      if (roleDefault !== undefined) {
        return roleDefault;
      }
    }

    return tokenLayouts.defaults?.other;
  }

  getDefaultCardDimensions(): { readonly width: number; readonly height: number } | null {
    const templates = this.config?.cards?.templates;
    if (templates === undefined) {
      return null;
    }
    const firstTemplate = Object.values(templates)[0];
    if (firstTemplate === undefined) {
      return null;
    }
    return { width: firstTemplate.width, height: firstTemplate.height };
  }

  getCardTemplate(templateId: string): CardTemplate | null {
    return this.config?.cards?.templates?.[templateId] ?? null;
  }

  getCardTemplateForTokenType(tokenTypeId: string): CardTemplate | null {
    const assignments = this.config?.cards?.assignments ?? [];
    for (const assignment of assignments) {
      if (!matchesTokenTypeSelectors(tokenTypeId, assignment.match)) {
        continue;
      }
      return this.getCardTemplate(assignment.template);
    }
    return null;
  }

  resolveEdgeStyle(edgeCategory: string | null, isHighlighted: boolean): ResolvedEdgeVisual {
    const resolved: ResolvedEdgeVisual = {
      color: '#6b7280',
      width: 1.5,
      alpha: 0.3,
    };

    applyEdgeStyle(resolved, this.config?.edges?.default);

    const categoryStyle = edgeCategory === null
      ? undefined
      : this.config?.edges?.categoryStyles?.[edgeCategory];
    applyEdgeStyle(resolved, categoryStyle);

    if (isHighlighted) {
      applyEdgeStyle(resolved, {
        color: '#93c5fd',
        width: 3,
        alpha: 0.7,
      });
      applyEdgeStyle(resolved, this.config?.edges?.highlighted);
    }

    return resolved;
  }

  getLayoutMode(hasAdjacency: boolean): LayoutMode {
    return this.config?.layout?.mode ?? (hasAdjacency ? 'graph' : 'table');
  }

  getLayoutRole(zoneId: string): LayoutRole | null {
    return this.config?.zones?.layoutRoles?.[zoneId] ?? null;
  }

  getLayoutRoles(): Readonly<Record<string, LayoutRole>> | null {
    return this.config?.zones?.layoutRoles ?? null;
  }

  getCardAnimation(): CardAnimationConfig | null {
    return this.config?.cardAnimation ?? null;
  }

  getAnimationPreset(actionId: AnimationPresetOverrideKey): string | null {
    return this.config?.animations?.actions?.[actionId] ?? null;
  }

  getSequencingPolicy(descriptorKind: VisualAnimationDescriptorKind): AnimationSequencingPolicy | null {
    const policy = this.config?.animations?.sequencing?.[descriptorKind];
    if (policy === undefined) {
      return null;
    }
    return {
      mode: policy.mode,
      ...(policy.staggerOffset !== undefined ? { staggerOffsetSeconds: policy.staggerOffset } : {}),
    };
  }

  getTimingConfig(descriptorKind: VisualAnimationDescriptorKind): number | null {
    return this.config?.animations?.timing?.[descriptorKind]?.duration ?? null;
  }

  getZoneHighlightPolicy(): ResolvedZoneHighlightPolicy {
    const policy = this.config?.animations?.zoneHighlights;
    const includeKinds = policy?.includeKinds ?? ['moveToken', 'cardDeal', 'cardBurn', 'createToken', 'destroyToken'];
    return {
      enabled: policy?.enabled ?? true,
      includeKinds,
      moveEndpoints: policy?.moveEndpoints ?? 'both',
    };
  }

  getRunnerChromeTopBar(): ResolvedRunnerChromeTopBar {
    return {
      statusAlignment: this.config?.runnerChrome?.topBar?.statusAlignment ?? 'center',
    };
  }

  getLayoutHints(): LayoutHints | null {
    return this.config?.layout?.hints ?? null;
  }

  getTableBackground(): TableBackgroundConfig | null {
    return this.config?.layout?.tableBackground ?? null;
  }

  getTableOverlays(): TableOverlaysConfig | null {
    return this.config?.tableOverlays ?? null;
  }

  getShowdownSurface(): ShowdownSurfaceConfig | null {
    return this.config?.runnerSurfaces?.showdown ?? null;
  }

  getPlayerSeatAnchorZones(): readonly string[] {
    return this.config?.tableOverlays?.playerSeatAnchorZones ?? [];
  }

  getPhaseBannerPhases(): ReadonlySet<string> {
    const phases = this.config?.phaseBanners?.phases;
    if (phases === undefined || phases.length === 0) {
      return EMPTY_STRING_SET;
    }
    return new Set(phases);
  }

  getVictoryTooltipBreakdown(seat: string): VictoryTooltipBreakdown | null {
    const breakdowns = this.config?.victoryStandings?.tooltipBreakdowns;
    if (breakdowns === undefined) {
      return null;
    }
    return breakdowns.find((b) => b.seat === seat) ?? null;
  }

  getActionDisplayName(actionId: string): string | null {
    return this.config?.actions?.[actionId]?.displayName ?? null;
  }

  getActionDescription(actionId: string): string | null {
    return this.config?.actions?.[actionId]?.description ?? null;
  }

  getChoicePrompt(actionId: string, paramName: string): string | null {
    return this.config?.actions?.[actionId]?.choices?.[paramName]?.prompt ?? null;
  }

  getChoiceDescription(actionId: string, paramName: string): string | null {
    return this.config?.actions?.[actionId]?.choices?.[paramName]?.description ?? null;
  }

  getChoiceOptionDisplayName(actionId: string, paramName: string, optionValue: string): string | null {
    return this.config?.actions?.[actionId]?.choices?.[paramName]?.options?.[optionValue]?.displayName ?? null;
  }

  getMarkerBadgeConfig(): MarkerBadgeConfig | null {
    return this.config?.zones?.markerBadge ?? null;
  }

  getActionGroupPolicy(): ActionGroupPolicy | null {
    return this.config?.actionGroupPolicy ?? null;
  }

  getRegionBoundaryConfig(): RegionBoundaryConfig | null {
    return this.config?.regions ?? null;
  }

  getRegionStyle(attributeValue: string): RegionStyle | null {
    return this.config?.regions?.styles?.[attributeValue] ?? null;
  }

  getHiddenZones(): ReadonlySet<string> {
    const hiddenZones = this.config?.zones?.hiddenZones;
    if (hiddenZones === undefined || hiddenZones.length === 0) {
      return EMPTY_STRING_SET;
    }
    return new Set(hiddenZones);
  }
}

const EMPTY_STRING_SET: ReadonlySet<string> = Object.freeze(new Set<string>());
const EMPTY_CONNECTION_ROUTES: ReadonlyMap<string, ConnectionRouteDefinition> = Object.freeze(new Map());
const EMPTY_CONNECTION_ANCHORS: ReadonlyMap<string, Position> = Object.freeze(new Map());
const DEFAULT_STACK_BADGE_STYLE: ResolvedStackBadgeStyle = Object.freeze({
  fontName: STROKE_LABEL_FONT_NAME,
  fontSize: 10,
  fill: '#f8fafc',
  stroke: '#000000',
  strokeWidth: 0,
  anchorX: 1,
  anchorY: 0,
  offsetX: -2,
  offsetY: 2,
});
const DEFAULT_GRID_TOKEN_LAYOUT: ResolvedTokenGridLayout = Object.freeze({
  mode: 'grid',
  columns: 6,
  spacingX: 36,
  spacingY: 36,
});

function applyEdgeStyle(
  target: { color: string | null; width: number; alpha: number },
  source:
    | {
      readonly color?: string | undefined;
      readonly width?: number | undefined;
      readonly alpha?: number | undefined;
    }
    | undefined,
): void {
  if (source === undefined) {
    return;
  }
  if (source.color !== undefined) {
    target.color = source.color;
  }
  if (source.width !== undefined) {
    target.width = source.width;
  }
  if (source.alpha !== undefined) {
    target.alpha = source.alpha;
  }
}

function applyZoneStyle(
  target: {
    shape: ZoneShape;
    width: number;
    height: number;
    color: string | null;
    connectionStyleKey: string | null;
  },
  source:
    | {
      readonly shape?: ZoneShape | undefined;
      readonly width?: number | undefined;
      readonly height?: number | undefined;
      readonly color?: string | undefined;
      readonly connectionStyleKey?: string | undefined;
    }
    | undefined,
): void {
  if (source === undefined) {
    return;
  }
  if (source.shape !== undefined) {
    target.shape = source.shape;
  }
  if (source.width !== undefined) {
    target.width = source.width;
  }
  if (source.height !== undefined) {
    target.height = source.height;
  }
  if (source.color !== undefined) {
    target.color = source.color;
  }
  if (source.connectionStyleKey !== undefined) {
    target.connectionStyleKey = source.connectionStyleKey;
  }
}

function matchesRule(
  rule: AttributeRule,
  category: string | null,
  attributes: Readonly<Record<string, unknown>> | null,
): boolean {
  const categoryFilters = rule.match.category;
  if (categoryFilters !== undefined) {
    if (category === null || !categoryFilters.includes(category)) {
      return false;
    }
  }

  const attributeContains = rule.match.attributeContains;
  if (attributeContains === undefined) {
    return true;
  }
  if (attributes === null) {
    return false;
  }

  for (const [key, expected] of Object.entries(attributeContains)) {
    const value = attributes[key];
    if (!attributeContainsValue(value, expected)) {
      return false;
    }
  }

  return true;
}

function attributeContainsValue(value: unknown, expected: string): boolean {
  if (typeof value === 'string') {
    return value.includes(expected);
  }

  if (Array.isArray(value)) {
    return value.some((entry) => typeof entry === 'string' && entry.includes(expected));
  }

  return false;
}

function matchesTokenTypeSelectors(tokenTypeId: string, selectors: TokenTypeSelectors): boolean {
  if (selectors.ids?.includes(tokenTypeId) === true) {
    return true;
  }

  const prefixes = selectors.idPrefixes ?? [];
  return prefixes.some((prefix) => tokenTypeId.startsWith(prefix));
}

function matchesTokenSymbolRule(
  rule: TokenSymbolRule,
  tokenProperties: Readonly<Record<string, string | number | boolean>>,
): boolean {
  for (const predicate of rule.when) {
    if (tokenProperties[predicate.prop] !== predicate.equals) {
      return false;
    }
  }
  return true;
}

function normalizeStackBadgeStyle(style: StackBadgeStyle | undefined): ResolvedStackBadgeStyle {
  if (style === undefined) {
    return DEFAULT_STACK_BADGE_STYLE;
  }

  return {
    fontName: resolveBitmapFontName(style.fontName) ?? DEFAULT_STACK_BADGE_STYLE.fontName,
    fontSize: style.fontSize,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    anchorX: style.anchorX,
    anchorY: style.anchorY,
    offsetX: style.offsetX,
    offsetY: style.offsetY,
  };
}

function normalizeConnectionAnchor(anchor: ConnectionAnchorConfig): Position {
  return {
    x: anchor.x,
    y: anchor.y,
  };
}

function resolveBitmapFontName(
  fontName: 'label' | 'labelStroke' | undefined,
): BitmapFontName | null {
  if (fontName === undefined) {
    return null;
  }
  return fontName === 'label' ? LABEL_FONT_NAME : STROKE_LABEL_FONT_NAME;
}

function normalizeZoneTokenLayout(layout: ZoneTokenLayout | undefined): ResolvedZoneTokenLayout {
  if (layout === undefined) {
    return DEFAULT_GRID_TOKEN_LAYOUT;
  }

  if (layout.mode === 'grid') {
    return {
      mode: 'grid',
      columns: layout.columns ?? DEFAULT_GRID_TOKEN_LAYOUT.columns,
      spacingX: layout.spacingX,
      spacingY: layout.spacingY,
    };
  }

  return {
    mode: 'lanes',
    laneGap: layout.laneGap,
    laneOrder: [...layout.laneOrder],
    lanes: Object.fromEntries(
      Object.entries(layout.lanes).map(([laneId, lane]) => [laneId, normalizeLaneLayoutDefinition(lane)]),
    ),
  };
}

function normalizeLaneLayoutDefinition(lane: TokenLaneLayoutDefinition): ResolvedTokenLaneLayoutDefinition {
  return {
    anchor: lane.anchor,
    pack: lane.pack,
    spacingX: lane.spacingX,
    spacingY: lane.spacingY ?? DEFAULT_GRID_TOKEN_LAYOUT.spacingY,
  };
}
