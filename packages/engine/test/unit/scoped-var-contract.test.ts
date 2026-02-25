import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createScopedVarContractSchema } from '../../src/kernel/scoped-var-contract.js';
import { z } from 'zod';

const makeConfig = () => ({
  scopes: {
    global: 'global',
    player: 'perPlayer',
    zone: 'zone',
  },
  fields: {
    var: 'varName',
    player: 'player',
    zone: 'zoneId',
  },
  schemas: {
    var: z.string(),
    player: z.number().int(),
    zone: z.string(),
  },
});

describe('createScopedVarContractSchema', () => {
  it('builds and parses valid scoped endpoints', () => {
    const schema = createScopedVarContractSchema(makeConfig());

    assert.equal(schema.safeParse({ scope: 'global', varName: 'pool' }).success, true);
    assert.equal(schema.safeParse({ scope: 'perPlayer', player: 0, varName: 'coins' }).success, true);
    assert.equal(schema.safeParse({ scope: 'zone', zoneId: 'board:none', varName: 'supply' }).success, true);
  });

  it('throws when scope literals are duplicated', () => {
    assert.throws(
      () =>
        createScopedVarContractSchema({
          ...makeConfig(),
          scopes: {
            global: 'shared',
            player: 'shared',
            zone: 'zone',
          },
        }),
      /Scope literals must be unique\. Duplicate value "shared" found in: scopes\.global, scopes\.player/,
    );
  });

  it('throws when endpoint field names collide or use reserved scope key', () => {
    assert.throws(
      () =>
        createScopedVarContractSchema({
          ...makeConfig(),
          fields: {
            var: 'scope',
            player: 'player',
            zone: 'zoneId',
          },
        }),
      /Field "fields\.var" cannot use reserved discriminator key "scope"/,
    );

    assert.throws(
      () =>
        createScopedVarContractSchema({
          ...makeConfig(),
          fields: {
            var: 'id',
            player: 'id',
            zone: 'zoneId',
          },
        }),
      /Endpoint field names must be unique\. Duplicate value "id" found in: fields\.var, fields\.player/,
    );
  });

  it('throws when extension shapes redefine reserved keys', () => {
    assert.throws(
      () =>
        createScopedVarContractSchema({
          ...makeConfig(),
          commonShape: {
            scope: z.string(),
          },
        }),
      /Shape "commonShape" cannot redefine reserved key "scope"/,
    );

    assert.throws(
      () =>
        createScopedVarContractSchema({
          ...makeConfig(),
          playerShape: {
            player: z.string(),
          },
        }),
      /Shape "playerShape" cannot redefine reserved key "player"/,
    );
  });
});
