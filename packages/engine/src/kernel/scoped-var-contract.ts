import { z, type ZodRawShape, type ZodTypeAny } from 'zod';

export const AST_SCOPED_VAR_SCOPES = {
  global: 'global',
  player: 'pvar',
  zone: 'zoneVar',
} as const;

export const TRACE_SCOPED_VAR_SCOPES = {
  global: 'global',
  player: 'perPlayer',
  zone: 'zone',
} as const;

export type AstScopedVarScope = (typeof AST_SCOPED_VAR_SCOPES)[keyof typeof AST_SCOPED_VAR_SCOPES];
export type TraceScopedVarScope = (typeof TRACE_SCOPED_VAR_SCOPES)[keyof typeof TRACE_SCOPED_VAR_SCOPES];

type ReadonlyRecord<Key extends string, Value> = Readonly<Record<Key, Value>>;

export type ScopedVarEndpointContract<
  GlobalScope extends string,
  PlayerScope extends string,
  ZoneScope extends string,
  VarField extends string,
  PlayerField extends string,
  ZoneField extends string,
  PlayerValue,
  ZoneValue,
  VarValue = string,
> =
  | Readonly<{ scope: GlobalScope } & ReadonlyRecord<VarField, VarValue>>
  | Readonly<{ scope: PlayerScope } & ReadonlyRecord<PlayerField, PlayerValue> & ReadonlyRecord<VarField, VarValue>>
  | Readonly<{ scope: ZoneScope } & ReadonlyRecord<ZoneField, ZoneValue> & ReadonlyRecord<VarField, VarValue>>;

export type ScopedVarPayloadContract<
  GlobalScope extends string,
  PlayerScope extends string,
  ZoneScope extends string,
  VarField extends string,
  PlayerField extends string,
  ZoneField extends string,
  PlayerValue,
  ZoneValue,
  CommonFields extends object,
  VarValue = string,
> =
  | Readonly<{ scope: GlobalScope } & ReadonlyRecord<VarField, VarValue> & CommonFields>
  | Readonly<
      { scope: PlayerScope } & ReadonlyRecord<PlayerField, PlayerValue> & ReadonlyRecord<VarField, VarValue> & CommonFields
    >
  | Readonly<
      { scope: ZoneScope } & ReadonlyRecord<ZoneField, ZoneValue> & ReadonlyRecord<VarField, VarValue> & CommonFields
    >;

export interface ScopedVarContractSchemaConfig<
  GlobalScope extends string,
  PlayerScope extends string,
  ZoneScope extends string,
> {
  readonly scopes: {
    readonly global: GlobalScope;
    readonly player: PlayerScope;
    readonly zone: ZoneScope;
  };
  readonly fields: {
    readonly var: string;
    readonly player: string;
    readonly zone: string;
  };
  readonly schemas: {
    readonly var: ZodTypeAny;
    readonly player: ZodTypeAny;
    readonly zone: ZodTypeAny;
  };
  readonly commonShape?: ZodRawShape;
  readonly globalShape?: ZodRawShape;
  readonly playerShape?: ZodRawShape;
  readonly zoneShape?: ZodRawShape;
}

const endpointShape = (
  scope: string,
  scopeLiteral: string,
  varField: string,
  varSchema: ZodTypeAny,
  branchField: string | null,
  branchSchema: ZodTypeAny | null,
  commonShape: ZodRawShape | undefined,
  branchShape: ZodRawShape | undefined,
): ZodRawShape => ({
  [scope]: z.literal(scopeLiteral),
  [varField]: varSchema,
  ...(branchField === null || branchSchema === null ? {} : { [branchField]: branchSchema }),
  ...(commonShape ?? {}),
  ...(branchShape ?? {}),
});

export const createScopedVarContractSchema = <
  GlobalScope extends string,
  PlayerScope extends string,
  ZoneScope extends string,
>(
  config: ScopedVarContractSchemaConfig<GlobalScope, PlayerScope, ZoneScope>,
) => {
  const globalSchema = z
    .object(
      endpointShape(
        'scope',
        config.scopes.global,
        config.fields.var,
        config.schemas.var,
        null,
        null,
        config.commonShape,
        config.globalShape,
      ),
    )
    .strict();
  const playerSchema = z
    .object(
      endpointShape(
        'scope',
        config.scopes.player,
        config.fields.var,
        config.schemas.var,
        config.fields.player,
        config.schemas.player,
        config.commonShape,
        config.playerShape,
      ),
    )
    .strict();
  const zoneSchema = z
    .object(
      endpointShape(
        'scope',
        config.scopes.zone,
        config.fields.var,
        config.schemas.var,
        config.fields.zone,
        config.schemas.zone,
        config.commonShape,
        config.zoneShape,
      ),
    )
    .strict();

  return z.discriminatedUnion('scope', [globalSchema, playerSchema, zoneSchema]);
};
