export interface EndpointMatrixViolation {
  readonly endpoint: 'from' | 'to';
  readonly field: 'player' | 'zone';
}

export interface EndpointMatrixCase {
  readonly name: string;
  readonly from: Readonly<Record<string, unknown>>;
  readonly to: Readonly<Record<string, unknown>>;
  readonly violation?: EndpointMatrixViolation;
}

export interface DiscriminatedEndpointMatrixConfig {
  readonly scopeField: string;
  readonly varField: string;
  readonly playerField: string;
  readonly zoneField: string;
  readonly scopes: {
    readonly global: string;
    readonly player: string;
    readonly zone: string;
  };
  readonly values: {
    readonly globalVar: string;
    readonly playerVar: string;
    readonly zoneVar: string;
    readonly player: unknown;
    readonly zone: unknown;
  };
}

const omitField = (
  endpoint: Readonly<Record<string, unknown>>,
  field: string,
): Readonly<Record<string, unknown>> => {
  const clone = { ...endpoint };
  Reflect.deleteProperty(clone, field);
  return clone;
};

const withField = (
  endpoint: Readonly<Record<string, unknown>>,
  field: string,
  value: unknown,
): Readonly<Record<string, unknown>> => ({
  ...endpoint,
  [field]: value,
});

export const buildDiscriminatedEndpointMatrix = (config: DiscriminatedEndpointMatrixConfig): readonly EndpointMatrixCase[] => {
  const {
    scopeField,
    varField,
    playerField,
    zoneField,
    scopes,
    values,
  } = config;

  const validGlobal = {
    [scopeField]: scopes.global,
    [varField]: values.globalVar,
  } as const;
  const validPlayer = {
    [scopeField]: scopes.player,
    [playerField]: values.player,
    [varField]: values.playerVar,
  } as const;
  const validZone = {
    [scopeField]: scopes.zone,
    [zoneField]: values.zone,
    [varField]: values.zoneVar,
  } as const;

  const invalidTemplates = [
    {
      label: `${scopes.global} forbids ${playerField}`,
      endpoint: withField(validGlobal, playerField, values.player),
      counterpart: validPlayer,
      field: 'player',
    },
    {
      label: `${scopes.global} forbids ${zoneField}`,
      endpoint: withField(validGlobal, zoneField, values.zone),
      counterpart: validPlayer,
      field: 'zone',
    },
    {
      label: `${scopes.player} requires ${playerField}`,
      endpoint: omitField(validPlayer, playerField),
      counterpart: validGlobal,
      field: 'player',
    },
    {
      label: `${scopes.player} forbids ${zoneField}`,
      endpoint: withField(validPlayer, zoneField, values.zone),
      counterpart: validGlobal,
      field: 'zone',
    },
    {
      label: `${scopes.zone} requires ${zoneField}`,
      endpoint: omitField(validZone, zoneField),
      counterpart: validGlobal,
      field: 'zone',
    },
    {
      label: `${scopes.zone} forbids ${playerField}`,
      endpoint: withField(validZone, playerField, values.player),
      counterpart: validGlobal,
      field: 'player',
    },
  ] as const;

  const invalidCases: EndpointMatrixCase[] = [];
  for (const target of ['from', 'to'] as const) {
    for (const template of invalidTemplates) {
      if (target === 'from') {
        invalidCases.push({
          name: `from.${template.label}`,
          from: template.endpoint,
          to: template.counterpart,
          violation: { endpoint: 'from', field: template.field },
        });
      } else {
        invalidCases.push({
          name: `to.${template.label}`,
          from: template.counterpart,
          to: template.endpoint,
          violation: { endpoint: 'to', field: template.field },
        });
      }
    }
  }

  return [
    ...invalidCases,
    {
      name: 'control: valid player->zone endpoints',
      from: validPlayer,
      to: validZone,
    },
  ];
};
