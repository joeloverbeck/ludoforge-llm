# VISCONF-008: Strip visual fields from engine contracts (atomic, build-green)

**Status**: ✅ COMPLETED

**Spec**: 42 (Per-Game Visual Config), D10-D14 integration checkpoint  
**Priority**: P1  
**Depends on**: `archive/tickets/VISCONF-004.md`, `archive/tickets/VISCONF-005.md`, `archive/tickets/VISCONF-006.md`, `archive/tickets/VISCONF-007.md`  
**Supersedes split execution**: VISCONF-009, VISCONF-010, VISCONF-011, VISCONF-012 (their work is executed atomically here to avoid broken intermediate architecture)

---

## Reassessed assumptions

Observed in current repo state:

1. Visual fields are still present across kernel types/schemas, compiler (`cnl`), production game specs, bootstrap JSON, and many tests.
2. VISCONF-004..007 are completed and archived, not active files under `tickets/`.
3. The previous VISCONF-008 acceptance criteria explicitly allowed a broken engine/typecheck state after partial removal.

Those assumptions conflict with the architecture target in Spec 42 and current implementation standards in this repository:

- No intentional broken intermediate state.
- No backwards-compat aliases for removed visual fields.
- Engine contracts remain coherent and test-green at each completed ticket.

---

## Architectural decision

Proceed with one atomic, subtractive cleanup across engine contracts, compiler, data inputs, fixtures, and tests in this ticket.

Rationale:

1. More robust: avoids “half-migrated” contracts where types and compiler disagree.
2. Cleaner: preserves single-source truth (visual concerns only in runner visual config).
3. More extensible: keeps kernel/compiler permanently visual-agnostic with strict unknown-key rejection.

---

## Scope

### 1) Kernel contract removal (Spec 42 D10)

- Remove visual types/fields from:
  - `packages/engine/src/kernel/types-core.ts`
  - `packages/engine/src/kernel/schemas-core.ts`
  - `packages/engine/src/kernel/schemas-gamespec.ts`
- Keep non-visual rules/data contracts intact.

### 2) Compiler/validator removal and strict rejection (Spec 42 D11)

- Remove visual pass-through and visual validators from:
  - `packages/engine/src/cnl/compile-lowering.ts`
  - `packages/engine/src/cnl/compile-data-assets.ts`
  - `packages/engine/src/cnl/compiler-core.ts`
  - `packages/engine/src/cnl/compile-zones.ts`
  - `packages/engine/src/cnl/validate-zones.ts`
  - `packages/engine/src/cnl/validate-metadata.ts`
  - `packages/engine/src/cnl/validate-spec-shared.ts`
  - `packages/engine/src/cnl/game-spec-doc.ts`
- Legacy keys must fail with error diagnostics (no silent ignore, no aliases):
  - `metadata.cardAnimation`, `metadata.layoutMode`
  - `zones[*].layoutRole`, `zones[*].visual`
  - `pieceTypes[*].visual`
  - `factions[*].color`, `factions[*].displayName`
  - `map.visualRules`, `spaces[*].visual`

### 3) Game spec source cleanup (Spec 42 D12)

- Remove visual keys from production game docs under `data/games/fire-in-the-lake/` and `data/games/texas-holdem/`.

### 4) Bootstrap/schema artifact cleanup (Spec 42 D13)

- Remove visual keys from:
  - `packages/runner/src/bootstrap/fitl-game-def.json`
  - `packages/runner/src/bootstrap/texas-game-def.json`
- Regenerate/verify schema artifacts as required.

### 5) Engine test realignment + boundary tests (Spec 42 D14)

- Remove now-invalid visual assertions.
- Delete/replace obsolete card-animation engine tests.
- Add/strengthen negative tests proving removed visual keys are compile-blocking errors.

---

## Out of scope

- New runner feature work unrelated to this contract extraction.
- Relaxed compatibility paths for removed visual fields.

---

## Acceptance criteria

### Quality gates (must all pass)

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`
5. `pnpm turbo test`
6. `pnpm turbo lint`

### Verification checks

1. `rg "ZoneVisualHints|TokenVisualHints|CardAnimationMetadata|PieceVisualMetadata|MapVisualRule|ZoneShape|TokenShape|CardAnimationZoneRole" packages/engine/src` returns zero hits.
2. `rg "layoutRole|layoutMode|cardAnimation" packages/engine/src/kernel packages/engine/src/cnl` returns zero hits (except runner visual-config domain).
3. `rg "visual:|layoutRole:|layoutMode:|cardAnimation:|displayName:|^\\s*color:" data/games` shows no legacy visual engine-spec fields.
4. Bootstrap JSON and `GameDef` schema exclude visual keys.

### Invariants

- Engine `GameDef` remains pure rules/runtime data (no presentation hints).
- Compiler+validator enforce the boundary strictly.
- Runner remains the only layer owning visual presentation config.
- No ticket-complete state leaves compile/test broken.

---

## Outcome

- **Completion date**: 2026-02-19
- **What changed vs plan**:
  - Completed D10-D14 atomically: removed visual fields from engine kernel contracts/schemas, compiler/validator pipelines, production game data docs, bootstrap fixtures, and aligned schema artifacts.
  - Enforced strict rejection of removed legacy visual keys in compiler/validator diagnostics.
  - Removed obsolete engine card-animation metadata tests and updated remaining engine tests/fixtures for the new contract boundary.
  - Realigned runner expectations to the new architecture (visual-config-driven roles/colors) so workspace test/typecheck/lint remain green with the removed engine fields.
- **Deviations from original plan**:
  - Runner test/typecheck fixes were required to remove lingering assumptions that faction visual data and layout roles still came from engine `GameDef` bootstrap payloads.
  - One integration test helper was hardened to resolve production spec paths independently of process working directory, eliminating flaky path assumptions during filtered/turbo runs.
- **Verification**:
  - Passed: `pnpm -F @ludoforge/engine typecheck`
  - Passed: `pnpm -F @ludoforge/engine build`
  - Passed: `pnpm -F @ludoforge/engine test`
  - Passed: `pnpm -F @ludoforge/engine test:e2e`
  - Passed: `pnpm turbo test`
  - Passed: `pnpm turbo typecheck`
  - Passed: `pnpm turbo lint`
