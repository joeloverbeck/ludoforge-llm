# TEXHOLKERPRIGAMTOU-021: Enforced Schema Artifact Synchronization for GameDef Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Dependencies**: TEXHOLKERPRIGAMTOU-020 (completed, archived)
**Blocks**: none

## 0) Reassessed assumptions (code/tests reality)

What exists today:
- `GameDefSchema` in `src/kernel/schemas-core.ts` is the authoritative runtime contract definition.
- `schemas/GameDef.schema.json` exists and is consumed by `test/unit/json-schema.test.ts`.
- JSON schema tests validate selected payloads against artifacts, but do not enforce full artifact lockstep with `GameDefSchema`.

Discrepancies found:
- There is no canonical generation command wired in `package.json` for `GameDef.schema.json`.
- There is no deterministic artifact sync check that fails when `GameDefSchema` and `schemas/GameDef.schema.json` diverge.
- The current `schemas/GameDef.schema.json` has drift relative to current `GameDefSchema` shape.
- Dependency metadata was stale: `-016` and `-020` are already completed and archived.

## 1) Updated scope

Prevent drift between TypeScript/Zod `GameDef` contracts and JSON schema artifacts.

Scope:
- Add one canonical generation flow for `schemas/GameDef.schema.json` derived directly from `GameDefSchema`.
- Add deterministic verification flow that fails when committed `schemas/GameDef.schema.json` is out of sync.
- Wire the verification command into the standard test/CI path.
- Document source-of-truth and update workflow in ticket outcome notes.

Constraints:
- No manual parallel schema editing.
- One canonical derivation path.
- No aliasing or backward-compat generation paths.

## 2) Invariants that should pass

1. Contract changes in source code cannot land with stale JSON schema artifacts.
2. Schema artifact generation is deterministic.
3. Validation/tests consume synchronized schemas only.
4. `GameDefSchema` remains the single source of truth for `GameDef` artifact shape.

## 3) Tests that should pass

1. Unit: JSON schema validation tests pass against generated artifacts.
2. Unit/tooling: out-of-sync `GameDef` schema artifact state is detected and fails deterministically.
3. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- Completion date: 2026-02-15
- What was actually changed:
  - Added canonical schema artifact script: `scripts/schema-artifacts.mjs`.
  - Added deterministic generate/check npm workflows:
    - `npm run schema:artifacts:generate`
    - `npm run schema:artifacts:check`
  - Wired schema sync check into the standard regression path via `npm test`.
  - Added explicit synchronization unit coverage in `test/unit/schema-artifacts-sync.test.ts`.
  - Regenerated schema artifacts from source-of-truth schemas:
    - `schemas/GameDef.schema.json` from `GameDefSchema`
    - `schemas/Trace.schema.json` from `SerializedGameTraceSchema`
    - `schemas/EvalReport.schema.json` from `SerializedEvalReportSchema`
  - Documented the workflow in `README.md`.
- Deviations from originally planned scope:
  - CI integration is implemented as a deterministic command gate (`schema:artifacts:check`) in the normal test flow, which can be invoked directly by any CI runner, rather than adding a repository-specific workflow file.
  - Scope was expanded to include Trace/EvalReport artifact lockstep because serialized-schema drift posed the same architecture risk as GameDef drift.
- Verification results:
  - `npm run build` ✅
  - `npm test` ✅
  - `npm run lint` ✅
