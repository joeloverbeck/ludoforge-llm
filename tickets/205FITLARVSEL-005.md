# 205FITLARVSEL-005: Faction-agnostic no-placeholder-value-one invariant (§7)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/205FITLARVSEL-002.md`

## Problem

Per spec §7 last bullet, add a forward-protection invariant test that scans every game's `data/games/<game>/*-agents.md` for selector components with `value: 1` as a standalone scoring constant. This prevents regression of the placeholder pattern across all factions (ARVN, US, NVA, VC) and any future faction or game. Per Foundation #1 (Engine Agnosticism), the scan is faction-agnostic — it does not hard-code ARVN.

## Assumption Reassessment (2026-06-01)

1. After 205FITLARVSEL-002 lands, no `value: 1` standalone components remain in the five ARVN placeholder selectors (`arvn.trainSpaceForControlOrPacification`, `arvn.sweepToExposeSpace`, `arvn.raidRemovalTarget`, `arvn.transportOrigin`, `arvn.pieceRemovalPriority`).
2. The same pattern at `us.adviseTargetSpace:846` (`indigenousForceMultiplier` with `value: 1`) is owned by Spec 202 (COMPLETED). The faction-agnostic scan must either pass against the current Spec-202-cleaned state OR fail and signal a follow-up against `202FITLUS*` to clean the row. **Verify Spec 202's actual cleanup at implementation time** — the reassessment did not confirm.
3. Existing test placement convention: `packages/engine/test/policy-profile-quality/` for profile-quality witnesses. Faction-agnostic invariants are acceptable here per `.claude/rules/testing.md`; `packages/engine/test/determinism/` is reserved for engine-level invariants (replay identity, bounded execution). The proposed faction-agnostic placeholder scan is profile-quality forward-protection, not an engine invariant, so `policy-profile-quality/` is the correct directory.
4. The scan parses YAML; permissive regex on raw text would false-positive on commented `# value: 1` lines.

## Architecture Check

1. Faction-agnostic scan honors Foundation #1 (Engine Agnosticism) — the test is not ARVN-specific and protects all current and future factions in all games.
2. The test reads YAML game-data files at test time; no engine surface change.
3. Forward-protection: catches regressions where new placeholder selectors slip into any game (Foundation #16 Testing as Proof).
4. Test-class is `architectural-invariant` because the property holds across every legitimate game-data evolution (per `.claude/rules/testing.md` taxonomy — distillation of the spec's "no placeholder constants" property into a seed-independent invariant).

## What to Change

### 1. Author the faction-agnostic scan

Create `packages/engine/test/policy-profile-quality/no-placeholder-value-one-selectors.test.ts` with `// @test-class: architectural-invariant`. Test logic:

- Glob `data/games/**/*-agents.md` (or whatever files contain selector library definitions — confirm during implementation by checking `data/games/fire-in-the-lake/` and `data/games/texas-holdem/` structures).
- Parse the YAML library blocks. For each selector under any `library.selectors.*`, walk `quality.components[]`. For each component, assert that `value` is NOT the scalar literal `1` (or the equivalent shorthand). Comments and documentation references (`# value: 1`) must not false-positive.
- On failure, emit a descriptive message listing the offending file:line:selector:component-id triples.

### 2. Document the scan's faction-agnosticism

The test file's header comment must state explicitly that the test is faction-agnostic and forward-protects ARVN / US / NVA / VC / future factions. Reference Spec 205 §7 in the header.

### 3. Verify against the post-002 codebase

After 205FITLARVSEL-002 lands, the scan should pass clean. If 002 left any ARVN residue, the test will fail until 002's cleanup is complete — that is the correct behavior.

## Files to Touch

- `packages/engine/test/policy-profile-quality/no-placeholder-value-one-selectors.test.ts` (new)
- `Likely surface`: `packages/engine/test/helpers/` may need a small YAML-walk helper if no existing utility handles selector enumeration; check during implementation against existing test helpers under `packages/engine/test/policy-profile-quality/arvn-plan-witness-helpers.ts` and friends.

## Out of Scope

- Compiler-level enforcement of the same invariant (spec §10 explicitly defers this — a `Schema-error: standalone value-1 component` compile-time check is a separate spec).
- Fixing US-row `us.adviseTargetSpace:846` — owned by Spec 202 (COMPLETED); if 202 left the row, file a follow-up against `202FITLUS*` rather than fixing here.
- Modifying any selector body (those are 205FITLARVSEL-002, -003, -004).
- Cross-game checks beyond the `value: 1` standalone pattern (e.g., redundant component IDs, weight-zero components) — out of scope for this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. New invariant test `no-placeholder-value-one-selectors.test.ts` passes against the post-002 codebase.
2. The test fails fast (with descriptive output) if any new selector regresses to `value: 1` standalone in any `data/games/*/agents*.md` or equivalent.
3. The test does NOT false-positive on commented `# value: 1` lines or unrelated `value: 1` occurrences (e.g., inside `score: 1` for a different field).
4. `pnpm turbo test` continues to pass.

### Invariants

1. The test is faction-agnostic — no hard-coded game or faction names in the test logic.
2. The test parses YAML structurally (or, if regex-based, the pattern is explicit, documented, and bounded by structural anchors like `quality.components`).
3. Foundation #1 — no engine code changes; the test reads game-data files.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/no-placeholder-value-one-selectors.test.ts` (new, `@test-class: architectural-invariant`).

### Commands

1. `pnpm turbo build`
2. `node --test dist/test/policy-profile-quality/no-placeholder-value-one-selectors.test.js`
3. `pnpm turbo test`
4. `pnpm turbo lint && pnpm turbo typecheck`
