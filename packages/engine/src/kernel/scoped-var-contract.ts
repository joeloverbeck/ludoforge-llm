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

const RESERVED_SCOPE_FIELD = 'scope';

const assertNoDuplicateValues = (label: string, entries: ReadonlyArray<readonly [string, string]>) => {
  const groups = new Map<string, string[]>();
  for (const [entryName, entryValue] of entries) {
    const values = groups.get(entryValue);
    if (values === undefined) {
      groups.set(entryValue, [entryName]);
      continue;
    }
    values.push(entryName);
  }

  for (const [entryValue, names] of groups) {
    if (names.length < 2) {
      continue;
    }
    throw new Error(`${label} must be unique. Duplicate value "${entryValue}" found in: ${names.join(', ')}`);
  }
};

const assertNoReservedFieldCollision = (fieldName: string, value: string) => {
  if (value === RESERVED_SCOPE_FIELD) {
    throw new Error(`Field "${fieldName}" cannot use reserved discriminator key "${RESERVED_SCOPE_FIELD}"`);
  }
};

const assertNoReservedShapeKeys = (
  shapeName: string,
  shape: ZodRawShape | undefined,
  reservedKeys: ReadonlySet<string>,
) => {
  if (shape === undefined) {
    return;
  }

  for (const key of Object.keys(shape)) {
    if (!reservedKeys.has(key)) {
      continue;
    }
    throw new Error(`Shape "${shapeName}" cannot redefine reserved key "${key}"`);
  }
};

const assertScopedVarContractConfig = <GlobalScope extends string, PlayerScope extends string, ZoneScope extends string>(
  config: ScopedVarContractSchemaConfig<GlobalScope, PlayerScope, ZoneScope>,
) => {
  assertNoDuplicateValues('Scope literals', [
    ['scopes.global', config.scopes.global],
    ['scopes.player', config.scopes.player],
    ['scopes.zone', config.scopes.zone],
  ]);

  assertNoReservedFieldCollision('fields.var', config.fields.var);
  assertNoReservedFieldCollision('fields.player', config.fields.player);
  assertNoReservedFieldCollision('fields.zone', config.fields.zone);

  assertNoDuplicateValues('Endpoint field names', [
    ['fields.var', config.fields.var],
    ['fields.player', config.fields.player],
    ['fields.zone', config.fields.zone],
  ]);

  const globalReservedKeys = new Set([RESERVED_SCOPE_FIELD, config.fields.var]);
  const playerReservedKeys = new Set([RESERVED_SCOPE_FIELD, config.fields.var, config.fields.player]);
  const zoneReservedKeys = new Set([RESERVED_SCOPE_FIELD, config.fields.var, config.fields.zone]);

  assertNoReservedShapeKeys('commonShape', config.commonShape, new Set([...playerReservedKeys, config.fields.zone]));
  assertNoReservedShapeKeys('globalShape', config.globalShape, globalReservedKeys);
  assertNoReservedShapeKeys('playerShape', config.playerShape, playerReservedKeys);
  assertNoReservedShapeKeys('zoneShape', config.zoneShape, zoneReservedKeys);
};

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
  assertScopedVarContractConfig(config);

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
