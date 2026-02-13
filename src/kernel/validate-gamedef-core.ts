import type { Diagnostic } from './diagnostics.js';
import { buildAdjacencyGraph, validateAdjacency } from './spatial.js';
import type { GameDef } from './types.js';
import { validateConditionAst, validateEffectAst, validateOptionsQuery, validatePostAdjacencyBehavior } from './validate-gamedef-behavior.js';
import { validateCoupPlan, validateOperationProfiles, validateVictory } from './validate-gamedef-extensions.js';
import {
  buildValidationContext,
  pushMissingReferenceDiagnostic,
  validatePlayerSelector,
  validateInitialPlacementsAgainstStackingConstraints,
  validateStructureSections,
} from './validate-gamedef-structure.js';

export const validateGameDef = (def: GameDef): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  validateStructureSections(diagnostics, def);

  const { context, phaseCandidates, actionCandidates } = buildValidationContext(def);

  validateCoupPlan(diagnostics, def);
  validateVictory(diagnostics, def, context);

  def.setup.forEach((effect, index) => {
    validateEffectAst(diagnostics, effect, `setup[${index}]`, context);
  });

  def.actions.forEach((action, actionIndex) => {
    validatePlayerSelector(diagnostics, action.actor, `actions[${actionIndex}].actor`, context);

    if (!phaseCandidates.includes(action.phase)) {
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `actions[${actionIndex}].phase`,
        `Unknown phase "${action.phase}".`,
        action.phase,
        phaseCandidates,
      );
    }

    action.params.forEach((param, paramIndex) => {
      validateOptionsQuery(diagnostics, param.domain, `actions[${actionIndex}].params[${paramIndex}].domain`, context);
    });

    if (action.pre) {
      validateConditionAst(diagnostics, action.pre, `actions[${actionIndex}].pre`, context);
    }

    action.cost.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `actions[${actionIndex}].cost[${effectIndex}]`, context);
    });
    action.effects.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `actions[${actionIndex}].effects[${effectIndex}]`, context);
    });
  });

  validateOperationProfiles(diagnostics, def, actionCandidates);

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  diagnostics.push(...validateAdjacency(adjacencyGraph, def.zones));

  validatePostAdjacencyBehavior(diagnostics, def, context, phaseCandidates, actionCandidates);

  return diagnostics;
};

export { validateInitialPlacementsAgainstStackingConstraints };
