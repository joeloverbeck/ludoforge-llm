import { z } from 'zod';
import {
  CANONICAL_BINDING_IDENTIFIER_MESSAGE,
  CANONICAL_BINDING_IDENTIFIER_PATTERN,
  TURN_FLOW_ACTION_CLASS_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_PROGRESSION_POLICY_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES,
} from '../contracts/index.js';
import { PREDICATE_OPERATORS } from '../contracts/index.js';
import { FreeOperationSequenceContextSchema } from './free-operation-sequence-context-schema.js';
import { createTurnFlowFreeOperationGrantSchema } from './free-operation-grant-zod.js';
import { FreeOperationSequenceKeySchema } from './free-operation-sequence-key-schema.js';
import { AST_SCOPED_VAR_SCOPES, createScopedVarContractSchema } from './scoped-var-contract.js';
import { EFFECT_KIND_TAG } from './types-ast.js';

export const OBJECT_STRICTNESS_POLICY = 'strict' as const;

export const NumberSchema = z.number();
export const IntegerSchema = z.number().int();
export const BooleanSchema = z.boolean();
export const StringSchema = z.string();
const CanonicalBindingIdentifierSchema = StringSchema.regex(CANONICAL_BINDING_IDENTIFIER_PATTERN, {
  message: CANONICAL_BINDING_IDENTIFIER_MESSAGE,
});
export const ScopedVarNameExprSchema = z.union([
  StringSchema,
  z.object({ ref: z.literal('binding'), name: StringSchema, displayName: StringSchema.optional() }).strict(),
  z.object({ ref: z.literal('grantContext'), key: StringSchema }).strict(),
]);
const FreeOperationSequenceKeyExprSchema = z.union([
  FreeOperationSequenceKeySchema,
  z.object({ ref: z.literal('binding'), name: StringSchema, displayName: StringSchema.optional() }).strict(),
  z.object({ ref: z.literal('grantContext'), key: StringSchema }).strict(),
]);
const PredicateScalarLiteralSchema = z.union([StringSchema, NumberSchema, BooleanSchema]);
const ScalarValueArraySchema = z
  .array(PredicateScalarLiteralSchema)
  .superRefine((value, refinementCtx) => {
    let expectedType: 'string' | 'number' | 'boolean' | null = null;
    for (let index = 0; index < value.length; index += 1) {
      const entryType = typeof value[index] as 'string' | 'number' | 'boolean';
      if (expectedType === null) {
        expectedType = entryType;
        continue;
      }
      if (entryType !== expectedType) {
        refinementCtx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Scalar arrays must not mix string, number, and boolean values.',
          path: [index],
        });
      }
    }
  });
const PredicateOperatorSchema = z.enum(PREDICATE_OPERATORS);

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
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('gvar'), var: ScopedVarNameExprSchema }).strict(),
  z
    .object({
      _t: IntegerSchema.optional(),
      ref: z.literal('pvar'),
      player: PlayerSelSchema,
      var: ScopedVarNameExprSchema,
    })
    .strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('zoneVar'), zone: ZoneSelSchema, var: ScopedVarNameExprSchema }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('zoneCount'), zone: ZoneSelSchema }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('tokenProp'), token: TokenSelSchema, prop: StringSchema }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('assetField'), row: StringSchema, tableId: StringSchema, field: StringSchema }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('binding'), name: StringSchema, displayName: StringSchema.optional() }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('markerState'), space: ZoneSelSchema, marker: StringSchema }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('globalMarkerState'), marker: StringSchema }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('tokenZone'), token: TokenSelSchema }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('zoneProp'), zone: ZoneSelSchema, prop: StringSchema }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('activePlayer') }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('activeSeat') }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('grantContext'), key: StringSchema }).strict(),
  z.object({ _t: IntegerSchema.optional(), ref: z.literal('capturedSequenceZones'), key: FreeOperationSequenceKeyExprSchema }).strict(),
]);

let conditionAstSchemaInternal: z.ZodTypeAny;
let optionsQuerySchemaInternal: z.ZodTypeAny;
let valueExprSchemaInternal: z.ZodTypeAny;
let numericValueExprSchemaInternal: z.ZodTypeAny;
let effectAstSchemaInternal: z.ZodTypeAny;
let tokenFilterExprSchemaInternal: z.ZodTypeAny;

