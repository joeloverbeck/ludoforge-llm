# VISCONF-010: Strip visual fields from GameSpecDoc Markdown sections

**Status**: ✅ COMPLETED
**Spec**: 42 (Per-Game Visual Config), D12
**Priority**: P1
**Depends on**: VISCONF-009 (validator/compiler removal), VISCONF-002 (visual-config.yaml destination exists)
**Blocks**: VISCONF-011, VISCONF-012

---

## Reassessed assumptions

This ticket originally assumed visual keys should be removed from all files under `data/games/`. That is incorrect after Spec 42 extraction:

1. Visual/presentation keys must be removed from GameSpecDoc Markdown sections (`00/10/40*.md`) because compiler input must stay rules-only.
2. Visual/presentation keys must remain in `data/games/*/visual-config.yaml` because that is the runner-only display contract.
3. Texas source vocabulary defines `hand` once (`owner: player`) and runtime expansion produces `hand:0..hand:9`; this ticket must not require literal `hand:0..hand:9` entries in source Markdown.
4. `layoutMode`, `layoutRole`, `cardAnimation`, zone/piece/map `visual*`, faction `color`/`displayName` are rejected as compile-blocking validator errors when present in GameSpecDoc input.

---

## Summary

Ensure FITL and Texas Hold'em GameSpecDoc Markdown files contain no visual fields, while preserving runner visual data in `visual-config.yaml`. This aligns with the target architecture: engine/compiler consume pure rules, runner consumes presentation.

---

## Files in scope

| File | Scope |
|------|-------|
| `data/games/fire-in-the-lake/00-metadata.md` | No `layoutMode`/`cardAnimation` |
| `data/games/fire-in-the-lake/10-vocabulary.md` | No zone `layoutRole`/`visual` |
| `data/games/fire-in-the-lake/40-content-data-assets.md` | No map/piece/faction visual fields in compiler-facing assets |
| `data/games/texas-holdem/00-metadata.md` | No `layoutMode`/`cardAnimation` |
| `data/games/texas-holdem/10-vocabulary.md` | No zone `layoutRole`/`visual` (including `hand` template zone) |
| `data/games/texas-holdem/40-content-data-assets.md` | No faction/piece visual fields in compiler-facing assets |

### Explicitly out of scope

- `data/games/*/visual-config.yaml` content removal (those files are the intended visual-data destination)
- Runner schema/provider behavior (VISCONF-001..007)
- Engine type/compiler rewiring already covered by VISCONF-008/009

---

## Architectural rationale

This extraction is strictly better than the previous mixed architecture:

1. Clean separation of concerns: engine data contract stays rule-semantic, runner owns display.
2. Strong validation boundaries: compiler rejects presentation leakage early with targeted diagnostics.
3. Extensibility: visual iteration per game can evolve in runner YAML without destabilizing kernel/compiler contracts.
4. No aliasing/back-compat cruft: removed fields are hard errors, forcing a single canonical path.

---

## Acceptance criteria

### Required behavior

1. FITL and Texas GameSpecDoc Markdown compile successfully with no visual keys in compiled `GameDef`.
2. Validator emits compile-blocking diagnostics when removed visual keys are reintroduced into GameSpecDoc sections.
3. Runner visual config files continue to contain visual data (`displayName`, `layoutRoles`, `cardAnimation`, etc.) and validate against runner schema.

### Verification commands

1. `rg -n "layoutRole:|layoutMode:|cardAnimation:|displayName:|visual:|visualRules:" data/games --glob '!**/visual-config.yaml'` returns no matches.
2. `pnpm -F @ludoforge/engine test` passes.
3. `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts` passes.

### Invariants

- GameSpecDoc Markdown files retain all rules/runtime semantics.
- Visual-config YAML remains the only place for display-specific fields.
- No game-specific presentation logic is reintroduced into shared engine/compiler code.

---

## Outcome

- **Completion date**: 2026-02-19
- **What was changed**:
  - Reassessed and corrected ticket assumptions to match current architecture and code reality.
  - Updated scope to target only compiler-facing GameSpecDoc Markdown sections, not `visual-config.yaml`.
  - Corrected acceptance/verification criteria to explicitly exclude `visual-config.yaml` from removal checks.
  - Added architecture rationale clarifying why visual data relocation is the preferred long-term design.
- **Deviation from original plan**:
  - Original ticket required global removal of visual keys across `data/games/`; corrected to preserve visual keys in runner-owned config files.
  - Original dependency (`VISCONF-008`) was incomplete for enforcement; ticket now depends on validator/compiler behavior from `VISCONF-009`.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts` passed.
  - `pnpm turbo lint` passed.
  - `rg -n "layoutRole:|layoutMode:|cardAnimation:|displayName:|visual:|visualRules:" data/games --glob '!**/visual-config.yaml'` returned no matches.
