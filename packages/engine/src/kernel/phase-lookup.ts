import type { GameDef, PhaseDef } from './types.js';

/**
 * Look up a phase definition by its id, searching both `phases` and
 * `interrupts` in `def.turnStructure`.  Returns `undefined` when no
 * phase with the given id exists.
 */
export function findPhaseDef(
  def: GameDef,
  phaseId: string,
): PhaseDef | undefined {
  return (
    def.turnStructure.phases.find((p) => p.id === phaseId) ??
    (def.turnStructure.interrupts ?? []).find((p) => p.id === phaseId)
  );
}
