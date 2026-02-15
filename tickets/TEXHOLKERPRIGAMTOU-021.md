# TEXHOLKERPRIGAMTOU-021: Enforced Schema Artifact Synchronization for GameDef Contracts

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Small
**Dependencies**: TEXHOLKERPRIGAMTOU-016, TEXHOLKERPRIGAMTOU-020
**Blocks**: none

## 1) What needs to be fixed/added

Prevent drift between TypeScript/Zod `GameDef` contracts and JSON schema artifacts.

Scope:
- Add canonical generation/verification flow for `schemas/GameDef.schema.json` from source contract definitions.
- Add CI check that fails when schema artifact is out of sync.
- Document the single source of truth and update workflow.

Constraints:
- No manual parallel schema editing.
- One canonical derivation path.

## 2) Invariants that should pass

1. Contract changes in source code cannot land with stale JSON schema artifacts.
2. Schema artifact generation is deterministic.
3. Validation tests consume synchronized schemas only.

## 3) Tests that should pass

1. Unit/integration: JSON schema validation tests pass against generated artifacts.
2. Tooling/CI test: out-of-sync schema state is detected and fails.
3. Regression: `npm run build`, `npm test`, `npm run lint`.
