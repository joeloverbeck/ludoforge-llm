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
]);

let conditionAstSchemaInternal: z.ZodTypeAny;
let optionsQuerySchemaInternal: z.ZodTypeAny;
let valueExprSchemaInternal: z.ZodTypeAny;
let effectAstSchemaInternal: z.ZodTypeAny;

export const ConditionASTSchema = z.lazy(() => conditionAstSchemaInternal);
export const OptionsQuerySchema = z.lazy(() => optionsQuerySchemaInternal);
export const ValueExprSchema = z.lazy(() => valueExprSchemaInternal);
export const EffectASTSchema = z.lazy(() => effectAstSchemaInternal);

optionsQuerySchemaInternal = z.union([
  z.object({ query: z.literal('tokensInZone'), zone: ZoneSelSchema }).strict(),
  z.object({ query: z.literal('intsInRange'), min: NumberSchema, max: NumberSchema }).strict(),
  z.object({ query: z.literal('enums'), values: z.array(StringSchema) }).strict(),
  z.object({ query: z.literal('players') }).strict(),
  z
    .object({
      query: z.literal('zones'),
      filter: z
        .object({
          owner: PlayerSelSchema.optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ query: z.literal('adjacentZones'), zone: ZoneSelSchema }).strict(),
  z.object({ query: z.literal('tokensInAdjacentZones'), zone: ZoneSelSchema }).strict(),
  z
    .object({
      query: z.literal('connectedZones'),
      zone: ZoneSelSchema,
      via: ConditionASTSchema.optional(),
    })
    .strict(),
]);

valueExprSchemaInternal = z.union([
  NumberSchema,
  BooleanSchema,
  StringSchema,
  ReferenceSchema,
  z
    .object({
      op: z.union([z.literal('+'), z.literal('-'), z.literal('*')]),
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
]);

conditionAstSchemaInternal = z.union([
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
          from: ZoneSelSchema,
          to: ZoneSelSchema,
          position: z.union([z.literal('top'), z.literal('bottom'), z.literal('random')]).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      moveAll: z
        .object({
          from: ZoneSelSchema,
          to: ZoneSelSchema,
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
          from: ZoneSelSchema,
          direction: StringSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      draw: z
        .object({
          from: ZoneSelSchema,
          to: ZoneSelSchema,
          count: NumberSchema,
        })
        .strict(),
    })
    .strict(),
  z.object({ shuffle: z.object({ zone: ZoneSelSchema }).strict() }).strict(),
  z
    .object({
      createToken: z
        .object({
          type: StringSchema,
          zone: ZoneSelSchema,
          props: z.record(StringSchema, ValueExprSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ destroyToken: z.object({ token: TokenSelSchema }).strict() }).strict(),
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
          limit: NumberSchema.optional(),
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
          bind: StringSchema,
          options: OptionsQuerySchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      chooseN: z
        .object({
          bind: StringSchema,
          options: OptionsQuerySchema,
          n: NumberSchema,
        })
        .strict(),
    })
    .strict(),
]);
