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

export const MapSpaceSchema = z
  .object({
    id: StringSchema.min(1),
    spaceType: StringSchema.min(1),
    population: IntegerSchema.min(0),
    econ: IntegerSchema.min(0),
    terrainTags: z.array(StringSchema.min(1)),
    country: StringSchema.min(1),
    coastal: BooleanSchema,
    adjacentTo: z.array(StringSchema.min(1)),
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
    spaceTypes: z.array(StringSchema.min(1)).optional(),
    populationEquals: IntegerSchema.min(0).optional(),
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
        spaceTypes: z.array(StringSchema.min(1)).optional(),
        country: z.array(StringSchema.min(1)).optional(),
        populationEquals: IntegerSchema.min(0).optional(),
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

export const DataAssetKindSchema = z.union([
  z.literal('map'),
  z.literal('scenario'),
  z.literal('pieceCatalog'),
]);

export const DataAssetRefSchema = z
  .object({
    id: StringSchema.min(1),
    kind: DataAssetKindSchema,
  })
  .strict();

export const DataAssetEnvelopeSchema = z
  .object({
    id: StringSchema.min(1),
    kind: DataAssetKindSchema,
    payload: z.unknown(),
  })
  .strict();
