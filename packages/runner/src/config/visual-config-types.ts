import { z } from 'zod';
import { ANIMATION_PRESET_OVERRIDE_KEYS } from '../animation/animation-types.js';

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
  'beveled-cylinder',
  'meeple',
  'card',
  'cube',
  'round-disk',
]);
export const LayoutRoleSchema = z.enum(['card', 'forcePool', 'hand', 'other']);

export const CompassPositionSchema = z.enum([
  'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'center',
]);

const RegionHintSchema = z.object({
  name: z.string(),
  zones: z.array(z.string()),
  position: CompassPositionSchema.optional(),
});

const FixedPositionHintSchema = z.object({
  zone: z.string(),
  x: z.number(),
  y: z.number(),
});

const LayoutHintsSchema = z.object({
  regions: z.array(RegionHintSchema).optional(),
  fixed: z.array(FixedPositionHintSchema).optional(),
});

const TableBackgroundSchema = z.object({
  color: z.string().optional(),
  shape: z.enum(['ellipse', 'rectangle', 'roundedRect']).optional(),
  paddingX: z.number().optional(),
  paddingY: z.number().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().optional(),
});

const LayoutConfigSchema = z.object({
  mode: LayoutModeSchema.optional(),
  hints: LayoutHintsSchema.optional(),
  tableBackground: TableBackgroundSchema.optional(),
});

const FactionVisualConfigSchema = z.object({
  color: z.string().optional(),
  displayName: z.string().optional(),
});

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

const ZonesConfigSchema = z.object({
  categoryStyles: z.record(z.string(), ZoneVisualStyleSchema).optional(),
  attributeRules: z.array(AttributeRuleSchema).optional(),
  overrides: z.record(z.string(), ZoneVisualOverrideSchema).optional(),
  layoutRoles: z.record(z.string(), LayoutRoleSchema).optional(),
});

const EdgeVisualStyleSchema = z.object({
  color: z.string().optional(),
  width: z.number().optional(),
  alpha: z.number().optional(),
});

const EdgesConfigSchema = z.object({
  default: EdgeVisualStyleSchema.optional(),
  highlighted: EdgeVisualStyleSchema.optional(),
  categoryStyles: z.record(z.string(), EdgeVisualStyleSchema).optional(),
});

const TokenPropertyMatchSchema = z.object({
  prop: z.string(),
  equals: z.union([z.string(), z.number(), z.boolean()]),
});

const TokenSymbolRuleSchema = z.object({
  when: z.array(TokenPropertyMatchSchema).min(1),
  symbol: z.string().nullable().optional(),
  backSymbol: z.string().nullable().optional(),
}).refine(
  (rule) => rule.symbol !== undefined || rule.backSymbol !== undefined,
  { message: 'Token symbol rule must define symbol and/or backSymbol.' },
);

const TokenTypeVisualStyleSchema = z.object({
  shape: TokenShapeSchema.optional(),
  color: z.string().optional(),
  size: z.number().optional(),
  symbol: z.string().optional(),
  backSymbol: z.string().optional(),
  symbolRules: z.array(TokenSymbolRuleSchema).optional(),
  displayName: z.string().optional(),
});

const TokenTypeSelectorsSchema = z.object({
  ids: z.array(z.string()).optional(),
  idPrefixes: z.array(z.string()).optional(),
});

const TokenTypeDefaultSchema = z.object({
  match: TokenTypeSelectorsSchema,
  style: TokenTypeVisualStyleSchema,
});

const CardAnimationZoneRolesSchema = z.object({
  draw: z.array(z.string()),
  hand: z.array(z.string()),
  shared: z.array(z.string()),
  burn: z.array(z.string()),
  discard: z.array(z.string()),
});

const CardAnimationConfigSchema = z.object({
  cardTokenTypes: TokenTypeSelectorsSchema,
  zoneRoles: CardAnimationZoneRolesSchema,
});

const AnimationActionsSchema = z.object(
  Object.fromEntries(ANIMATION_PRESET_OVERRIDE_KEYS.map((key) => [key, z.string().optional()])) as Record<
    (typeof ANIMATION_PRESET_OVERRIDE_KEYS)[number],
    z.ZodOptional<z.ZodString>
  >,
).strict();

const AnimationsConfigSchema = z.object({
  actions: AnimationActionsSchema.optional(),
});

const CardFieldLayoutSchema = z.object({
  y: z.number().optional(),
  x: z.number().optional(),
  fontSize: z.number().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  wrap: z.number().optional(),
  sourceField: z.string().optional(),
  symbolMap: z.record(z.string(), z.string()).optional(),
  colorFromProp: z.string().optional(),
  colorMap: z.record(z.string(), z.string()).optional(),
});

const CardTemplateSchema = z.object({
  width: z.number(),
  height: z.number(),
  layout: z.record(z.string(), CardFieldLayoutSchema).optional(),
});

