import { z } from 'zod';

export const OBJECT_STRICTNESS_POLICY = 'strict' as const;

export const NumberSchema = z.number();
export const IntegerSchema = z.number().int();
export const BooleanSchema = z.boolean();
export const StringSchema = z.string();

const PlayerIdSchema = IntegerSchema;

export const PlayerSelSchema = z.union([
  z.literal('actor'),
  z.literal('active'),
  z.literal('all'),
  z.literal('allOther'),
  z.object({ id: PlayerIdSchema }).strict(),
  z.object({ chosen: StringSchema }).strict(),
  z.object({ relative: z.union([z.literal('left'), z.literal('right')]) }).strict(),
]);

export const ZoneSelSchema = StringSchema;
export const TokenSelSchema = StringSchema;
const ZoneRefSchema: z.ZodTypeAny = z.lazy(() => z.union([ZoneSelSchema, z.object({ zoneExpr: ValueExprSchema }).strict()]));

export const ReferenceSchema = z.union([
  z.object({ ref: z.literal('gvar'), var: StringSchema }).strict(),
  z
    .object({
      ref: z.literal('pvar'),
      player: PlayerSelSchema,
      var: StringSchema,
    })
    .strict(),
  z.object({ ref: z.literal('zoneCount'), zone: ZoneSelSchema }).strict(),
  z.object({ ref: z.literal('tokenProp'), token: TokenSelSchema, prop: StringSchema }).strict(),
  z.object({ ref: z.literal('binding'), name: StringSchema }).strict(),
  z.object({ ref: z.literal('markerState'), space: ZoneSelSchema, marker: StringSchema }).strict(),
  z.object({ ref: z.literal('globalMarkerState'), marker: StringSchema }).strict(),
  z.object({ ref: z.literal('tokenZone'), token: TokenSelSchema }).strict(),
  z.object({ ref: z.literal('zoneProp'), zone: ZoneSelSchema, prop: StringSchema }).strict(),
  z.object({ ref: z.literal('activePlayer') }).strict(),
]);

let conditionAstSchemaInternal: z.ZodTypeAny;
let optionsQuerySchemaInternal: z.ZodTypeAny;
let valueExprSchemaInternal: z.ZodTypeAny;
let effectAstSchemaInternal: z.ZodTypeAny;

export const ConditionASTSchema = z.lazy(() => conditionAstSchemaInternal);
export const OptionsQuerySchema = z.lazy(() => optionsQuerySchemaInternal);
export const ValueExprSchema = z.lazy(() => valueExprSchemaInternal);
export const EffectASTSchema = z.lazy(() => effectAstSchemaInternal);

export const TokenFilterPredicateSchema = z
  .object({
    prop: StringSchema,
    op: z.union([z.literal('eq'), z.literal('neq'), z.literal('in'), z.literal('notIn')]),
    value: z.union([ValueExprSchema, z.array(StringSchema)]),
  })
  .strict();

