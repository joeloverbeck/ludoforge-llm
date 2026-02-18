import { z } from 'zod';
import { BooleanSchema, IntegerSchema, NumberSchema, StringSchema } from './schemas-ast.js';

export const PieceStatusDimensionSchema = z.union([z.literal('activity'), z.literal('tunnel')]);

export const PieceStatusValueSchema = z.union([
  z.literal('underground'),
  z.literal('active'),
  z.literal('untunneled'),
  z.literal('tunneled'),
]);

export const PieceStatusTransitionSchema = z
  .object({
    dimension: PieceStatusDimensionSchema,
    from: PieceStatusValueSchema,
    to: PieceStatusValueSchema,
  })
  .strict();

export const PieceVisualMetadataSchema = z
  .object({
    color: StringSchema.min(1),
    shape: StringSchema.min(1),
    activeSymbol: StringSchema.min(1).optional(),
  })
  .strict();

export const PieceTypeCatalogEntrySchema = z
  .object({
    id: StringSchema.min(1),
    faction: StringSchema.min(1),
    statusDimensions: z.array(PieceStatusDimensionSchema),
    transitions: z.array(PieceStatusTransitionSchema),
    runtimeProps: z.record(StringSchema, z.union([StringSchema, NumberSchema, BooleanSchema])).optional(),
    visual: PieceVisualMetadataSchema.optional(),
  })
  .strict();

export const PieceInventoryEntrySchema = z
  .object({
    pieceTypeId: StringSchema.min(1),
    faction: StringSchema.min(1),
    total: IntegerSchema.min(0),
  })
  .strict();

export const PieceCatalogPayloadSchema = z
  .object({
    pieceTypes: z.array(PieceTypeCatalogEntrySchema),
    inventory: z.array(PieceInventoryEntrySchema),
  })
  .strict();

export const AttributeValueSchema = z.union([
  StringSchema,
  NumberSchema,
  BooleanSchema,
  z.array(StringSchema),
]);

export const ZoneShapeSchema = z.union([
  z.literal('rectangle'), z.literal('circle'), z.literal('hexagon'), z.literal('diamond'),
  z.literal('ellipse'), z.literal('triangle'), z.literal('line'), z.literal('octagon'),
]);

export const TokenShapeSchema = z.union([
  z.literal('circle'), z.literal('square'), z.literal('triangle'), z.literal('diamond'),
  z.literal('hexagon'), z.literal('cylinder'), z.literal('meeple'), z.literal('card'),
]);

export const ZoneVisualHintsSchema = z
  .object({
    shape: ZoneShapeSchema.optional(),
    width: NumberSchema.optional(),
    height: NumberSchema.optional(),
    color: StringSchema.optional(),
    label: StringSchema.optional(),
  })
  .strict();

export const TokenVisualHintsSchema = z
  .object({
    shape: TokenShapeSchema.optional(),
    color: StringSchema.optional(),
    size: NumberSchema.optional(),
    symbol: StringSchema.optional(),
  })
  .strict();

export const FactionDefSchema = z
  .object({
    id: StringSchema.min(1),
    color: StringSchema.min(1),
    displayName: StringSchema.optional(),
  })
  .strict();

export const MapSpaceSchema = z
  .object({
    id: StringSchema.min(1),
    category: StringSchema.min(1).optional(),
    attributes: z.record(StringSchema, AttributeValueSchema).optional(),
    adjacentTo: z.array(StringSchema.min(1)),
    visual: ZoneVisualHintsSchema.optional(),
  })
  .strict();

export const ProvisionalAdjacencySchema = z
  .object({
    from: StringSchema.min(1),
    to: StringSchema.min(1),
    reason: StringSchema.min(1),
  })
  .strict();

export const NumericTrackSchema = z
  .object({
    id: StringSchema.min(1),
    scope: z.union([z.literal('global'), z.literal('faction')]),
    faction: StringSchema.min(1).optional(),
    min: IntegerSchema,
    max: IntegerSchema,
    initial: IntegerSchema,
  })
  .strict();

export const SpaceMarkerConstraintSchema = z
  .object({
    spaceIds: z.array(StringSchema.min(1)).optional(),
    category: z.array(StringSchema.min(1)).optional(),
    attributeEquals: z.record(StringSchema, AttributeValueSchema).optional(),
    allowedStates: z.array(StringSchema.min(1)),
  })
  .strict();

export const SpaceMarkerLatticeSchema = z
  .object({
    id: StringSchema.min(1),
    states: z.array(StringSchema.min(1)),
    defaultState: StringSchema.min(1),
    constraints: z.array(SpaceMarkerConstraintSchema).optional(),
  })
  .strict();

export const GlobalMarkerLatticeSchema = z
  .object({
    id: StringSchema.min(1),
    states: z.array(StringSchema.min(1)),
    defaultState: StringSchema.min(1),
  })
  .strict();

