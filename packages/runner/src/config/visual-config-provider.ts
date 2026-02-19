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
import type {
  AttributeRule,
  CardAnimationConfig,
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
}

export class VisualConfigProvider {
  private readonly config: VisualConfig | null;

  constructor(config: VisualConfig | null) {
    this.config = config;
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
    const style = this.config?.tokenTypes?.[tokenTypeId];

    return {
      shape: style?.shape ?? DEFAULT_TOKEN_SHAPE,
      color: style?.color ?? null,
      size: style?.size ?? DEFAULT_TOKEN_SIZE,
      symbol: style?.symbol ?? null,
    };
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

  getAnimationPreset(actionId: string): string | null {
    return this.config?.animations?.actions?.[actionId] ?? null;
  }

  getVariablesConfig(): VariablesConfig | null {
    return this.config?.variables ?? null;
  }
}

function applyZoneStyle(
  target: { shape: ZoneShape; width: number; height: number; color: string | null },
  source:
    | {
      readonly shape?: ZoneShape;
      readonly width?: number;
      readonly height?: number;
      readonly color?: string;
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
