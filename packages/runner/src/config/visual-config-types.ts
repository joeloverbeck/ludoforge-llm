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

const RegionHintSchema = z.object({
  name: z.string(),
  zones: z.array(z.string()),
  position: z.string().optional(),
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

const LayoutConfigSchema = z.object({
  mode: LayoutModeSchema.optional(),
  hints: LayoutHintsSchema.optional(),
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

const TokenTypeVisualStyleSchema = z.object({
  shape: TokenShapeSchema.optional(),
  color: z.string().optional(),
  size: z.number().optional(),
  symbol: z.string().optional(),
  backSymbol: z.string().optional(),
});

const TokenTypeSelectorsSchema = z.object({
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
  fontSize: z.number().optional(),
  align: z.string().optional(),
  wrap: z.number().optional(),
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

export const VisualConfigSchema = z.object({
  version: z.literal(1),
  layout: LayoutConfigSchema.optional(),
  factions: z.record(z.string(), FactionVisualConfigSchema).optional(),
  zones: ZonesConfigSchema.optional(),
  edges: EdgesConfigSchema.optional(),
  tokenTypes: z.record(z.string(), TokenTypeVisualStyleSchema).optional(),
  cardAnimation: CardAnimationConfigSchema.optional(),
  animations: AnimationsConfigSchema.optional(),
  cards: CardsConfigSchema.optional(),
  variables: VariablesConfigSchema.optional(),
});

export type LayoutMode = z.infer<typeof LayoutModeSchema>;
export type LayoutRole = z.infer<typeof LayoutRoleSchema>;

export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;
export type LayoutHints = z.infer<typeof LayoutHintsSchema>;
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
export type TokenTypeVisualStyle = z.infer<typeof TokenTypeVisualStyleSchema>;
export type TokenTypeSelectors = z.infer<typeof TokenTypeSelectorsSchema>;
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
export type VisualConfig = z.infer<typeof VisualConfigSchema>;
