import { z } from 'zod';

import type { TokenShape, ZoneShape } from './visual-config-defaults.js';

export type LayoutMode = 'graph' | 'table' | 'track' | 'grid';

export interface LayoutConfig {
  readonly mode?: LayoutMode;
  readonly hints?: LayoutHints;
}

export interface LayoutHints {
  readonly regions?: readonly RegionHint[];
  readonly fixed?: readonly FixedPositionHint[];
}

export interface RegionHint {
  readonly name: string;
  readonly zones: readonly string[];
  readonly position?: string;
}

export interface FixedPositionHint {
  readonly zone: string;
  readonly x: number;
  readonly y: number;
}

export interface FactionVisualConfig {
  readonly color?: string;
  readonly displayName?: string;
}

export type LayoutRole = 'card' | 'forcePool' | 'hand' | 'other';

export interface ZoneVisualStyle {
  readonly shape?: ZoneShape;
  readonly width?: number;
  readonly height?: number;
  readonly color?: string;
}

export interface ZoneVisualOverride extends ZoneVisualStyle {
  readonly label?: string;
}

export interface AttributeRuleMatch {
  readonly category?: readonly string[];
  readonly attributeContains?: Readonly<Record<string, string>>;
}

export interface AttributeRule {
  readonly match: AttributeRuleMatch;
  readonly style: ZoneVisualStyle;
}

export interface ZonesConfig {
  readonly categoryStyles?: Readonly<Record<string, ZoneVisualStyle>>;
  readonly attributeRules?: readonly AttributeRule[];
  readonly overrides?: Readonly<Record<string, ZoneVisualOverride>>;
  readonly layoutRoles?: Readonly<Record<string, LayoutRole>>;
}

export interface TokenTypeVisualStyle {
  readonly shape?: TokenShape;
  readonly color?: string;
  readonly size?: number;
  readonly symbol?: string;
}

export interface CardTokenTypeSelectors {
  readonly ids?: readonly string[];
  readonly idPrefixes?: readonly string[];
}

export interface CardAnimationZoneRoles {
  readonly draw: readonly string[];
  readonly hand: readonly string[];
  readonly shared: readonly string[];
  readonly burn: readonly string[];
  readonly discard: readonly string[];
}

export interface CardAnimationConfig {
  readonly cardTokenTypes: CardTokenTypeSelectors;
  readonly zoneRoles: CardAnimationZoneRoles;
}

export interface AnimationsConfig {
  readonly actions?: Readonly<Record<string, string>>;
}

export interface CardFieldLayout {
  readonly y?: number;
  readonly fontSize?: number;
  readonly align?: string;
  readonly wrap?: number;
}

export interface CardTemplate {
  readonly width: number;
  readonly height: number;
  readonly layout?: Readonly<Record<string, CardFieldLayout>>;
}

export interface CardsConfig {
  readonly templates?: Readonly<Record<string, CardTemplate>>;
}

export interface VariablePanel {
  readonly name: string;
  readonly vars: readonly string[];
}

export interface VariableFormatting {
  readonly type: string;
  readonly min?: number;
  readonly max?: number;
  readonly labels?: readonly string[];
  readonly suffix?: string;
}

export interface VariablesConfig {
  readonly prominent?: readonly string[];
  readonly panels?: readonly VariablePanel[];
  readonly formatting?: Readonly<Record<string, VariableFormatting>>;
}

export interface VisualConfig {
  readonly version: 1;
  readonly layout?: LayoutConfig;
  readonly factions?: Readonly<Record<string, FactionVisualConfig>>;
  readonly zones?: ZonesConfig;
  readonly tokenTypes?: Readonly<Record<string, TokenTypeVisualStyle>>;
  readonly cardAnimation?: CardAnimationConfig;
  readonly animations?: AnimationsConfig;
  readonly cards?: CardsConfig;
  readonly variables?: VariablesConfig;
}

