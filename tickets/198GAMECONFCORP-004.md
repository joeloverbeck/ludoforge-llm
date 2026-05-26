# 198GAMECONFCORP-004: Authoring-error negative-test infrastructure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only (the validation surfaces being negative-tested are already in the engine, delivered by Specs 191/196/197)
**Deps**: `specs/198-cross-game-conformance-corpus-and-observer-safety-proofs.md`

## Problem

Specs 191, 196, and 197 (all COMPLETED 2026-05-26) introduced new compile-time validation surfaces: `targetKind` alignment, the extended role-constraint registry (`locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`), the `enablesPlanTemplates` doctrine-gating field. Each spec's own test plan covered happy-path validation, but cross-cutting *negative* coverage — which kinds of malformed authoring fail with which diagnostic, and whether the diagnostic identifies the offending element by name — lives nowhere coherent today. This ticket establishes the harness shape and authors the first eight enumerated negative cases.

## Assumption Reassessment (2026-05-26)

1. `packages/engine/test/architecture/authoring-error-negatives.test.ts` does NOT exist (verified).
2. Specs 191, 196, 197 all archived as COMPLETED 2026-05-26 — their validation surfaces are concrete in the engine, not anticipated.
3. `targetKind` validation lives in `packages/engine/src/cnl/validate-agent-plan-templates.ts` (verified during the reassessment).
4. The eight enumerated negative cases from spec §4.4 each correspond to an existing compile-time validation surface — this ticket exercises them; it does NOT add new validation rules.
5. Spec §6 edge case: "each Spec that introduces a new validation surface ... is responsible for adding negative tests in scope; this spec establishes the harness shape, not an exhaustive permanent list." This ticket therefore authors the *shape* (file, marker, fixture layout, diagnostic-replay-identity pattern), not exhaustive coverage of every conceivable malformed input.

## Architecture Check

1. Centralizes negative-test coverage in one file rather than scattering across the individual spec test plans — Foundation #12 (compile-time validation proven via tests) operationalized cleanly in one place.
2. Diagnostic identity is replay-byte-identical (Foundations #8, #16) — each diagnostic message is golden-checked so future drift is caught.
3. Each test names the offending authoring element by name (role/template/module) — this is the user-facing acceptance signal the negative test asserts.
4. The harness shape is extensible: future specs that add validation surfaces add negative tests here following the established pattern, rather than scattering them across spec-specific test files.

## What to Change

### 1. Add the new test file

Author `packages/engine/test/architecture/authoring-error-negatives.test.ts` with `// @test-class: architectural-invariant` as the file-top class marker.

### 2. One test per enumerated negative case (8 total, per spec §4.4)

1. **Unsupported role-constraint kind** (Spec 191 + Spec 196) — an authored constraint with an unknown kind fails compile with a role/template-named diagnostic. Coverage spans both the pre-Spec-196 `notEqual`-only registry AND the post-Spec-196 extended registry (`locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent` — verify the exact set in `archive/specs/196-*.md` at implementation start).
2. **`targetKind` mismatch** (Spec 191 P2) — step's `targetKind` does not align with its selector result type; compile fails.
3. **Out-of-range `stageIndex`** (Spec 191 P2) — authored `stageIndex` exceeds template max steps.
4. **Ungrantable compound timing** (Spec 191 P3).
5. **Unknown `enablesPlanTemplates` id** (Spec 197 §4.3).
6. **Unbounded subset / route pair without cap** (Foundation #10).
7. **Missing observer-scope declaration on a card selector** (Foundation #4).
8. **Hidden preview ref without authored fallback** (Foundation #20).

For each: author a minimal malformed spec fragment as a fixture, invoke the compiler, assert it fails with a diagnostic that identifies the offending element by name (role/template/module).

### 3. Golden-check each diagnostic message

Each diagnostic must be byte-identical on replay — golden-fixture the expected diagnostic message and compare exactly. This catches drift in diagnostic-text refactoring (Foundations #8, #16).

### 4. Fixture layout

Use a fixture sub-directory (e.g., `packages/engine/test/architecture/authoring-fixtures/`) for the eight minimal malformed YAML fragments, each named to identify the negative case it exercises.

## Files to Touch

- `packages/engine/test/architecture/authoring-error-negatives.test.ts` (new)
- Likely surface: `packages/engine/test/architecture/authoring-fixtures/` directory containing 8 minimal malformed YAML fragments (new — exact path confirmed against the test-helpers convention at implementation start)
- Likely surface: 8 golden-diagnostic files (or one consolidated golden table) for replay-byte-identity (new)

## Out of Scope

- Cross-family conformance tests (ticket 002).
- Observer-safety invariant proofs (ticket 003).
- New compile-time validation rules — this ticket exercises existing validation surfaces, it does not add any (per Assumption 4).
- Exhaustive per-validation-surface negative coverage — spec §6 edge case: each future spec that adds a validation surface adds its own negatives following this harness shape. This ticket establishes the shape with eight representative cases, not an exhaustive permanent list.

## Acceptance Criteria

### Tests That Must Pass

1. `authoring-error-negatives.test.ts` covers each of the 8 enumerated negative cases.
2. Each negative test asserts the compile diagnostic identifies the offending authoring element by name (role/template/module).
3. Each diagnostic message is golden-checked for byte-identical replay.
4. Existing suite: `pnpm turbo test` — full regression check.

### Invariants

1. Each Spec-191/196/197 surface has at least one negative-test entry (spec §7 P4 acceptance).
2. Diagnostic identity is replay-byte-identical (Foundations #8, #16).
3. The harness shape is documented in the test file itself so future specs adding validation surfaces can extend it without re-deriving the pattern.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/authoring-error-negatives.test.ts` — primary deliverable.
2. Eight minimal malformed YAML fixture fragments (paths TBD against existing fixture convention).
3. Golden-diagnostic files for replay-byte-identity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/architecture/authoring-error-negatives.test.js` — targeted run.
2. `pnpm turbo test` — full suite regression.
3. `pnpm turbo lint && pnpm turbo typecheck` — pre-completion verification.
