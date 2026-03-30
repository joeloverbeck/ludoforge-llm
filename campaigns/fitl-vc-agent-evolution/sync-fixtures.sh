#!/usr/bin/env bash
# Regenerate golden fixtures after agent policy YAML changes.
# Run after build, before test gate.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Regenerating FITL policy catalog golden fixture..." >&2
node -e "
const { compileProductionSpec } = await import('$PROJECT_ROOT/packages/engine/dist/test/helpers/production-spec-helpers.js');
const { writeFileSync } = await import('node:fs');
const catalog = compileProductionSpec().compiled.gameDef.agents;
writeFileSync('$PROJECT_ROOT/packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json', JSON.stringify(catalog, null, 2) + '\n');
console.error('  fitl-policy-catalog.golden.json regenerated');
"

echo "Regenerating FITL policy summary golden fixture..." >&2
node -e "
const { compileProductionSpec } = await import('$PROJECT_ROOT/packages/engine/dist/test/helpers/production-spec-helpers.js');
const { assertValidatedGameDef, createGameDefRuntime, createRng, enumerateLegalMoves, initialState } = await import('$PROJECT_ROOT/packages/engine/dist/src/kernel/index.js');
const { PolicyAgent } = await import('$PROJECT_ROOT/packages/engine/dist/src/agents/index.js');
const { writeFileSync } = await import('node:fs');
const def = assertValidatedGameDef(compileProductionSpec().compiled.gameDef);
const runtime = createGameDefRuntime(def);
const state = initialState(def, 7, 4).state;
const moves = enumerateLegalMoves(def, state, undefined, runtime).moves;
const result = new PolicyAgent({ traceLevel: 'summary' }).chooseMove({
  def, state, playerId: state.activePlayer, legalMoves: moves, rng: createRng(7n), runtime,
});
writeFileSync('$PROJECT_ROOT/packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json', JSON.stringify({ move: result.move.move, agentDecision: result.agentDecision }, null, 2) + '\n');
console.error('  fitl-policy-summary.golden.json regenerated');
"

echo "Fixture sync complete." >&2
