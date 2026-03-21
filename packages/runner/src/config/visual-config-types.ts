import { z } from 'zod';
import { ANIMATION_PRESET_OVERRIDE_KEYS } from '../animation/animation-types.js';

export const BitmapFontRoleSchema = z.enum(['label', 'labelStroke']);
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
  'connection',
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

const RegionBorderStyleSchema = z.enum(['solid', 'dashed']);

const RegionStyleSchema = z.object({
  fillColor: z.string(),
  fillAlpha: z.number().optional(),
  borderColor: z.string().optional(),
  borderStyle: RegionBorderStyleSchema.optional(),
  borderWidth: z.number().optional(),
  label: z.string().optional(),
});

const RegionBoundaryConfigSchema = z.object({
  groupByAttribute: z.string().optional(),
  padding: z.number().optional(),
  cornerRadius: z.number().optional(),
  styles: z.record(z.string(), RegionStyleSchema).optional(),
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
  connectionStyleKey: z.string().optional(),
});

const ConnectionStyleConfigSchema = z.object({
  strokeWidth: z.number(),
  strokeColor: z.string(),
  strokeAlpha: z.number().optional(),
  wavy: z.boolean().optional(),
  waveAmplitude: z.number().optional(),
  waveFrequency: z.number().optional(),
});

const ConnectionEndpointPairSchema = z.tuple([z.string(), z.string()]);

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

const MarkerBadgeColorEntrySchema = z.object({
  color: z.string(),
  abbreviation: z.string(),
});

const MarkerBadgeConfigSchema = z.object({
  markerId: z.string(),
  colorMap: z.record(z.string(), MarkerBadgeColorEntrySchema),
  width: z.number().optional(),
  height: z.number().optional(),
});

const PositiveNumberSchema = z.number().positive();
const PositiveIntegerSchema = z.number().int().positive();

const TokenPresentationSchema = z.object({
  lane: z.string(),
  scale: PositiveNumberSchema,
});

const StackBadgeStyleSchema = z.object({
  fontName: BitmapFontRoleSchema.optional(),
  fontSize: PositiveNumberSchema,
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: PositiveNumberSchema,
  anchorX: z.number(),
  anchorY: z.number(),
  offsetX: z.number(),
  offsetY: z.number(),
}).strict();

const TokenGridLayoutSchema = z.object({
  mode: z.literal('grid'),
  columns: PositiveIntegerSchema.optional(),
  spacingX: PositiveNumberSchema,
  spacingY: PositiveNumberSchema,
});

const LaneAnchorSchema = z.enum(['center', 'belowPreviousLane']);
const LanePackSchema = z.enum(['centeredRow']);

const TokenLaneLayoutDefinitionSchema = z.object({
  anchor: LaneAnchorSchema,
  pack: LanePackSchema,
  spacingX: PositiveNumberSchema,
  spacingY: PositiveNumberSchema.optional(),
});

const TokenLaneLayoutPresetSchema = z.object({
  mode: z.literal('lanes'),
  laneGap: PositiveNumberSchema,
  laneOrder: z.array(z.string()).min(1),
  lanes: z.record(z.string(), TokenLaneLayoutDefinitionSchema),
}).superRefine((value, context) => {
  const laneDefinitionIds = new Set(Object.keys(value.lanes));
  for (const laneId of value.laneOrder) {
    if (!laneDefinitionIds.has(laneId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lanes', laneId],
        message: `laneOrder references undefined lane "${laneId}".`,
      });
    }
  }

  const laneOrderIds = new Set(value.laneOrder);
  for (const laneId of laneDefinitionIds) {
    if (!laneOrderIds.has(laneId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['laneOrder'],
        message: `lane "${laneId}" must appear in laneOrder.`,
      });
    }
  }
});

const ZoneTokenLayoutSchema = z.discriminatedUnion('mode', [
  TokenGridLayoutSchema,
  TokenLaneLayoutPresetSchema,
]);

const ZoneTokenLayoutDefaultsSchema = z.object({
  card: ZoneTokenLayoutSchema.optional(),
  forcePool: ZoneTokenLayoutSchema.optional(),
  hand: ZoneTokenLayoutSchema.optional(),
  other: ZoneTokenLayoutSchema.optional(),
});