export const ConditionASTSchema = z.lazy(() => conditionAstSchemaInternal);
export const OptionsQuerySchema = z.lazy(() => optionsQuerySchemaInternal);
export const ValueExprSchema = z.lazy(() => valueExprSchemaInternal);
export const NumericValueExprSchema = z.lazy(() => numericValueExprSchemaInternal);
export const EffectASTSchema = z.lazy(() => effectAstSchemaInternal);
export const TokenFilterExprSchema = z.lazy(() => tokenFilterExprSchemaInternal);
export const FreeOperationExecutionContextSchema: z.ZodTypeAny = z.lazy(() => z.record(
  StringSchema,
  ValueExprSchema,
));
export const FreeOperationTokenInterpretationRuleSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    when: TokenFilterExprSchema,
    assign: z.record(StringSchema, PredicateScalarLiteralSchema),
  }).strict(),
);
const IntDomainBoundSchema = z
  .union([IntegerSchema, NumericValueExprSchema])
  .refine((value) => typeof value !== 'number' || Number.isSafeInteger(value), {
    message: 'intsInRange bounds must be safe integers when provided as numeric literals.',
  });

export const TokenFilterPredicateSchema = z
  .object({
    prop: StringSchema.optional(),
    field: z.union([
      z.object({ kind: z.literal('prop'), prop: StringSchema }).strict(),
      z.object({ kind: z.literal('tokenId') }).strict(),
      z.object({ kind: z.literal('tokenZone') }).strict(),
      z.object({ kind: z.literal('zoneProp'), prop: StringSchema }).strict(),
    ]).optional(),
    op: PredicateOperatorSchema,
    value: z.union([ValueExprSchema, ScalarValueArraySchema]),
  })
  .superRefine((value, refinementCtx) => {
    const propCount = value.prop === undefined ? 0 : 1;
    const fieldCount = value.field === undefined ? 0 : 1;
    if (propCount + fieldCount !== 1) {
      refinementCtx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Token filter predicates must specify exactly one of "prop" or "field".',
        path: value.prop === undefined ? ['prop'] : ['field'],
      });
    }
  })
  .strict();

export const AssetRowPredicateSchema = z
  .object({
    field: StringSchema,
    op: PredicateOperatorSchema,
    value: z.union([ValueExprSchema, ScalarValueArraySchema]),
  })
  .strict();

export const TransferVarEndpointSchema = createScopedVarContractSchema({
  scopes: AST_SCOPED_VAR_SCOPES,
  fields: {
    var: 'var',
    player: 'player',
    zone: 'zone',
  },
  schemas: {
    var: ScopedVarNameExprSchema,
    player: PlayerSelSchema,
    zone: ZoneRefSchema,
  },
});

const EffectFootprintTargetSetSchema = z.union([z.array(StringSchema), z.literal('unknown')]);
const EffectFootprintSurfaceSchema = z
  .object({
    tokens: EffectFootprintTargetSetSchema,
    zones: EffectFootprintTargetSetSchema,
    variables: EffectFootprintTargetSetSchema,
    scores: EffectFootprintTargetSetSchema,
  })
  .strict();
const EffectFootprintSchema = z
  .object({
    writes: EffectFootprintSurfaceSchema,
    reads: EffectFootprintSurfaceSchema,
    mayTouchTokens: EffectFootprintTargetSetSchema,
    mayTouchZones: EffectFootprintTargetSetSchema,
    mayTouchVariables: EffectFootprintTargetSetSchema,
    mayTouchScores: EffectFootprintTargetSetSchema,
  })
  .strict();

function createEffectNodeSchema<T extends z.ZodRawShape>(shape: T): z.ZodObject<T & { footprint: z.ZodOptional<typeof EffectFootprintSchema> }> {
  return z.object({ ...shape, footprint: EffectFootprintSchema.optional() }).strict();
}

export const SetVarPayloadSchema = createScopedVarContractSchema({
  scopes: AST_SCOPED_VAR_SCOPES,
  fields: {
    var: 'var',
    player: 'player',
    zone: 'zone',
  },
  schemas: {
    var: ScopedVarNameExprSchema,
    player: PlayerSelSchema,
    zone: ZoneRefSchema,
  },
  commonShape: {
    value: ValueExprSchema,
  },
});