export const LayoutModeSchema = z.enum(['graph', 'table', 'track', 'grid']);
export const ZoneShapeSchema = z.enum([
  'rectangle',
  'circle',
  'hexagon',
  'diamond',
  'ellipse',
  'triangle',
  'line',
  'octagon',
]);
export const TokenShapeSchema = z.enum([
  'circle',
  'square',
  'triangle',
  'diamond',
  'hexagon',
  'cylinder',
  'meeple',
  'card',
  'cube',
  'round-disk',
]);
export const LayoutRoleSchema = z.enum(['card', 'forcePool', 'hand', 'other']);

const ZoneVisualStyleSchema = z.object({
  shape: ZoneShapeSchema.optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
});

const ZoneVisualOverrideSchema = ZoneVisualStyleSchema.extend({
  label: z.string().optional(),
});

const AttributeRuleMatchSchema = z.object({
  category: z.array(z.string()).optional(),
  attributeContains: z.record(z.string(), z.string()).optional(),
});

const AttributeRuleSchema = z.object({
  match: AttributeRuleMatchSchema,
  style: ZoneVisualStyleSchema,
});

const LayoutHintsSchema = z.object({
  regions: z.array(
    z.object({
      name: z.string(),
      zones: z.array(z.string()),
      position: z.string().optional(),
    }),
  ).optional(),
  fixed: z.array(
    z.object({
      zone: z.string(),
      x: z.number(),
      y: z.number(),
    }),
  ).optional(),
});

const LayoutConfigSchema = z.object({
  mode: LayoutModeSchema.optional(),
  hints: LayoutHintsSchema.optional(),
});

const CardTokenTypeSelectorsSchema = z.object({
  ids: z.array(z.string()).optional(),
  idPrefixes: z.array(z.string()).optional(),
});

const CardAnimationZoneRolesSchema = z.object({
  draw: z.array(z.string()),
  hand: z.array(z.string()),
  shared: z.array(z.string()),
  burn: z.array(z.string()),
  discard: z.array(z.string()),
});

const CardAnimationConfigSchema = z.object({
  cardTokenTypes: CardTokenTypeSelectorsSchema,
  zoneRoles: CardAnimationZoneRolesSchema,
});

const CardFieldLayoutSchema = z.object({
  y: z.number().optional(),
  fontSize: z.number().optional(),
  align: z.string().optional(),
  wrap: z.number().optional(),
});

const CardTemplateSchema = z.object({
  width: z.number(),
  height: z.number(),
  layout: z.record(z.string(), CardFieldLayoutSchema).optional(),
});

const VariableFormattingSchema = z.object({
  type: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
  labels: z.array(z.string()).optional(),
  suffix: z.string().optional(),
});

export const VisualConfigSchema = z.object({
  version: z.literal(1),
  layout: LayoutConfigSchema.optional(),
  factions: z.record(
    z.string(),
    z.object({
      color: z.string().optional(),
      displayName: z.string().optional(),
    }),
  ).optional(),
  zones: z.object({
    categoryStyles: z.record(z.string(), ZoneVisualStyleSchema).optional(),
    attributeRules: z.array(AttributeRuleSchema).optional(),
    overrides: z.record(z.string(), ZoneVisualOverrideSchema).optional(),
    layoutRoles: z.record(z.string(), LayoutRoleSchema).optional(),
  }).optional(),
  tokenTypes: z.record(
    z.string(),
    z.object({
      shape: TokenShapeSchema.optional(),
      color: z.string().optional(),
      size: z.number().optional(),
      symbol: z.string().optional(),
    }),
  ).optional(),
  cardAnimation: CardAnimationConfigSchema.optional(),
  animations: z.object({
    actions: z.record(z.string(), z.string()).optional(),
  }).optional(),
  cards: z.object({
    templates: z.record(z.string(), CardTemplateSchema).optional(),
  }).optional(),
  variables: z.object({
    prominent: z.array(z.string()).optional(),
    panels: z.array(
      z.object({
        name: z.string(),
        vars: z.array(z.string()),
      }),
    ).optional(),
    formatting: z.record(z.string(), VariableFormattingSchema).optional(),
  }).optional(),
});