export const SpaceMarkerValueSchema = z
  .object({
    spaceId: StringSchema.min(1),
    markerId: StringSchema.min(1),
    state: StringSchema.min(1),
  })
  .strict();

export const StackingConstraintSchema = z
  .object({
    id: StringSchema.min(1),
    description: StringSchema,
    spaceFilter: z
      .object({
        spaceIds: z.array(StringSchema.min(1)).optional(),
        category: z.array(StringSchema.min(1)).optional(),
        attributeEquals: z.record(StringSchema, AttributeValueSchema).optional(),
      })
      .strict(),
    pieceFilter: z
      .object({
        pieceTypeIds: z.array(StringSchema.min(1)).optional(),
        factions: z.array(StringSchema.min(1)).optional(),
      })
      .strict(),
    rule: z.union([z.literal('maxCount'), z.literal('prohibit')]),
    maxCount: IntegerSchema.min(0).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.rule === 'maxCount' && value.maxCount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'maxCount is required when rule is "maxCount".',
        path: ['maxCount'],
      });
    }
  });

export const MapPayloadSchema = z
  .object({
    spaces: z.array(MapSpaceSchema),
    provisionalAdjacency: z.array(ProvisionalAdjacencySchema).optional(),
    tracks: z.array(NumericTrackSchema).optional(),
    markerLattices: z.array(SpaceMarkerLatticeSchema).optional(),
    spaceMarkers: z.array(SpaceMarkerValueSchema).optional(),
    stackingConstraints: z.array(StackingConstraintSchema).optional(),
  })
  .strict();

export const ScenarioPiecePlacementSchema = z
  .object({
    spaceId: StringSchema.min(1),
    pieceTypeId: StringSchema.min(1),
    faction: StringSchema.min(1),
    count: IntegerSchema.positive(),
    status: z.record(StringSchema, StringSchema).optional(),
  })
  .strict();

export const ScenarioDeckCompositionSchema = z
  .object({
    pileCount: IntegerSchema.positive(),
    eventsPerPile: IntegerSchema.positive(),
    coupsPerPile: IntegerSchema.positive(),
    includedCardIds: z.array(StringSchema.min(1)).optional(),
    excludedCardIds: z.array(StringSchema.min(1)).optional(),
  })
  .strict();

export const ScenarioPayloadSchema = z
  .object({
    mapAssetId: StringSchema.min(1).optional(),
    pieceCatalogAssetId: StringSchema.min(1).optional(),
    eventDeckAssetId: StringSchema.min(1).optional(),
    scenarioName: StringSchema.min(1).optional(),
    yearRange: StringSchema.min(1).optional(),
    settings: z.record(StringSchema, z.unknown()).optional(),
    initialPlacements: z.array(ScenarioPiecePlacementSchema).optional(),
    initialTrackValues: z
      .array(
        z
          .object({
            trackId: StringSchema.min(1),
            value: NumberSchema,
          })
          .strict(),
      )
      .optional(),
    initialMarkers: z
      .array(
        z
          .object({
            spaceId: StringSchema.min(1),
            markerId: StringSchema.min(1),
            state: StringSchema.min(1),
          })
          .strict(),
      )
      .optional(),
    outOfPlay: z
      .array(
        z
          .object({
            pieceTypeId: StringSchema.min(1),
            faction: StringSchema.min(1),
            count: IntegerSchema.positive(),
          })
          .strict(),
      )
      .optional(),
    factionPools: z
      .array(
        z
          .object({
            faction: StringSchema.min(1),
            availableZoneId: StringSchema.min(1),
            outOfPlayZoneId: StringSchema.min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    deckComposition: ScenarioDeckCompositionSchema.optional(),
    startingLeader: StringSchema.min(1).optional(),
    leaderStack: z.array(StringSchema.min(1)).optional(),
    startingCapabilities: z
      .array(
        z
          .object({
            capabilityId: StringSchema.min(1),
            side: z.union([z.literal('unshaded'), z.literal('shaded')]),
          })
          .strict(),
      )
      .optional(),
    startingEligibility: z
      .array(
        z
          .object({
            faction: StringSchema.min(1),
            eligible: BooleanSchema,
          })
          .strict(),
      )
      .optional(),
    usPolicy: z.union([z.literal('jfk'), z.literal('lbj'), z.literal('nixon')]).optional(),
  })
  .strict();

export const KnownDataAssetKindSchema = z.union([
  z.literal('map'),
  z.literal('scenario'),
  z.literal('pieceCatalog'),
]);

export const DataAssetKindSchema = StringSchema.min(1);

export const DataAssetRefSchema = z
  .object({
    id: StringSchema.min(1),
    kind: KnownDataAssetKindSchema,
  })
  .strict();

export const DataAssetEnvelopeSchema = z
  .object({
    id: StringSchema.min(1),
    kind: DataAssetKindSchema,
    payload: z.unknown(),
  })
  .strict();
