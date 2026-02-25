import { z } from 'zod';
import { CANONICAL_BINDING_IDENTIFIER_MESSAGE, CANONICAL_BINDING_IDENTIFIER_PATTERN } from './binding-identifier-contract.js';

export const OBJECT_STRICTNESS_POLICY = 'strict' as const;

export const NumberSchema = z.number();
export const IntegerSchema = z.number().int();
export const BooleanSchema = z.boolean();
export const StringSchema = z.string();
const CanonicalBindingIdentifierSchema = StringSchema.regex(CANONICAL_BINDING_IDENTIFIER_PATTERN, {
  message: CANONICAL_BINDING_IDENTIFIER_MESSAGE,
});
const PredicateScalarLiteralSchema = z.union([StringSchema, NumberSchema, BooleanSchema]);

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

export const ActionExecutorSelSchema = z.union([
  z.literal('actor'),
  z.literal('active'),
  z.object({ id: PlayerIdSchema }).strict(),
  z.object({ chosen: StringSchema }).strict(),
  z.object({ relative: z.union([z.literal('left'), z.literal('right')]) }).strict(),
]);

export const ZoneSelSchema = StringSchema;
export const TokenSelSchema = StringSchema;
const ZoneRefSchema: z.ZodTypeAny = z.lazy(() => z.union([ZoneSelSchema, z.object({ zoneExpr: ValueExprSchema }).strict()]));
export const MacroOriginSchema = z
  .object({
    macroId: StringSchema,
    stem: StringSchema,
  })
  .strict();

