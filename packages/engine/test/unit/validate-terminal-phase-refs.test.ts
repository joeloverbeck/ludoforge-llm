import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type GameDef, validateGameDef } from '../../src/kernel/index.js';
import { asTaggedGameDef, createValidGameDef } from '../helpers/gamedef-fixtures.js';

const withCheckpointPhases = (phases?: readonly string[]): GameDef => {
  const base = createValidGameDef();
  return asTaggedGameDef({
    ...base,
    turnStructure: {
      phases: [
        { ...base.turnStructure.phases[0], id: 'phaseA' as (typeof base.turnStructure.phases)[number]['id'] },
        { id: 'phaseB' as (typeof base.turnStructure.phases)[number]['id'] },
      ],
      interrupts: [{ id: 'interruptPhase' as (typeof base.turnStructure.phases)[number]['id'] }],
    },
    terminal: {
      conditions: [],
      checkpoints: [
        {
          id: 'checkpoint-a',
          seat: '0',
          timing: 'duringCoup',
          ...(phases === undefined ? {} : { phases }),
          when: { op: '==', left: 1, right: 1 },
        },
      ],
    },
  });
};

describe('validate terminal checkpoint phase references', () => {
  it('accepts checkpoint phases declared in turnStructure phases and interrupts', () => {
    const diagnostics = validateGameDef(withCheckpointPhases(['phaseA', 'interruptPhase']));

    assert.equal(
      diagnostics.some((diag) => diag.code === 'VICTORY_CHECKPOINT_PHASE_UNKNOWN' || diag.code === 'VICTORY_CHECKPOINT_PHASES_EMPTY'),
      false,
    );
  });

  it('does not emit phase diagnostics when checkpoint phases are omitted', () => {
    const diagnostics = validateGameDef(withCheckpointPhases());

    assert.equal(
      diagnostics.some((diag) => diag.code === 'VICTORY_CHECKPOINT_PHASE_UNKNOWN' || diag.code === 'VICTORY_CHECKPOINT_PHASES_EMPTY'),
      false,
    );
  });

  it('reports an error for unknown checkpoint phases', () => {
    const diagnostic = validateGameDef(withCheckpointPhases(['nonExistent'])).find(
      (diag) => diag.code === 'VICTORY_CHECKPOINT_PHASE_UNKNOWN',
    );

    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'terminal.checkpoints[0].phases[0]');
    assert.equal(diagnostic.severity, 'error');
    assert.match(diagnostic.message, /checkpoint-a/u);
    assert.match(diagnostic.message, /nonExistent/u);
  });

  it('warns when a checkpoint declares an empty phases array', () => {
    const diagnostic = validateGameDef(withCheckpointPhases([])).find(
      (diag) => diag.code === 'VICTORY_CHECKPOINT_PHASES_EMPTY',
    );

    assert.ok(diagnostic);
    assert.equal(diagnostic.path, 'terminal.checkpoints[0].phases');
    assert.equal(diagnostic.severity, 'warning');
    assert.match(diagnostic.message, /checkpoint-a/u);
  });

  it('reports only invalid entries when phases mix valid and invalid ids', () => {
    const diagnostics = validateGameDef(withCheckpointPhases(['phaseA', 'missingPhase', 'interruptPhase']));
    const phaseErrors = diagnostics.filter((diag) => diag.code === 'VICTORY_CHECKPOINT_PHASE_UNKNOWN');

    assert.equal(phaseErrors.length, 1);
    assert.equal(phaseErrors[0]?.path, 'terminal.checkpoints[0].phases[1]');
    assert.match(phaseErrors[0]?.message ?? '', /missingPhase/u);
  });
});
