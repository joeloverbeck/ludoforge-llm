import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { materializeZoneDefs } from '../../src/cnl/compile-zones.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../src/cnl/compiler-diagnostic-codes.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

describe('materializeZoneDefs — zone behavior', () => {
  it('passes through deck behavior to compiled ZoneDef', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
          behavior: { type: 'deck', drawFrom: 'top' },
        },
      ],
      2,
    );

    assertNoDiagnostics(result);
    const zone = result.value.zones[0];
    assert.ok(zone !== undefined);
    assert.deepEqual(zone.behavior, { type: 'deck', drawFrom: 'top' });
  });

  it('passes through deck behavior with reshuffleFrom', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
          behavior: { type: 'deck', drawFrom: 'top', reshuffleFrom: 'discard:none' },
        },
      ],
      2,
    );

    assertNoDiagnostics(result);
    const zone = result.value.zones[0];
    assert.ok(zone !== undefined);
    assert.equal(zone.behavior?.type, 'deck');
    assert.equal((zone.behavior as { reshuffleFrom?: string }).reshuffleFrom, 'discard:none');
  });

  it('passes through drawFrom: bottom', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
          behavior: { type: 'deck', drawFrom: 'bottom' },
        },
      ],
      2,
    );

    assertNoDiagnostics(result);
    assert.equal(result.value.zones[0]?.behavior?.drawFrom, 'bottom');
  });

  it('passes through drawFrom: random', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
          behavior: { type: 'deck', drawFrom: 'random' },
        },
      ],
      2,
    );

    assertNoDiagnostics(result);
    assert.equal(result.value.zones[0]?.behavior?.drawFrom, 'random');
  });

  it('defaults drawFrom to top when omitted', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
          behavior: { type: 'deck' },
        },
      ],
      2,
    );

    assertNoDiagnostics(result);
    assert.equal(result.value.zones[0]?.behavior?.drawFrom, 'top');
  });

  it('emits warning when deck behavior with non-stack ordering', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'set',
          behavior: { type: 'deck', drawFrom: 'top' },
        },
      ],
      2,
    );

    const warnings = result.diagnostics.filter(d => d.severity === 'warning');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.code, CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_BEHAVIOR_ORDERING_MISMATCH);
    // Zone still compiles despite warning
    assert.ok(result.value.zones[0]?.behavior !== undefined);
  });

  it('emits error for invalid behavior type', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
          behavior: { type: 'market' },
        },
      ],
      2,
    );

    const errors = result.diagnostics.filter(d => d.severity === 'error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.code, CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_BEHAVIOR_TYPE_INVALID);
    // behavior not set on output zone due to error
    assert.equal(result.value.zones[0]?.behavior, undefined);
  });

  it('emits error for invalid drawFrom value', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
          behavior: { type: 'deck', drawFrom: 'middle' },
        },
      ],
      2,
    );

    const errors = result.diagnostics.filter(d => d.severity === 'error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.code, CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_BEHAVIOR_DRAW_FROM_INVALID);
  });

  it('zone without behavior has no behavior field on output', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'deck',
          owner: 'none',
          visibility: 'hidden',
          ordering: 'stack',
        },
      ],
      2,
    );

    assertNoDiagnostics(result);
    assert.equal(result.value.zones[0]?.behavior, undefined);
  });

  it('propagates behavior to all player-owned zone instances', () => {
    const result = materializeZoneDefs(
      [
        {
          id: 'draw',
          owner: 'player',
          visibility: 'owner',
          ordering: 'stack',
          behavior: { type: 'deck', drawFrom: 'top' },
        },
      ],
      3,
    );

    assertNoDiagnostics(result);
    assert.equal(result.value.zones.length, 3);
    for (const zone of result.value.zones) {
      assert.deepEqual(zone.behavior, { type: 'deck', drawFrom: 'top' });
    }
  });
});
