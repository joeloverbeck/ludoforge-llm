# 133REGTESCLA-003: Classify `test/unit/` lane with `@test-class` markers

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large (mechanically uniform — Foundation 14 exception applies)
**Engine Changes**: None — comment-only additions to test source files
**Deps**: `archive/tickets/133REGTESCLA-002.md`

## Problem

Spec 133 Phase 2 requires every `.test.ts`/`.test.mts` file under `packages/engine/test/**` to carry a `@test-class` marker. This ticket covers the `unit/` lane (442 files live at reassessment time, with 441 files owned here after excluding ticket 001's reporter test). Unit tests typically assert properties of isolated functions, deterministic helpers, or compiler output and map naturally to architectural-invariant per §5's "new-test default." This ticket applies that default mechanically and surfaces per-file exceptions requiring convergence-witness classification.

## Assumption Reassessment (2026-04-18)

1. `packages/engine/test/unit/` contains 442 `.test.ts`/`.test.mts` files live across subdirectories (`kernel/`, `cnl/`, `agents/`, `sim/`, `contracts/`, `lint/`, `trace/`, `infrastructure/`, etc.). One file, `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts`, was already marked by ticket 001 and stayed `verified-no-edit`, leaving 441 files in this ticket's owned slice.
2. `packages/engine/test/unit/infrastructure/` may also receive ticket 006's meta-test later. That ticket owns its own marker; this ticket does not pre-create or touch it.
3. The sampled seed/RNG/trace-sensitive unit tests in the live lane still assert deterministic contracts or bounded behavior rather than preserving legacy trajectories, so the lane remained fully classifiable as `architectural-invariant` with no `convergence-witness` exceptions required.
4. Spec 133 and `.claude/rules/testing.md` (ticket 002) provided the authoritative classification rules used during per-file inspection.

## Architecture Check

1. **Cleaner than alternatives**: Apply the `architectural-invariant` default mechanically, then hand-review for exceptions. The alternative — classifying every file from scratch — produces the same result for the expected 90%+ architectural-invariant ratio at far higher review cost.
2. **Foundation 14 exception applies**: The diff spans 441 files, but the change per file is uniform: a single-line header comment. The diff is reviewable because the pattern repeats identically, and the reassessment confirmed that no `convergence-witness` exceptions were needed in the owned slice.
3. **Agnostic boundaries preserved**: Comment-only additions to test files. No production code change, no game-specific branching introduced, no kernel/compiler/runtime touched.
4. **No backwards-compatibility shims**: Markers are additive. Files without markers were never tolerated; the meta-test (ticket 006) enforces presence after this ticket lands.

## What to Change

### 1. Walk the unit lane and apply markers

For each file matching `packages/engine/test/unit/**/*.{test.ts,test.mts}`:

- Prepend at line 1:
  - **Default**: `// @test-class: architectural-invariant`
  - **Exception** (per-file inspection finds seed/profile/trajectory pinning): `// @test-class: convergence-witness\n// @witness: <id>` where `<id>` follows the convention from ticket 002 (`<spec-or-ticket-id>[-<short-slug>]`). If no witness-ticket is identifiable, use `spec-133-unclassified-audit` as a placeholder and create a follow-up issue.
- Preserve any existing file-top copyright notice or JSDoc block — place the marker on line 1 before them.

### 2. Per-file inspection criteria

- **→ architectural-invariant** (default):
  - Asserts deterministic function outputs (pure-function contracts).
  - Asserts compiler output stability (same GameSpecDoc → same GameDef).
  - Asserts admissibility / classifier / legal-move invariants under quantifiers.
  - Asserts bounded termination, bounded enumeration, or other universal properties.
- **→ convergence-witness** (exception):
  - `assert.equal(trace.moves.length, <number>)` against a specific seed.
  - `activePlayer === 0`-style literal pins against specific ply indices.
  - PRNG trajectory pins validating a specific past RNG-subsystem fix.
- **Uncertain**: default to architectural-invariant and leave a `// TODO(spec-133): reclassify if trajectory pin is identified` comment for audit.

### 3. Batch as a single PR or up to 3 sub-PRs by subdirectory

- Default: single PR across all unit subdirectories.
- If any single subdirectory exceeds 40 files, split by subdirectory (e.g., `test/unit/kernel/` separate from `test/unit/cnl/`) for reviewability. Sub-PRs are sibling implementations of the same ticket; each follows this ticket's acceptance criteria.

## Files to Touch

- All files matching `packages/engine/test/unit/**/*.{test.ts,test.mts}` (modify — single-line marker addition; occasionally a second `// @witness:` line for exception cases)

## Out of Scope

- Integration, e2e, determinism, performance, and memory lanes (tickets 004, 005).
- Meta-test enforcing marker presence or mixed-shape detection (ticket 006).
- Reporter infrastructure (ticket 001).
- Testing.md guidance (ticket 002).
- Any modification to test assertions themselves — markers document what the test is, they do not change what it does.
- Files under `packages/engine/test/unit/infrastructure/` created by tickets 001 and 006 (those tickets carry their own markers).

## Acceptance Criteria

### Tests That Must Pass

1. Existing unit suite continues to pass: `pnpm -F @ludoforge/engine test:unit`. Marker comments do not alter runtime behavior.
2. Reporter (from ticket 001) shows unit tests bucketed by class after this ticket lands — zero files in the `unclassified` bucket for the unit lane.

### Invariants

1. Every `.test.ts`/`.test.mts` file under `packages/engine/test/unit/**` (excluding files owned by ticket 001's reporter test and ticket 006's meta-test — those tickets land their own markers) carries exactly one `@test-class` marker.
2. Every `convergence-witness` file includes a `@witness:` id on the following line.
3. Comment-only changes produce identical runtime behavior; `dist/` output retains the same test execution semantics.

## Test Plan

### New/Modified Tests

1. No new tests — comment-only ticket. Verification is existing-test-suite preservation plus manual grep of marker presence.

### Commands

1. `pnpm -F @ludoforge/engine test:unit` — full unit lane must pass post-migration.
2. `pnpm turbo build` — tsc compiles with new comments; verify by checking a sample dist file retains its marker.
3. `pnpm turbo lint` — ESLint passes with new comments.
4. Coverage grep: `grep -L '^// @test-class:' $(find packages/engine/test/unit -name '*.test.ts' -o -name '*.test.mts')` — should return empty (every unit test file has a marker).
5. `pnpm turbo typecheck`.

## Outcome (2026-04-18)

- Added `// @test-class: architectural-invariant` to all 441 owned `packages/engine/test/unit/**/*.{test.ts,test.mts}` files.
- Left `packages/engine/test/unit/infrastructure/test-class-reporter.test.ts` untouched as `verified-no-edit` because ticket 001 already owns and marks that file.
- No unit-lane files required `convergence-witness` / `@witness` classification after live inspection.
- Schema/artifact fallout checked: none required; this remained a comment-only source migration.
- Verification:
  - structural marker sweep across all live unit test files, confirming exactly one `@test-class` marker per file in the owned slice
  - `pnpm turbo build`
  - `pnpm -F @ludoforge/engine test:unit`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
- Deferred scope remains with sibling tickets 004, 005, and 006 for non-unit lanes and marker meta-enforcement.
