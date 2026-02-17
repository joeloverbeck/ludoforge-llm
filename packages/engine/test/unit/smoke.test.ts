import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

describe('project smoke test', () => {
  it('imports from kernel module', async () => {
    const mod = await import('../../src/kernel/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports from cnl module', async () => {
    const mod = await import('../../src/cnl/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports from agents module', async () => {
    const mod = await import('../../src/agents/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports from sim module', async () => {
    const mod = await import('../../src/sim/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports from cli module', async () => {
    const mod = await import('../../src/cli/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports yaml (eemeli/yaml)', async () => {
    const { parse } = await import('yaml');
    assert.equal(typeof parse, 'function');
  });

  it('imports zod', async () => {
    const { z } = await import('zod');
    assert.equal(typeof z.object, 'function');
  });
});