const ZoneTokenLayoutAssignmentsSchema = z.object({
  byCategory: z.record(z.string(), z.string()).optional(),
}).superRefine((value, context) => {
  if (value.byCategory === undefined || Object.keys(value.byCategory).length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['byCategory'],
      message: 'tokenLayouts.assignments.byCategory must include at least one category assignment when assignments are present.',
    });
  }
});

const ZoneTokenLayoutsSchema = z.object({
  defaults: ZoneTokenLayoutDefaultsSchema.optional(),
  presets: z.record(z.string(), ZoneTokenLayoutSchema).optional(),
  assignments: ZoneTokenLayoutAssignmentsSchema.optional(),
}).superRefine((value, context) => {
  const presetIds = new Set(Object.keys(value.presets ?? {}));
  const byCategory = value.assignments?.byCategory;
  if (byCategory === undefined) {
    return;
  }

  for (const [category, presetId] of Object.entries(byCategory)) {
    if (!presetIds.has(presetId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignments', 'byCategory', category],
        message: `tokenLayouts assignment references unknown preset "${presetId}".`,
      });
    }
  }
});

const ZonesConfigSchema = z.object({
  categoryStyles: z.record(z.string(), ZoneVisualStyleSchema).optional(),
  connectionStyles: z.record(z.string(), ConnectionStyleConfigSchema).optional(),
  connectionEndpoints: z.record(z.string(), ConnectionEndpointPairSchema).optional(),
  attributeRules: z.array(AttributeRuleSchema).optional(),
  overrides: z.record(z.string(), ZoneVisualOverrideSchema).optional(),
  layoutRoles: z.record(z.string(), LayoutRoleSchema).optional(),
  tokenLayouts: ZoneTokenLayoutsSchema.optional(),
  hiddenZones: z.array(z.string()).optional(),
  markerBadge: MarkerBadgeConfigSchema.optional(),
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
  presentation: TokenPresentationSchema.optional(),
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

const AnimationSequencingModeSchema = z.enum(['sequential', 'parallel', 'stagger']);

const AnimationSequencingPolicySchema = z.object({
  mode: AnimationSequencingModeSchema,
  staggerOffset: z.number().positive().optional(),
});

const AnimationSequencingSchema = z.object(
  Object.fromEntries(ANIMATION_PRESET_OVERRIDE_KEYS.map((key) => [key, AnimationSequencingPolicySchema.optional()])) as Record<
    (typeof ANIMATION_PRESET_OVERRIDE_KEYS)[number],
    z.ZodOptional<typeof AnimationSequencingPolicySchema>
  >,
).strict();

const AnimationTimingEntrySchema = z.object({
  duration: z.number().positive(),
});

const AnimationTimingSchema = z.object(
  Object.fromEntries(ANIMATION_PRESET_OVERRIDE_KEYS.map((key) => [key, AnimationTimingEntrySchema.optional()])) as Record<
    (typeof ANIMATION_PRESET_OVERRIDE_KEYS)[number],
    z.ZodOptional<typeof AnimationTimingEntrySchema>
  >,
).strict();

const ZoneHighlightSourceKindSchema = z.enum(['moveToken', 'cardDeal', 'cardBurn', 'createToken', 'destroyToken']);
const ZoneHighlightMoveEndpointsSchema = z.enum(['from', 'to', 'both']);

const ZoneHighlightPolicySchema = z.object({
  enabled: z.boolean().optional(),
  includeKinds: z.array(ZoneHighlightSourceKindSchema).optional(),
  moveEndpoints: ZoneHighlightMoveEndpointsSchema.optional(),
});

const AnimationsConfigSchema = z.object({
  actions: AnimationActionsSchema.optional(),
  sequencing: AnimationSequencingSchema.optional(),
  timing: AnimationTimingSchema.optional(),
  zoneHighlights: ZoneHighlightPolicySchema.optional(),
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

const TokensConfigSchema = z.object({
  stackBadge: StackBadgeStyleSchema.optional(),
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
  playerSeatAnchorZones: z.array(z.string()).min(1).optional(),
  items: z.array(TableOverlayItemSchema).optional(),
}).superRefine((value, context) => {
  const items = value.items ?? [];
  const requiresPlayerSeatAnchors = items.some((item) => item.position === 'playerSeat');
  if (requiresPlayerSeatAnchors && (value.playerSeatAnchorZones === undefined || value.playerSeatAnchorZones.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['playerSeatAnchorZones'],
      message: 'tableOverlays.playerSeatAnchorZones is required when any tableOverlays item uses position "playerSeat".',
    });
  }
});

const ShowdownVisibilitySchema = z.object({
  phase: z.string(),
}).strict();

const ShowdownRankingSourceSchema = z.object({
  kind: z.literal('perPlayerVar'),
  name: z.string(),
}).strict();

const ShowdownZoneSelectorSchema = z.object({
  zones: z.array(z.string()).min(1),
}).strict();

const ShowdownSurfaceSchema = z.object({
  when: ShowdownVisibilitySchema,
  ranking: z.object({
    source: ShowdownRankingSourceSchema,
    hideZeroScores: z.boolean().optional(),
  }).strict(),
  communityCards: ShowdownZoneSelectorSchema,
  playerCards: ShowdownZoneSelectorSchema,
}).strict();

const RunnerSurfacesConfigSchema = z.object({
  showdown: ShowdownSurfaceSchema.optional(),
}).strict();

const PhaseBannersSchema = z.object({
  phases: z.array(z.string()).min(1),
});

const VictoryTooltipComponentSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
});

const VictoryTooltipBreakdownSchema = z.object({
  seat: z.string(),
  components: z.array(VictoryTooltipComponentSchema),
});

const VictoryStandingsVisualSchema = z.object({
  tooltipBreakdowns: z.array(VictoryTooltipBreakdownSchema),
});

const ActionChoiceOptionVisualSchema = z.object({
  displayName: z.string().optional(),
});

const ActionChoiceVisualSchema = z.object({
  prompt: z.string().optional(),
  description: z.string().optional(),
  options: z.record(z.string(), ActionChoiceOptionVisualSchema).optional(),
});

const ActionVisualSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  choices: z.record(z.string(), ActionChoiceVisualSchema).optional(),
});