export const AddVarPayloadSchema = createScopedVarContractSchema({
  scopes: AST_SCOPED_VAR_SCOPES,
  fields: {
    var: 'var',
    player: 'player',
    zone: 'zone',
  },
  schemas: {
    var: StringSchema,
    player: PlayerSelSchema,
    zone: ZoneRefSchema,
  },
  commonShape: {
    delta: NumericValueExprSchema,
  },
});

optionsQuerySchemaInternal = z.union([
  z
    .object({
      query: z.literal('concat'),
      sources: z.array(OptionsQuerySchema).min(1),
    })
    .strict(),
  z
    .object({
      query: z.literal('prioritized'),
      tiers: z.array(OptionsQuerySchema).min(1),
      qualifierKey: StringSchema.optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('tokenZones'),
      source: OptionsQuerySchema,
      dedupe: BooleanSchema.optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('tokensInZone'),
      zone: ZoneRefSchema,
      filter: TokenFilterExprSchema.optional(),
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
      filter: TokenFilterExprSchema.optional(),
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
      var: ScopedVarNameExprSchema,
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
      filter: TokenFilterExprSchema.optional(),
    })
    .strict(),
  z
    .object({
      query: z.literal('connectedZones'),
      zone: ZoneRefSchema,
      via: ConditionASTSchema.optional(),
      includeStart: BooleanSchema.optional(),
      allowTargetOutsideVia: BooleanSchema.optional(),
      maxDepth: NumberSchema.optional(),
    })
    .strict(),
  z.object({ query: z.literal('binding'), name: StringSchema, displayName: StringSchema.optional() }).strict(),
  z.object({ query: z.literal('grantContext'), key: StringSchema }).strict(),
  z.object({ query: z.literal('capturedSequenceZones'), key: FreeOperationSequenceKeyExprSchema }).strict(),
]);

valueExprSchemaInternal = z.union([
  NumberSchema,
  BooleanSchema,
  StringSchema,
  z.object({ _t: IntegerSchema.optional(), scalarArray: ScalarValueArraySchema }).strict(),
  ReferenceSchema,
  z
    .object({
      _t: IntegerSchema.optional(),
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
      _t: IntegerSchema.optional(),
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
              bind: CanonicalBindingIdentifierSchema,
              valueExpr: NumericValueExprSchema,
            })
            .strict(),
        ]),
    })
    .strict(),
  z.object({ _t: IntegerSchema.optional(), concat: z.array(ValueExprSchema) }).strict(),
  z
    .object({
      _t: IntegerSchema.optional(),
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
      _t: IntegerSchema.optional(),
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
      _t: IntegerSchema.optional(),
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
              bind: CanonicalBindingIdentifierSchema,
              valueExpr: NumericValueExprSchema,
            })
            .strict(),
        ]),
    })
    .strict(),
  z
    .object({
      _t: IntegerSchema.optional(),
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
  z.object({ op: z.literal('and'), args: z.array(ConditionASTSchema).min(1) }).strict(),
  z.object({ op: z.literal('or'), args: z.array(ConditionASTSchema).min(1) }).strict(),
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
      allowTargetOutsideVia: BooleanSchema.optional(),
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
  z
    .object({
      op: z.literal('markerStateAllowed'),
      space: ZoneSelSchema,
      marker: StringSchema,
      state: ValueExprSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal('markerShiftAllowed'),
      space: ZoneSelSchema,
      marker: StringSchema,
      delta: NumericValueExprSchema,
    })
    .strict(),
]);

tokenFilterExprSchemaInternal = z.union([
  TokenFilterPredicateSchema,
  z.object({ op: z.literal('and'), args: z.array(TokenFilterExprSchema).min(1) }).strict(),
  z.object({ op: z.literal('or'), args: z.array(TokenFilterExprSchema).min(1) }).strict(),
  z.object({ op: z.literal('not'), arg: TokenFilterExprSchema }).strict(),
]);