const CardTemplateAssignmentSchema = z.object({
  match: TokenTypeSelectorsSchema,
  template: z.string(),
});

const CardsConfigSchema = z.object({
  templates: z.record(z.string(), CardTemplateSchema).optional(),
  assignments: z.array(CardTemplateAssignmentSchema).optional(),
});

const VariablePanelSchema = z.object({
  name: z.string(),
  vars: z.array(z.string()),
});

const VariableFormattingSchema = z.object({
  type: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
  labels: z.array(z.string()).optional(),
  suffix: z.string().optional(),
});

const VariablesConfigSchema = z.object({
  prominent: z.array(z.string()).optional(),
  panels: z.array(VariablePanelSchema).optional(),
  formatting: z.record(z.string(), VariableFormattingSchema).optional(),
});

const TableOverlayItemSchema = z.object({
  kind: z.enum(['globalVar', 'perPlayerVar', 'marker']),
  varName: z.string(),
  label: z.string().optional(),
  position: z.enum(['tableCenter', 'playerSeat']),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  fontSize: z.number().optional(),
  color: z.string().optional(),
  markerShape: z.enum(['circle', 'badge']).optional(),
});

const TableOverlaysSchema = z.object({
  items: z.array(TableOverlayItemSchema).optional(),
});

export const VisualConfigSchema = z.object({
  version: z.literal(1),
  layout: LayoutConfigSchema.optional(),
  factions: z.record(z.string(), FactionVisualConfigSchema).optional(),
  zones: ZonesConfigSchema.optional(),
  edges: EdgesConfigSchema.optional(),
  tokenTypes: z.record(z.string(), TokenTypeVisualStyleSchema).optional(),
  tokenTypeDefaults: z.array(TokenTypeDefaultSchema).optional(),
  cardAnimation: CardAnimationConfigSchema.optional(),
  animations: AnimationsConfigSchema.optional(),
  cards: CardsConfigSchema.optional(),
  variables: VariablesConfigSchema.optional(),
  tableOverlays: TableOverlaysSchema.optional(),
});

export type LayoutMode = z.infer<typeof LayoutModeSchema>;
export type LayoutRole = z.infer<typeof LayoutRoleSchema>;
export type CompassPosition = z.infer<typeof CompassPositionSchema>;

export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;
export type LayoutHints = z.infer<typeof LayoutHintsSchema>;
export type TableBackgroundConfig = z.infer<typeof TableBackgroundSchema>;
export type RegionHint = z.infer<typeof RegionHintSchema>;
export type FixedPositionHint = z.infer<typeof FixedPositionHintSchema>;
export type FactionVisualConfig = z.infer<typeof FactionVisualConfigSchema>;
export type ZoneVisualStyle = z.infer<typeof ZoneVisualStyleSchema>;
export type ZoneVisualOverride = z.infer<typeof ZoneVisualOverrideSchema>;
export type AttributeRuleMatch = z.infer<typeof AttributeRuleMatchSchema>;
export type AttributeRule = z.infer<typeof AttributeRuleSchema>;
export type ZonesConfig = z.infer<typeof ZonesConfigSchema>;
export type EdgeVisualStyle = z.infer<typeof EdgeVisualStyleSchema>;
export type EdgesConfig = z.infer<typeof EdgesConfigSchema>;
export type TokenPropertyMatch = z.infer<typeof TokenPropertyMatchSchema>;
export type TokenSymbolRule = z.infer<typeof TokenSymbolRuleSchema>;
export type TokenTypeVisualStyle = z.infer<typeof TokenTypeVisualStyleSchema>;
export type TokenTypeSelectors = z.infer<typeof TokenTypeSelectorsSchema>;
export type TokenTypeDefault = z.infer<typeof TokenTypeDefaultSchema>;
export type CardAnimationZoneRoles = z.infer<typeof CardAnimationZoneRolesSchema>;
export type CardAnimationConfig = z.infer<typeof CardAnimationConfigSchema>;
export type AnimationsConfig = z.infer<typeof AnimationsConfigSchema>;
export type CardFieldLayout = z.infer<typeof CardFieldLayoutSchema>;
export type CardTemplate = z.infer<typeof CardTemplateSchema>;
export type CardTemplateAssignment = z.infer<typeof CardTemplateAssignmentSchema>;
export type CardsConfig = z.infer<typeof CardsConfigSchema>;
export type VariablePanel = z.infer<typeof VariablePanelSchema>;
export type VariableFormatting = z.infer<typeof VariableFormattingSchema>;
export type VariablesConfig = z.infer<typeof VariablesConfigSchema>;
export type TableOverlayItemConfig = z.infer<typeof TableOverlayItemSchema>;
export type TableOverlaysConfig = z.infer<typeof TableOverlaysSchema>;
export type VisualConfig = z.infer<typeof VisualConfigSchema>;
