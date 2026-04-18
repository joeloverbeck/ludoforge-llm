// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GameSpecPhaseTemplateDef } from '../../../src/cnl/game-spec-doc.js';
import { resolvePhaseIdFromTemplate } from '../../../src/cnl/validate-spec-shared.js';

function makeTemplate(
  id: string,
  phaseId: unknown,
  params: readonly { name: string; type: string }[] = [],
): GameSpecPhaseTemplateDef {
  return { id, params, phase: { id: phaseId } };
}

describe('resolvePhaseIdFromTemplate', () => {
  it('returns undefined when phaseTemplates is null', () => {
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { faction: 'NVA' } },
      null,
    );
    assert.equal(result, undefined);
  });

  it('returns undefined when phaseTemplates is undefined', () => {
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { faction: 'NVA' } },
      undefined,
    );
    assert.equal(result, undefined);
  });

  it('returns undefined when phaseTemplates is empty', () => {
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { faction: 'NVA' } },
      [],
    );
    assert.equal(result, undefined);
  });

  it('returns undefined when no template matches', () => {
    const templates = [makeTemplate('other', '{faction}-phase')];
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { faction: 'NVA' } },
      templates,
    );
    assert.equal(result, undefined);
  });

  it('returns undefined when template phase.id is not a string', () => {
    const templates = [makeTemplate('tpl', 42)];
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { faction: 'NVA' } },
      templates,
    );
    assert.equal(result, undefined);
  });

  it('substitutes entire-string param and normalizes', () => {
    const templates = [makeTemplate('tpl', '{faction}')];
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { faction: 'NVA' } },
      templates,
    );
    assert.equal(result, 'NVA');
  });

  it('substitutes partial param in a longer string', () => {
    const templates = [makeTemplate('tpl', '{faction}-operations')];
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { faction: 'US' } },
      templates,
    );
    assert.equal(result, 'US-operations');
  });

  it('substitutes multiple params in a single string', () => {
    const templates = [makeTemplate('tpl', '{faction}-{action}')];
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { faction: 'ARVN', action: 'train' } },
      templates,
    );
    assert.equal(result, 'ARVN-train');
  });

  it('returns normalized ID when no params match', () => {
    const templates = [makeTemplate('tpl', 'static-phase')];
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { unrelated: 'value' } },
      templates,
    );
    assert.equal(result, 'static-phase');
  });

  it('coerces non-string arg values to string', () => {
    const templates = [makeTemplate('tpl', 'round-{num}')];
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: { num: 3 } },
      templates,
    );
    assert.equal(result, 'round-3');
  });

  it('handles empty args object', () => {
    const templates = [makeTemplate('tpl', '{faction}-phase')];
    const result = resolvePhaseIdFromTemplate(
      { fromTemplate: 'tpl', args: {} },
      templates,
    );
    assert.equal(result, '{faction}-phase');
  });
});
