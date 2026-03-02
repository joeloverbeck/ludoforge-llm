import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asZoneId } from '../../src/kernel/branded.js';
import type { ZoneDef } from '../../src/kernel/types.js';
import type { CompileSectionResults } from '../../src/cnl/compiler-core.js';
import {
  buildSeatIdentityContract,
  compileGameSpecToGameDef,
  createEmptyGameSpecDoc,
  crossValidateSpec,
} from '../../src/cnl/index.js';
import { CNL_XREF_DIAGNOSTIC_CODES } from '../../src/cnl/cross-validate-diagnostic-codes.js';

function createMinimalDoc() {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'xref-zone-behavior-test', players: { min: 1, max: 2 } },
    zones: [
      { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'discard', owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [{ createToken: { type: 'card', zone: 'discard:none' } }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    terminal: {
      conditions: [{ when: { op: '==' as const, left: 1, right: 1 }, result: { type: 'draw' as const } }],
    },
  };
}

function compileMinimalSections(): CompileSectionResults {
  const result = compileGameSpecToGameDef(createMinimalDoc());
  assert.equal(result.diagnostics.some(d => d.severity === 'error'), false, `unexpected compile errors: ${JSON.stringify(result.diagnostics.filter(d => d.severity === 'error'))}`);
  return result.sections;
}

function crossValidate(sections: CompileSectionResults) {
  const seatIdentityContract = buildSeatIdentityContract({
    seatCatalogSeatIds: undefined,
  });
  return crossValidateSpec(sections, seatIdentityContract.contract);
}

const deckZone = (behavior?: ZoneDef['behavior']): ZoneDef => ({
  id: asZoneId('deck:none'),
  owner: 'none',
  visibility: 'hidden',
  ordering: 'stack',
  ...(behavior === undefined ? {} : { behavior }),
});

const discardZone = (): ZoneDef => ({
  id: asZoneId('discard:none'),
  owner: 'none',
  visibility: 'public',
  ordering: 'stack',
});

describe('crossValidateSpec — zone behavior reshuffleFrom', () => {
  it('reshuffleFrom referencing a valid zone produces no diagnostic', () => {
    const sections = compileMinimalSections();
    const diagnostics = crossValidate({
      ...sections,
      zones: [
        deckZone({ type: 'deck', drawFrom: 'top', reshuffleFrom: asZoneId('discard:none') }),
        discardZone(),
      ],
    });

    const behaviorDiagnostics = diagnostics.filter(d => d.code.startsWith('CNL_XREF_ZONE_BEHAVIOR'));
    assert.deepEqual(behaviorDiagnostics, []);
  });

  it('reshuffleFrom referencing non-existent zone emits CNL_XREF_ZONE_BEHAVIOR_RESHUFFLE_MISSING', () => {
    const sections = compileMinimalSections();
    const diagnostics = crossValidate({
      ...sections,
      zones: [
        deckZone({ type: 'deck', drawFrom: 'top', reshuffleFrom: asZoneId('nonexistent:none') }),
        discardZone(),
      ],
    });

    const diag = diagnostics.find(d => d.code === CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ZONE_BEHAVIOR_RESHUFFLE_MISSING);
    assert.notEqual(diag, undefined);
    assert.ok(diag!.message.includes('nonexistent:none'));
    assert.equal(diag!.severity, 'error');
  });

  it('reshuffleFrom self-reference emits CNL_XREF_ZONE_BEHAVIOR_RESHUFFLE_SELF', () => {
    const sections = compileMinimalSections();
    const diagnostics = crossValidate({
      ...sections,
      zones: [
        deckZone({ type: 'deck', drawFrom: 'top', reshuffleFrom: asZoneId('deck:none') }),
        discardZone(),
      ],
    });

    const diag = diagnostics.find(d => d.code === CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ZONE_BEHAVIOR_RESHUFFLE_SELF);
    assert.notEqual(diag, undefined);
    assert.ok(diag!.message.includes('deck:none'));
    assert.equal(diag!.severity, 'error');
  });

  it('zone without reshuffleFrom produces no behavior diagnostic', () => {
    const sections = compileMinimalSections();
    const diagnostics = crossValidate({
      ...sections,
      zones: [
        deckZone({ type: 'deck', drawFrom: 'top' }),
        discardZone(),
      ],
    });

    const behaviorDiagnostics = diagnostics.filter(d => d.code.startsWith('CNL_XREF_ZONE_BEHAVIOR'));
    assert.deepEqual(behaviorDiagnostics, []);
  });

  it('zone without behavior produces no behavior diagnostic', () => {
    const sections = compileMinimalSections();
    const diagnostics = crossValidate({
      ...sections,
      zones: [deckZone(), discardZone()],
    });

    const behaviorDiagnostics = diagnostics.filter(d => d.code.startsWith('CNL_XREF_ZONE_BEHAVIOR'));
    assert.deepEqual(behaviorDiagnostics, []);
  });
});