const ActionGroupSynthesizeEntrySchema = z.object({
  fromClass: z.string(),
  intoGroup: z.string(),
  appendTooltipFrom: z.array(z.string()).optional(),
});

const ActionGroupPolicySchema = z.object({
  synthesize: z.array(ActionGroupSynthesizeEntrySchema).optional(),
  hide: z.array(z.string()).optional(),
});

const RunnerChromeTopBarStatusAlignmentSchema = z.enum(['center', 'start']);

const RunnerChromeTopBarSchema = z.object({
  statusAlignment: RunnerChromeTopBarStatusAlignmentSchema.optional(),
}).strict();

const RunnerChromeConfigSchema = z.object({
  topBar: RunnerChromeTopBarSchema.optional(),
}).strict();

export const VisualConfigSchema = z.object({
  version: z.literal(1),
  layout: LayoutConfigSchema.optional(),
  factions: z.record(z.string(), FactionVisualConfigSchema).optional(),
  zones: ZonesConfigSchema.optional(),
  edges: EdgesConfigSchema.optional(),
  tokens: TokensConfigSchema.optional(),
  tokenTypes: z.record(z.string(), TokenTypeVisualStyleSchema).optional(),
  actions: z.record(z.string(), ActionVisualSchema).optional(),
  tokenTypeDefaults: z.array(TokenTypeDefaultSchema).optional(),
  cardAnimation: CardAnimationConfigSchema.optional(),
  animations: AnimationsConfigSchema.optional(),
  cards: CardsConfigSchema.optional(),
  tableOverlays: TableOverlaysSchema.optional(),
  runnerSurfaces: RunnerSurfacesConfigSchema.optional(),
  phaseBanners: PhaseBannersSchema.optional(),
  victoryStandings: VictoryStandingsVisualSchema.optional(),
  actionGroupPolicy: ActionGroupPolicySchema.optional(),
  regions: RegionBoundaryConfigSchema.optional(),
  runnerChrome: RunnerChromeConfigSchema.optional(),
}).strict();

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
export type ConnectionStyleConfig = z.infer<typeof ConnectionStyleConfigSchema>;
export type ConnectionEndpointPair = z.infer<typeof ConnectionEndpointPairSchema>;
export type AttributeRuleMatch = z.infer<typeof AttributeRuleMatchSchema>;
export type AttributeRule = z.infer<typeof AttributeRuleSchema>;
export type MarkerBadgeColorEntry = z.infer<typeof MarkerBadgeColorEntrySchema>;
export type MarkerBadgeConfig = z.infer<typeof MarkerBadgeConfigSchema>;
export type TokenPresentation = z.infer<typeof TokenPresentationSchema>;
export type StackBadgeStyle = z.infer<typeof StackBadgeStyleSchema>;
export type TokenGridLayout = z.infer<typeof TokenGridLayoutSchema>;
export type TokenLaneLayoutDefinition = z.infer<typeof TokenLaneLayoutDefinitionSchema>;
export type TokenLaneLayoutPreset = z.infer<typeof TokenLaneLayoutPresetSchema>;
export type ZoneTokenLayout = z.infer<typeof ZoneTokenLayoutSchema>;
export type ZoneTokenLayoutDefaults = z.infer<typeof ZoneTokenLayoutDefaultsSchema>;
export type ZoneTokenLayoutAssignments = z.infer<typeof ZoneTokenLayoutAssignmentsSchema>;
export type ZoneTokenLayouts = z.infer<typeof ZoneTokenLayoutsSchema>;
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
export type AnimationTimingEntry = z.infer<typeof AnimationTimingEntrySchema>;
export type AnimationTimingConfig = z.infer<typeof AnimationTimingSchema>;
export type ZoneHighlightSourceKind = z.infer<typeof ZoneHighlightSourceKindSchema>;
export type ZoneHighlightMoveEndpoints = z.infer<typeof ZoneHighlightMoveEndpointsSchema>;
export type ZoneHighlightPolicy = z.infer<typeof ZoneHighlightPolicySchema>;
export type AnimationsConfig = z.infer<typeof AnimationsConfigSchema>;
export type CardFieldLayout = z.infer<typeof CardFieldLayoutSchema>;
export type CardTemplate = z.infer<typeof CardTemplateSchema>;
export type CardTemplateAssignment = z.infer<typeof CardTemplateAssignmentSchema>;
export type CardsConfig = z.infer<typeof CardsConfigSchema>;
export type TokensConfig = z.infer<typeof TokensConfigSchema>;
export type TableOverlayItemConfig = z.infer<typeof TableOverlayItemSchema>;
export type TableOverlaysConfig = z.infer<typeof TableOverlaysSchema>;
export type ShowdownVisibilityConfig = z.infer<typeof ShowdownVisibilitySchema>;
export type ShowdownRankingSourceConfig = z.infer<typeof ShowdownRankingSourceSchema>;
export type ShowdownZoneSelectorConfig = z.infer<typeof ShowdownZoneSelectorSchema>;
export type ShowdownSurfaceConfig = z.infer<typeof ShowdownSurfaceSchema>;
export type RunnerSurfacesConfig = z.infer<typeof RunnerSurfacesConfigSchema>;
export type PhaseBannersConfig = z.infer<typeof PhaseBannersSchema>;
export type VictoryTooltipComponent = z.infer<typeof VictoryTooltipComponentSchema>;
export type VictoryTooltipBreakdown = z.infer<typeof VictoryTooltipBreakdownSchema>;
export type VictoryStandingsVisualConfig = z.infer<typeof VictoryStandingsVisualSchema>;
export type ActionChoiceOptionVisual = z.infer<typeof ActionChoiceOptionVisualSchema>;
export type ActionChoiceVisual = z.infer<typeof ActionChoiceVisualSchema>;
export type ActionVisual = z.infer<typeof ActionVisualSchema>;
export type ActionGroupSynthesizeEntry = z.infer<typeof ActionGroupSynthesizeEntrySchema>;
export type ActionGroupPolicy = z.infer<typeof ActionGroupPolicySchema>;
export type RegionBorderStyle = z.infer<typeof RegionBorderStyleSchema>;
export type RegionStyle = z.infer<typeof RegionStyleSchema>;
export type RegionBoundaryConfig = z.infer<typeof RegionBoundaryConfigSchema>;
export type RunnerChromeTopBarStatusAlignment = z.infer<typeof RunnerChromeTopBarStatusAlignmentSchema>;
export type RunnerChromeTopBarConfig = z.infer<typeof RunnerChromeTopBarSchema>;
export type RunnerChromeConfig = z.infer<typeof RunnerChromeConfigSchema>;
export type VisualConfig = z.infer<typeof VisualConfigSchema>;