optionsQuerySchemaInternal = z.union([
  z
    .object({
      query: z.literal('tokensInZone'),
      zone: ZoneSelSchema,
      filter: z.array(TokenFilterPredicateSchema).optional(),
    })
    .strict(),
  z.object({ query: z.literal('intsInRange'), min: NumberSchema, max: NumberSchema }).strict(),
  z.object({ query: z.literal('enums'), values: z.array(StringSchema) }).strict(),
  z
    .object({
      query: z.literal('globalMarkers'),
      markers: z.array(StringSchema).optional(),
      states: z.array(StringSchema).optional(),
    })
    .strict(),
  z.object({ query: z.literal('players') }).strict(),
  z
    .object({
      query: z.literal('zones'),
      filter: z
        .object({
          owner: PlayerSelSchema.optional(),
          condition: ConditionASTSchema.optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('mapSpaces'),
      filter: z
        .object({
          owner: PlayerSelSchema.optional(),
          condition: ConditionASTSchema.optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ query: z.literal('adjacentZones'), zone: ZoneSelSchema }).strict(),
  z
    .object({
      query: z.literal('tokensInAdjacentZones'),
      zone: ZoneSelSchema,
      filter: z.array(TokenFilterPredicateSchema).optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('connectedZones'),
      zone: ZoneSelSchema,
      via: ConditionASTSchema.optional(),
      includeStart: BooleanSchema.optional(),
      maxDepth: NumberSchema.optional(),
    })
    .strict(),
  z.object({ query: z.literal('binding'), name: StringSchema }).strict(),
]);

valueExprSchemaInternal = z.union([
  NumberSchema,
  BooleanSchema,
  StringSchema,
  ReferenceSchema,
  z
    .object({
      op: z.union([
        z.literal('+'),
        z.literal('-'),
        z.literal('*'),
        z.literal('/'),
        z.literal('floorDiv'),
        z.literal('ceilDiv'),
      ]),
      left: ValueExprSchema,
      right: ValueExprSchema,
    })
    .strict(),
  z
    .object({
      aggregate: z
        .object({
          op: z.union([z.literal('sum'), z.literal('count'), z.literal('min'), z.literal('max')]),
          query: OptionsQuerySchema,
          prop: StringSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ concat: z.array(ValueExprSchema) }).strict(),
  z
    .object({
      if: z
        .object({
          when: ConditionASTSchema,
          then: ValueExprSchema,
          else: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
]);

conditionAstSchemaInternal = z.union([
  z.boolean(),
  z.object({ op: z.literal('and'), args: z.array(ConditionASTSchema) }).strict(),
  z.object({ op: z.literal('or'), args: z.array(ConditionASTSchema) }).strict(),
  z.object({ op: z.literal('not'), arg: ConditionASTSchema }).strict(),
  z
    .object({
      op: z.union([
        z.literal('=='),
        z.literal('!='),
        z.literal('<'),
        z.literal('<='),
        z.literal('>'),
        z.literal('>='),
      ]),
      left: ValueExprSchema,
      right: ValueExprSchema,
    })
    .strict(),
  z.object({ op: z.literal('in'), item: ValueExprSchema, set: ValueExprSchema }).strict(),
  z.object({ op: z.literal('adjacent'), left: ZoneSelSchema, right: ZoneSelSchema }).strict(),
  z
    .object({
      op: z.literal('connected'),
      from: ZoneSelSchema,
      to: ZoneSelSchema,
      via: ConditionASTSchema.optional(),
      maxDepth: NumberSchema.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('zonePropIncludes'),
      zone: ZoneSelSchema,
      prop: StringSchema,
      value: ValueExprSchema,
    })
    .strict(),
]);

effectAstSchemaInternal = z.union([
  z
    .object({
      setVar: z
        .object({
          scope: z.union([z.literal('global'), z.literal('pvar')]),
          player: PlayerSelSchema.optional(),
          var: StringSchema,
          value: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      addVar: z
        .object({
          scope: z.union([z.literal('global'), z.literal('pvar')]),
          player: PlayerSelSchema.optional(),
          var: StringSchema,
          delta: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      moveToken: z
        .object({
          token: TokenSelSchema,
          from: ZoneRefSchema,
          to: ZoneRefSchema,
          position: z.union([z.literal('top'), z.literal('bottom'), z.literal('random')]).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      moveAll: z
        .object({
          from: ZoneRefSchema,
          to: ZoneRefSchema,
          filter: ConditionASTSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      moveTokenAdjacent: z
        .object({
          token: TokenSelSchema,
          from: ZoneRefSchema,
          direction: StringSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      draw: z
        .object({
          from: ZoneRefSchema,
          to: ZoneRefSchema,
          count: NumberSchema,
        })
        .strict(),
    })
    .strict(),
  z.object({ shuffle: z.object({ zone: ZoneRefSchema }).strict() }).strict(),
  z
    .object({
      createToken: z
        .object({
          type: StringSchema,
          zone: ZoneRefSchema,
          props: z.record(StringSchema, ValueExprSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ destroyToken: z.object({ token: TokenSelSchema }).strict() }).strict(),
  z
    .object({
      setTokenProp: z
        .object({
          token: TokenSelSchema,
          prop: StringSchema,
          value: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      if: z
        .object({
          when: ConditionASTSchema,
          then: z.array(EffectASTSchema),
          else: z.array(EffectASTSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      forEach: z
        .object({
          bind: StringSchema,
          over: OptionsQuerySchema,
          effects: z.array(EffectASTSchema),
          limit: ValueExprSchema.optional(),
          countBind: StringSchema.optional(),
          in: z.array(EffectASTSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      removeByPriority: z
        .object({
          budget: ValueExprSchema,
          groups: z.array(
            z
              .object({
                bind: StringSchema,
                over: OptionsQuerySchema,
                to: z.union([ZoneSelSchema, z.object({ zoneExpr: ValueExprSchema }).strict()]),
                from: z.union([ZoneSelSchema, z.object({ zoneExpr: ValueExprSchema }).strict()]).optional(),
                countBind: StringSchema.optional(),
              })
              .strict(),
          ),
          remainingBind: StringSchema.optional(),
          in: z.array(EffectASTSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      let: z
        .object({
          bind: StringSchema,
          value: ValueExprSchema,
          in: z.array(EffectASTSchema),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      chooseOne: z
        .object({
          internalDecisionId: StringSchema,
          bind: StringSchema,
          options: OptionsQuerySchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      chooseN: z.union([
        z
          .object({
            internalDecisionId: StringSchema,
            bind: StringSchema,
            options: OptionsQuerySchema,
            n: NumberSchema,
          })
          .strict(),
        z
          .object({
            internalDecisionId: StringSchema,
            bind: StringSchema,
            options: OptionsQuerySchema,
            min: ValueExprSchema.optional(),
            max: ValueExprSchema,
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      rollRandom: z
        .object({
          bind: StringSchema,
          min: ValueExprSchema,
          max: ValueExprSchema,
          in: z.array(EffectASTSchema),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      setMarker: z
        .object({
          space: ZoneRefSchema,
          marker: StringSchema,
          state: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      shiftMarker: z
        .object({
          space: ZoneRefSchema,
          marker: StringSchema,
          delta: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      setGlobalMarker: z
        .object({
          marker: StringSchema,
          state: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      flipGlobalMarker: z
        .object({
          marker: ValueExprSchema,
          stateA: ValueExprSchema,
          stateB: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      shiftGlobalMarker: z
        .object({
          marker: StringSchema,
          delta: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      grantFreeOperation: z
        .object({
          id: StringSchema.optional(),
          faction: StringSchema,
          executeAsFaction: StringSchema.optional(),
          operationClass: z.union([
            z.literal('pass'),
            z.literal('event'),
            z.literal('operation'),
            z.literal('limitedOperation'),
            z.literal('operationPlusSpecialActivity'),
          ]),
          actionIds: z.array(StringSchema).optional(),
          zoneFilter: ConditionASTSchema.optional(),
          uses: NumberSchema.optional(),
          sequence: z
            .object({
              chain: StringSchema,
              step: NumberSchema,
            })
            .strict()
            .optional(),
        })
        .strict(),
    })
    .strict(),
]);
