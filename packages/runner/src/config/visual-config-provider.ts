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
  ZoneHighlightMoveEndpoints,
  ZoneHighlightSourceKind,
  AttributeRule,
  CardAnimationConfig,
  CardTemplate,
  TableBackgroundConfig,
  TableOverlaysConfig,
  TokenTypeDefault,
  TokenTypeSelectors,
  TokenSymbolRule,
  LayoutHints,
  LayoutMode,
  LayoutRole,
  VariablesConfig,
  VisualConfig,
} from './visual-config-types.js';

export interface ResolvedZoneVisual {
  readonly shape: ZoneShape;
  readonly width: number;
  readonly height: number;
  readonly color: string | null;
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
    const style = this.config?.tokenTypes?.[tokenTypeId] ?? this.findTokenTypeDefault(tokenTypeId)?.style;

    return {
      shape: style?.shape ?? DEFAULT_TOKEN_SHAPE,
      color: style?.color ?? null,
      size: style?.size ?? DEFAULT_TOKEN_SIZE,
      symbol: style?.symbol ?? null,
      backSymbol: style?.backSymbol ?? null,
    };
  }

  getTokenTypeDisplayName(tokenTypeId: string): string | null {
    const style = this.config?.tokenTypes?.[tokenTypeId] ?? this.findTokenTypeDefault(tokenTypeId)?.style;
    return style?.displayName ?? null;
  }

  resolveTokenSymbols(
    tokenTypeId: string,
    tokenProperties: Readonly<Record<string, string | number | boolean>>,
  ): ResolvedTokenSymbols {
    const style = this.config?.tokenTypes?.[tokenTypeId] ?? this.findTokenTypeDefault(tokenTypeId)?.style;
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

  private findTokenTypeDefault(tokenTypeId: string): TokenTypeDefault | null {
    const defaults = this.config?.tokenTypeDefaults ?? [];
    for (const entry of defaults) {
      if (matchesTokenTypeSelectors(tokenTypeId, entry.match)) {
        return entry;
      }
    }
    return null;
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

  getVariablesConfig(): VariablesConfig | null {
    return this.config?.variables ?? null;
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

  getPlayerSeatAnchorZones(): readonly string[] {
    return this.config?.tableOverlays?.playerSeatAnchorZones ?? [];
  }

  getPhaseBannerPhases(): ReadonlySet<string> {
    const phases = this.config?.phaseBanners?.phases;
    if (phases === undefined || phases.length === 0) {
      return EMPTY_PHASE_BANNER_SET;
    }
    return new Set(phases);
  }
}

const EMPTY_PHASE_BANNER_SET: ReadonlySet<string> = Object.freeze(new Set<string>());

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
  target: { shape: ZoneShape; width: number; height: number; color: string | null },
  source:
    | {
      readonly shape?: ZoneShape | undefined;
      readonly width?: number | undefined;
      readonly height?: number | undefined;
      readonly color?: string | undefined;
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
