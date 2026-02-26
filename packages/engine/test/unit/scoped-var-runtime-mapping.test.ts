import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPlayerId, asZoneId } from '../../src/kernel/branded.js';
import {
  toTraceResourceEndpoint,
  toTraceVarChangePayload,
  toVarChangedEvent,
  type RuntimeScopedVarEndpoint,
} from '../../src/kernel/scoped-var-runtime-mapping.js';

const PLAYER = asPlayerId(1);
const ZONE = asZoneId('zone-a:none');

type MappingCase<TExpected> = Readonly<{
  readonly name: string;
  readonly endpoint: RuntimeScopedVarEndpoint;
  readonly expected: TExpected;
  readonly absentKeys: ReadonlyArray<'player' | 'zone'>;
}>;

describe('scoped-var-runtime-mapping', () => {
  it('maps runtime endpoints to trace resource endpoints by scope', () => {
    const cases: readonly MappingCase<{
      readonly scope: 'global' | 'perPlayer' | 'zone';
      readonly varName: string;
      readonly player?: number;
      readonly zone?: string;
    }>[] = [
      {
        name: 'global',
        endpoint: { scope: 'global', var: 'score' },
        expected: { scope: 'global', varName: 'score' },
        absentKeys: ['player', 'zone'],
      },
      {
        name: 'pvar',
        endpoint: { scope: 'pvar', player: PLAYER, var: 'hp' },
        expected: { scope: 'perPlayer', player: PLAYER, varName: 'hp' },
        absentKeys: ['zone'],
      },
      {
        name: 'zone',
        endpoint: { scope: 'zone', zone: ZONE, var: 'supply' },
        expected: { scope: 'zone', zone: ZONE, varName: 'supply' },
        absentKeys: ['player'],
      },
    ];

    for (const testCase of cases) {
      const actual = toTraceResourceEndpoint(testCase.endpoint);
      assert.deepEqual(actual, testCase.expected, `${testCase.name}: mapped endpoint mismatch`);
      for (const key of testCase.absentKeys) {
        assert.equal(key in actual, false, `${testCase.name}: unexpected ${key} key`);
      }
    }
  });

  it('maps runtime endpoint writes to varChange payloads by scope', () => {
    const cases: readonly MappingCase<{
      readonly scope: 'global' | 'perPlayer' | 'zone';
      readonly varName: string;
      readonly oldValue: number;
      readonly newValue: number;
      readonly player?: number;
      readonly zone?: string;
    }>[] = [
      {
        name: 'global',
        endpoint: { scope: 'global', var: 'score' },
        expected: { scope: 'global', varName: 'score', oldValue: 3, newValue: 9 },
        absentKeys: ['player', 'zone'],
      },
      {
        name: 'pvar',
        endpoint: { scope: 'pvar', player: PLAYER, var: 'hp' },
        expected: { scope: 'perPlayer', player: PLAYER, varName: 'hp', oldValue: 6, newValue: 11 },
        absentKeys: ['zone'],
      },
      {
        name: 'zone',
        endpoint: { scope: 'zone', zone: ZONE, var: 'supply' },
        expected: { scope: 'zone', zone: ZONE, varName: 'supply', oldValue: 2, newValue: 4 },
        absentKeys: ['player'],
      },
    ];

    for (const testCase of cases) {
      const actual = toTraceVarChangePayload(
        testCase.endpoint,
        testCase.expected.oldValue,
        testCase.expected.newValue,
      );
      assert.deepEqual(actual, testCase.expected, `${testCase.name}: varChange payload mismatch`);
      for (const key of testCase.absentKeys) {
        assert.equal(key in actual, false, `${testCase.name}: unexpected ${key} key`);
      }
    }
  });

  it('maps runtime endpoint writes to emitted varChanged events by scope', () => {
    const cases: readonly MappingCase<{
      readonly type: 'varChanged';
      readonly scope: 'global' | 'perPlayer' | 'zone';
      readonly var: string;
      readonly oldValue: number;
      readonly newValue: number;
      readonly player?: number;
      readonly zone?: string;
    }>[] = [
      {
        name: 'global',
        endpoint: { scope: 'global', var: 'score' },
        expected: { type: 'varChanged', scope: 'global', var: 'score', oldValue: 3, newValue: 9 },
        absentKeys: ['player', 'zone'],
      },
      {
        name: 'pvar',
        endpoint: { scope: 'pvar', player: PLAYER, var: 'hp' },
        expected: { type: 'varChanged', scope: 'perPlayer', player: PLAYER, var: 'hp', oldValue: 6, newValue: 11 },
        absentKeys: ['zone'],
      },
      {
        name: 'zone',
        endpoint: { scope: 'zone', zone: ZONE, var: 'supply' },
        expected: { type: 'varChanged', scope: 'zone', zone: ZONE, var: 'supply', oldValue: 2, newValue: 4 },
        absentKeys: ['player'],
      },
    ];

    for (const testCase of cases) {
      const actual = toVarChangedEvent(
        testCase.endpoint,
        testCase.expected.oldValue,
        testCase.expected.newValue,
      );
      assert.deepEqual(actual, testCase.expected, `${testCase.name}: event payload mismatch`);
      for (const key of testCase.absentKeys) {
        assert.equal(key in actual, false, `${testCase.name}: unexpected ${key} key`);
      }
    }
  });
});