effectAstSchemaInternal = z.union([
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.setVar),
      setVar: SetVarPayloadSchema,
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.setActivePlayer),
      setActivePlayer: z
        .object({
          player: PlayerSelSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.addVar),
      addVar: AddVarPayloadSchema,
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.transferVar),
      transferVar: z
        .object({
          from: TransferVarEndpointSchema,
          to: TransferVarEndpointSchema,
          amount: NumericValueExprSchema,
          min: NumericValueExprSchema.optional(),
          max: NumericValueExprSchema.optional(),
          actualBind: CanonicalBindingIdentifierSchema.optional(),
          macroOrigin: MacroOriginSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.moveToken),
      moveToken: z
        .object({
          token: TokenSelSchema,
          from: ZoneRefSchema,
          to: ZoneRefSchema,
          position: z.union([z.literal('top'), z.literal('bottom'), z.literal('random')]).optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.moveAll),
      moveAll: z
        .object({
          from: ZoneRefSchema,
          to: ZoneRefSchema,
          filter: ConditionASTSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.moveTokenAdjacent),
      moveTokenAdjacent: z
        .object({
          token: TokenSelSchema,
          from: ZoneRefSchema,
          direction: StringSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.draw),
      draw: z
        .object({
          from: ZoneRefSchema,
          to: ZoneRefSchema,
          count: NumberSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.reveal),
      reveal: z
        .object({
          zone: ZoneRefSchema,
          to: z.union([z.literal('all'), PlayerSelSchema]),
          filter: TokenFilterExprSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.conceal),
      conceal: z
        .object({
          zone: ZoneRefSchema,
          from: z.union([z.literal('all'), PlayerSelSchema]).optional(),
          filter: TokenFilterExprSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({ _k: z.literal(EFFECT_KIND_TAG.shuffle), shuffle: z.object({ zone: ZoneRefSchema }).strict() }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.createToken),
      createToken: z
        .object({
          type: StringSchema,
          zone: ZoneRefSchema,
          props: z.record(StringSchema, ValueExprSchema).optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.destroyToken),
      destroyToken: z.object({ token: TokenSelSchema }).strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.setTokenProp),
      setTokenProp: z
        .object({
          token: TokenSelSchema,
          prop: StringSchema,
          value: ValueExprSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.if),
      if: z
        .object({
          when: ConditionASTSchema,
          then: z.array(EffectASTSchema),
          else: z.array(EffectASTSchema).optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.forEach),
      forEach: z
        .object({
          bind: CanonicalBindingIdentifierSchema,
          macroOrigin: MacroOriginSchema.optional(),
          over: OptionsQuerySchema,
          effects: z.array(EffectASTSchema),
          limit: NumericValueExprSchema.optional(),
          countBind: CanonicalBindingIdentifierSchema.optional(),
          in: z.array(EffectASTSchema).optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.reduce),
      reduce: z
        .object({
          itemBind: CanonicalBindingIdentifierSchema,
          accBind: CanonicalBindingIdentifierSchema,
          itemMacroOrigin: MacroOriginSchema.optional(),
          accMacroOrigin: MacroOriginSchema.optional(),
          over: OptionsQuerySchema,
          initial: ValueExprSchema,
          next: ValueExprSchema,
          limit: NumericValueExprSchema.optional(),
          resultBind: CanonicalBindingIdentifierSchema,
          resultMacroOrigin: MacroOriginSchema.optional(),
          in: z.array(EffectASTSchema),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.removeByPriority),
      removeByPriority: z
        .object({
          budget: NumericValueExprSchema,
          groups: z.array(
            z
              .object({
                bind: CanonicalBindingIdentifierSchema,
                over: OptionsQuerySchema,
                to: z.union([ZoneSelSchema, z.object({ zoneExpr: ValueExprSchema }).strict()]),
                from: z.union([ZoneSelSchema, z.object({ zoneExpr: ValueExprSchema }).strict()]).optional(),
                countBind: CanonicalBindingIdentifierSchema.optional(),
                macroOrigin: MacroOriginSchema.optional(),
              })
              .strict(),
          ),
          remainingBind: CanonicalBindingIdentifierSchema.optional(),
          in: z.array(EffectASTSchema).optional(),
          macroOrigin: MacroOriginSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.let),
      let: z
        .object({
          bind: CanonicalBindingIdentifierSchema,
          value: ValueExprSchema,
          in: z.array(EffectASTSchema),
          macroOrigin: MacroOriginSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.bindValue),
      bindValue: z
        .object({
          bind: CanonicalBindingIdentifierSchema,
          value: ValueExprSchema,
          macroOrigin: MacroOriginSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.evaluateSubset),
      evaluateSubset: z
        .object({
          source: OptionsQuerySchema,
          subsetSize: NumericValueExprSchema,
          subsetBind: CanonicalBindingIdentifierSchema,
          compute: z.array(EffectASTSchema),
          scoreExpr: NumericValueExprSchema,
          resultBind: CanonicalBindingIdentifierSchema,
          bestSubsetBind: CanonicalBindingIdentifierSchema.optional(),
          in: z.array(EffectASTSchema),
          macroOrigin: MacroOriginSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.chooseOne),
      chooseOne: z
        .object({
          internalDecisionId: StringSchema,
          bind: CanonicalBindingIdentifierSchema,
          decisionIdentity: StringSchema.optional(),
          options: OptionsQuerySchema,
          chooser: PlayerSelSchema.optional(),
          macroOrigin: MacroOriginSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.chooseN),
      chooseN: z.union([
        z
          .object({
            internalDecisionId: StringSchema,
            bind: CanonicalBindingIdentifierSchema,
            decisionIdentity: StringSchema.optional(),
            options: OptionsQuerySchema,
            chooser: PlayerSelSchema.optional(),
            n: NumberSchema,
            macroOrigin: MacroOriginSchema.optional(),
          })
          .strict(),
        z
          .object({
            internalDecisionId: StringSchema,
            bind: CanonicalBindingIdentifierSchema,
            decisionIdentity: StringSchema.optional(),
            options: OptionsQuerySchema,
            chooser: PlayerSelSchema.optional(),
            min: NumericValueExprSchema.optional(),
            max: NumericValueExprSchema,
            macroOrigin: MacroOriginSchema.optional(),
          })
          .strict(),
      ]),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.rollRandom),
      rollRandom: z
        .object({
          bind: CanonicalBindingIdentifierSchema,
          min: NumericValueExprSchema,
          max: NumericValueExprSchema,
          in: z.array(EffectASTSchema),
          macroOrigin: MacroOriginSchema.optional(),
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.setMarker),
      setMarker: z
        .object({
          space: ZoneRefSchema,
          marker: StringSchema,
          state: ValueExprSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.shiftMarker),
      shiftMarker: z
        .object({
          space: ZoneRefSchema,
          marker: StringSchema,
          delta: NumericValueExprSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.setGlobalMarker),
      setGlobalMarker: z
        .object({
          marker: StringSchema,
          state: ValueExprSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.flipGlobalMarker),
      flipGlobalMarker: z
        .object({
          marker: ValueExprSchema,
          stateA: ValueExprSchema,
          stateB: ValueExprSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.shiftGlobalMarker),
      shiftGlobalMarker: z
        .object({
          marker: StringSchema,
          delta: NumericValueExprSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.grantFreeOperation),
      grantFreeOperation: createTurnFlowFreeOperationGrantSchema({
        id: StringSchema.optional(),
        seat: StringSchema,
        executeAsSeat: StringSchema.optional(),
        operationClass: z.enum(TURN_FLOW_ACTION_CLASS_VALUES),
        actionIds: z.array(StringSchema).optional(),
        zoneFilter: ConditionASTSchema.optional(),
        tokenInterpretations: z.array(FreeOperationTokenInterpretationRuleSchema).min(1).optional(),
        moveZoneBindings: z.array(StringSchema).min(1).optional(),
        moveZoneProbeBindings: z.array(StringSchema).min(1).optional(),
        allowDuringMonsoon: z.boolean().optional(),
        uses: NumberSchema.optional(),
        viabilityPolicy: z.enum(TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES).optional(),
        outcomePolicy: z.enum(TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES).optional(),
        sequence: z
          .object({
            batch: StringSchema,
            step: NumberSchema,
            progressionPolicy: z.enum(TURN_FLOW_FREE_OPERATION_GRANT_PROGRESSION_POLICY_VALUES).optional(),
          })
          .strict()
          .optional(),
        sequenceContext: FreeOperationSequenceContextSchema.optional(),
        executionContext: FreeOperationExecutionContextSchema.optional(),
      }),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.gotoPhaseExact),
      gotoPhaseExact: z
        .object({
          phase: StringSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.advancePhase),
      advancePhase: z.object({}).strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.pushInterruptPhase),
      pushInterruptPhase: z
        .object({
          phase: StringSchema,
          resumePhase: StringSchema,
        })
        .strict(),
    }),
  createEffectNodeSchema({
      _k: z.literal(EFFECT_KIND_TAG.popInterruptPhase),
      popInterruptPhase: z.object({}).strict(),
    }),
]);