export const ReferenceSchema = z.union([
  z.object({ ref: z.literal('gvar'), var: StringSchema }).strict(),
  z
    .object({
      ref: z.literal('pvar'),
      player: PlayerSelSchema,
      var: StringSchema,
    })
    .strict(),
  z.object({ ref: z.literal('zoneVar'), zone: ZoneSelSchema, var: StringSchema }).strict(),
  z.object({ ref: z.literal('zoneCount'), zone: ZoneSelSchema }).strict(),
  z.object({ ref: z.literal('tokenProp'), token: TokenSelSchema, prop: StringSchema }).strict(),
  z.object({ ref: z.literal('assetField'), row: StringSchema, tableId: StringSchema, field: StringSchema }).strict(),
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
let numericValueExprSchemaInternal: z.ZodTypeAny;
let effectAstSchemaInternal: z.ZodTypeAny;

export const ConditionASTSchema = z.lazy(() => conditionAstSchemaInternal);
export const OptionsQuerySchema = z.lazy(() => optionsQuerySchemaInternal);
export const ValueExprSchema = z.lazy(() => valueExprSchemaInternal);
export const NumericValueExprSchema = z.lazy(() => numericValueExprSchemaInternal);
export const EffectASTSchema = z.lazy(() => effectAstSchemaInternal);
const IntDomainBoundSchema = z
  .union([IntegerSchema, NumericValueExprSchema])
  .refine((value) => typeof value !== 'number' || Number.isSafeInteger(value), {
    message: 'intsInRange bounds must be safe integers when provided as numeric literals.',
  });

export const TokenFilterPredicateSchema = z
  .object({
    prop: StringSchema,
    op: z.union([z.literal('eq'), z.literal('neq'), z.literal('in'), z.literal('notIn')]),
    value: z.union([ValueExprSchema, z.array(PredicateScalarLiteralSchema)]),
  })
  .strict();

export const AssetRowPredicateSchema = z
  .object({
    field: StringSchema,
    op: z.union([z.literal('eq'), z.literal('neq'), z.literal('in'), z.literal('notIn')]),
    value: z.union([ValueExprSchema, z.array(PredicateScalarLiteralSchema)]),
  })
  .strict();

optionsQuerySchemaInternal = z.union([
  z
    .object({
      query: z.literal('concat'),
      sources: z.array(OptionsQuerySchema).min(1),
    })
    .strict(),
  z
    .object({
      query: z.literal('tokensInZone'),
      zone: ZoneRefSchema,
      filter: z.array(TokenFilterPredicateSchema).optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('assetRows'),
      tableId: StringSchema,
      where: z.array(AssetRowPredicateSchema).optional(),
      cardinality: z.union([z.literal('many'), z.literal('exactlyOne'), z.literal('zeroOrOne')]).optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('tokensInMapSpaces'),
      spaceFilter: z
        .object({
          owner: PlayerSelSchema.optional(),
          condition: ConditionASTSchema.optional(),
        })
        .strict()
        .optional(),
      filter: z.array(TokenFilterPredicateSchema).optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('nextInOrderByCondition'),
      source: OptionsQuerySchema,
      from: ValueExprSchema,
      bind: CanonicalBindingIdentifierSchema,
      where: ConditionASTSchema,
      includeFrom: BooleanSchema.optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('intsInRange'),
      min: IntDomainBoundSchema,
      max: IntDomainBoundSchema,
      step: IntDomainBoundSchema.optional(),
      alwaysInclude: z.array(IntDomainBoundSchema).optional(),
      maxResults: IntDomainBoundSchema.optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('intsInVarRange'),
      var: StringSchema,
      scope: z.union([z.literal('global'), z.literal('perPlayer')]).optional(),
      min: IntDomainBoundSchema.optional(),
      max: IntDomainBoundSchema.optional(),
      step: IntDomainBoundSchema.optional(),
      alwaysInclude: z.array(IntDomainBoundSchema).optional(),
      maxResults: IntDomainBoundSchema.optional(),
    })
    .strict(),
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
  z.object({ query: z.literal('adjacentZones'), zone: ZoneRefSchema }).strict(),
  z
    .object({
      query: z.literal('tokensInAdjacentZones'),
      zone: ZoneRefSchema,
      filter: z.array(TokenFilterPredicateSchema).optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('connectedZones'),
      zone: ZoneRefSchema,
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
        z.literal('min'),
        z.literal('max'),
      ]),
      left: ValueExprSchema,
      right: ValueExprSchema,
    })
    .strict(),
  z
    .object({
      aggregate: z
        .union([
          z
            .object({
              op: z.literal('count'),
              query: OptionsQuerySchema,
            })
            .strict(),
          z
            .object({
              op: z.union([z.literal('sum'), z.literal('min'), z.literal('max')]),
              query: OptionsQuerySchema,
              bind: StringSchema,
              valueExpr: NumericValueExprSchema,
            })
            .strict(),
        ]),
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

numericValueExprSchemaInternal = z.union([
  NumberSchema,
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
        z.literal('min'),
        z.literal('max'),
      ]),
      left: NumericValueExprSchema,
      right: NumericValueExprSchema,
    })
    .strict(),
  z
    .object({
      aggregate: z
        .union([
          z
            .object({
              op: z.literal('count'),
              query: OptionsQuerySchema,
            })
            .strict(),
          z
            .object({
              op: z.union([z.literal('sum'), z.literal('min'), z.literal('max')]),
              query: OptionsQuerySchema,
              bind: StringSchema,
              valueExpr: NumericValueExprSchema,
            })
            .strict(),
        ]),
    })
    .strict(),
  z
    .object({
      if: z
        .object({
          when: ConditionASTSchema,
          then: NumericValueExprSchema,
          else: NumericValueExprSchema,
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
          scope: z.union([z.literal('global'), z.literal('pvar'), z.literal('zoneVar')]),
          player: PlayerSelSchema.optional(),
          zone: ZoneRefSchema.optional(),
          var: StringSchema,
          value: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      setActivePlayer: z
        .object({
          player: PlayerSelSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      addVar: z
        .object({
          scope: z.union([z.literal('global'), z.literal('pvar'), z.literal('zoneVar')]),
          player: PlayerSelSchema.optional(),
          zone: ZoneRefSchema.optional(),
          var: StringSchema,
          delta: NumericValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      transferVar: z
        .object({
          from: z
            .object({
              scope: z.union([z.literal('global'), z.literal('pvar')]),
              var: StringSchema,
              player: PlayerSelSchema.optional(),
            })
            .strict(),
          to: z
            .object({
              scope: z.union([z.literal('global'), z.literal('pvar')]),
              var: StringSchema,
              player: PlayerSelSchema.optional(),
            })
            .strict(),
          amount: NumericValueExprSchema,
          min: NumericValueExprSchema.optional(),
          max: NumericValueExprSchema.optional(),
          actualBind: StringSchema.optional(),
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
  z
    .object({
      reveal: z
        .object({
          zone: ZoneRefSchema,
          to: z.union([z.literal('all'), PlayerSelSchema]),
          filter: z.array(TokenFilterPredicateSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      conceal: z
        .object({
          zone: ZoneRefSchema,
          from: z.union([z.literal('all'), PlayerSelSchema]).optional(),
          filter: z.array(TokenFilterPredicateSchema).optional(),
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
          macroOrigin: MacroOriginSchema.optional(),
          over: OptionsQuerySchema,
          effects: z.array(EffectASTSchema),
          limit: NumericValueExprSchema.optional(),
          countBind: StringSchema.optional(),
          in: z.array(EffectASTSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      reduce: z
        .object({
          itemBind: StringSchema,
          accBind: StringSchema,
          macroOrigin: MacroOriginSchema.optional(),
          over: OptionsQuerySchema,
          initial: ValueExprSchema,
          next: ValueExprSchema,
          limit: NumericValueExprSchema.optional(),
          resultBind: StringSchema,
          in: z.array(EffectASTSchema),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      removeByPriority: z
        .object({
          budget: NumericValueExprSchema,
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
      bindValue: z
        .object({
          bind: StringSchema,
          value: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      evaluateSubset: z
        .object({
          source: OptionsQuerySchema,
          subsetSize: NumericValueExprSchema,
          subsetBind: StringSchema,
          compute: z.array(EffectASTSchema),
          scoreExpr: NumericValueExprSchema,
          resultBind: StringSchema,
          bestSubsetBind: StringSchema.optional(),
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
            min: NumericValueExprSchema.optional(),
            max: NumericValueExprSchema,
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
          min: NumericValueExprSchema,
          max: NumericValueExprSchema,
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
          delta: NumericValueExprSchema,
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
          delta: NumericValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      grantFreeOperation: z
        .object({
          id: StringSchema.optional(),
          seat: StringSchema,
          executeAsSeat: StringSchema.optional(),
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
  z
    .object({
      gotoPhaseExact: z
        .object({
          phase: StringSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      advancePhase: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      pushInterruptPhase: z
        .object({
          phase: StringSchema,
          resumePhase: StringSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      popInterruptPhase: z.object({}).strict(),
    })
    .strict(),
]);
