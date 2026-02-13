# ARCDECANDGEN-019: Document Canonical YAML-to-GameDef Section Mapping and Compilation Order

**Phase**: 7A + 7B (GameSpecDoc YAML Section Mapping)
**Priority**: P2
**Complexity**: S
**Dependencies**: ARCDECANDGEN-013 (pipeline rename), ARCDECANDGEN-014 (turnOrder), ARCDECANDGEN-018 (terminal)

## Goal

After the renames in Phases 4-6, document the canonical mapping from GameSpecDoc YAML sections to GameDef fields, and the required compilation order. This is primarily a documentation + verification task with one small integration test.

## File List (files to touch)

### Files to modify
- `specs/32-architecture-decomposition-and-generalization.md` — update Phase 7 tables to reflect actual post-rename field names (if any deviations occurred during implementation)

### Files to potentially modify
- `src/cnl/compiler-core.ts` — verify compilation order matches documented order; add inline comments referencing the canonical order if not already present

### New test file
- `test/integration/compilation-order.test.ts` — integration test verifying section independence claims

## Out of Scope

- **No code changes** beyond documentation comments and the integration test
- **No new features**
- **No changes to** `src/kernel/`, `src/agents/`, `src/sim/`
- **No changes to** `data/games/fire-in-the-lake.md`

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New test
1. **"YAML sections compile in documented order without dependency violations"** — compile a spec that exercises all 20 sections; assert no section references an unavailable dependency; compile succeeds

### Invariants that must remain true
- Every GameSpecDoc YAML section maps to exactly one GameDef field (or is consumed during compilation)
- Required sections produce compile errors when missing
- Optional absent sections produce no diagnostics
- The section mapping is exhaustive — no GameDef field lacks a YAML source
- Compilation order respects all forward dependencies
