# 163GENLOOKUP-005: Cookbook recipe + canonical fixture profile for `lookup` ref family

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None (engine-side); docs and test-fixture only.
**Deps**: `archive/tickets/163GENLOOKUP-004.md`

## Problem

The lookup family is fully wired after ticket 004, but profile authors need a cookbook recipe demonstrating the YAML grammar, when to choose `lookup` over `preview.option.*`, and the four available collections. A canonical fixture profile exercising all four collections end-to-end serves as the worked example referenced from the cookbook.

## Assumption Reassessment (2026-05-09)

1. `docs/agent-dsl-cookbook.md` exists (verified during reassessment) and is the canonical home for profile-authoring recipes. The skill `reassess-agent-dsl-cookbook` reassesses it after DSL changes; this ticket adds the new section, not an audit pass.
2. The fixture helper at `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` was authored in ticket 003 with synthetic states for visibility/determinism/collection-coverage tests. This ticket extends it (or adds a sibling fixture file) to demonstrate all four collections in a single end-to-end scenario the cookbook can reference.
3. No conformance corpus migration is needed — Spec 163 §8.3 confirms no existing fixture uses lookup refs.

## Architecture Check

1. **Foundation #1 (Engine Agnosticism)**: cookbook examples MUST use a generic illustrative scenario, not FITL/Texas Hold'em-specific zones. The canonical fixture lives in `test/architecture/lookup-refs/`, not under `data/games/<game>/`, so no per-game profile is touched.
2. **Foundation #15 (Architectural Completeness)**: documenting the new ref family closes the "evolution profiles have no non-preview signal at deep frontiers" gap surfaced by Spec 162's witness — a profile author reading the cookbook can author a `preferHighPopulationTarget`-style consideration in a few lines of YAML.
3. **No game-specific shortcut documented** — the recipe shows `collection: zones` reading a generic `properties.population` walk, not a FITL-specific shortcut.

## What to Change

### 1. Cookbook section: "Static state lookups at chooseN frontiers"

Add a new section to `docs/agent-dsl-cookbook.md` (place it adjacent to the existing preview-ref section, if one exists; otherwise add at the end of the chooseN/microturn-related material). Cover:

- **When to use lookup vs preview.option.\***: lookup reads current observer-projected state by key; preview reads forward-simulated state. Lookups are O(1) and bounded; preview is bounded by `INNER_PREVIEW_HARD_CAP`.
- **The four collections**: `zones`, `tokens`, `players`, `globals`. Each has a different visibility source (acknowledge Spec 163 §4.3 table).
- **The `lookupFallback` requirement**: every consideration with a lookup-typed value MUST declare `lookupFallback.onUnavailable` (either `noContribution` or `{ constant: N }`). The compiler rejects authors who forget. Foundation #20.
- **The `onHidden` invariant**: hidden state ALWAYS yields `unavailable`. Authors cannot opt out. Foundation #4.
- **Worked example**: `preferHighPopulationTarget` consideration scoring chooseNStep ADD options by the visible `population` of the named zone:

  ```yaml
  preferHighPopulationTarget:
    scopes: [microturn]
    weight: 50
    value:
      lookup:
        surface: policyState
        collection: zones
        keyType: ZoneId
        key:
          ref: microturn.option.value
        path: [properties, population]
        onMissing: unavailable
    lookupFallback:
      onUnavailable: noContribution
  ```

- **Trace inspection**: `unknownLookupRefs` and `lookupFallbackFired` give the reader honest provenance.

### 2. Canonical end-to-end fixture profile

Extend `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` (created in ticket 003) with a `canonicalCookbookProfile()` helper that builds a profile exercising all four collections in a single end-to-end run. The cookbook can reference this fixture as the canonical YAML.

If the existing fixture file is already large (>300 LoC) by the end of ticket 003, prefer a sibling file `lookup-refs-cookbook-fixture.ts` instead of bloating the helper.

### 3. Cross-link from spec

Update Spec 163's §10 anchors block (`docs/agent-dsl-cookbook.md` line) to mention the section name once it lands. Optional polish — not blocking.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify — new section)
- `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` (modify — add canonical profile helper) **OR** `packages/engine/test/architecture/lookup-refs/lookup-refs-cookbook-fixture.ts` (new) — choose during implementation based on file size.

## Out of Scope

- **No new tests** — the canonical profile is referenced from the cookbook; the existing tests in tickets 003-004 already cover all behavioral invariants.
- **No conformance corpus migration** — no existing fixtures use lookup refs.
- **No engine code changes** — this ticket is documentation + fixture only.
- **No reassess-agent-dsl-cookbook full pass** — that skill is invoked separately when the user wants a comprehensive cookbook audit.

## Acceptance Criteria

### Tests That Must Pass

1. The cookbook fixture helper compiles and the profile it produces passes through the full lookup pipeline (visibility-respecting resolution, `lookupFallback` consumption, trace output) — exercise via the existing tests from tickets 003-004.
2. No regression in existing architectural-invariant tests: `pnpm -F @ludoforge/engine test:e2e`.
3. Markdown lint (if the project runs one) passes on `docs/agent-dsl-cookbook.md`.

### Invariants

1. The cookbook example MUST use generic identifiers (e.g., `zoneA`, `zoneB`) — no per-game zone IDs that would couple the recipe to a specific game.
2. The example MUST declare `lookupFallback.onUnavailable` — the cookbook teaches Foundation #20 by example.
3. The example MUST NOT show an `onHidden` override — the cookbook teaches Foundation #4 by omission.

## Test Plan

### New/Modified Tests

1. None new. The cookbook fixture helper is exercised by existing tests via the canonical-profile reference.

### Commands

1. `pnpm turbo build && pnpm turbo test && pnpm turbo lint`
2. Manual verification: render `docs/agent-dsl-cookbook.md` (e.g., via a markdown previewer) and confirm the new section reads cleanly and the YAML example is well-formatted.

## Outcome

Completed 2026-05-09.

- Landed the cookbook section "Static State Lookups at chooseN Frontiers" in `docs/agent-dsl-cookbook.md`, adjacent to the inner-preview ref documentation. The section documents lookup-vs-preview usage, the four supported collections, required `lookupFallback.onUnavailable`, the hidden-state invariant, the `preferHighPopulationTarget` YAML recipe, and trace inspection through `unknownLookupRefs` and `lookupFallbackFired`.
- Added `canonicalCookbookProfile()` and `scoreCanonicalCookbookProfile()` to `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts`. The canonical helper builds one microturn profile whose four lookup considerations exercise `zones`, `tokens`, `players`, and `globals` in one scoring pass.
- Modified the existing `lookup-collection-coverage.test.ts` architecture test, rather than adding a new test file, so the no-new-tests boundary stays intact while the canonical helper is exercised end-to-end.
- Updated Spec 163's implementer anchor for `docs/agent-dsl-cookbook.md` to name the landed section.
- Generated fallout: none. No schema, golden, compiled GameDef, conformance corpus, production game data, or engine behavior change is owned by this ticket.
- Touched-file scope: `docs/agent-dsl-cookbook.md`, `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts`, `packages/engine/test/architecture/lookup-refs/lookup-collection-coverage.test.ts`, `specs/163-generic-microturn-state-feature-lookups.md`, and this ticket. The existing fixture file was below the ticket's size threshold, so no sibling fixture file was needed.
- Source-size ledger: `docs/agent-dsl-cookbook.md` was already above the repo's typical source-file guidance before this ticket; the update is a localized cookbook section and splitting the cookbook would widen the ticket. `lookup-refs-fixture.ts` remains below the repo's typical range after the canonical helper addition.
- Command ledger:
  - Acceptance Criteria | existing tests from tickets 003-004 exercise full lookup pipeline | focused through existing lookup collection architecture test | `node --test packages/engine/dist/test/architecture/lookup-refs/lookup-collection-coverage.test.js`
  - `Acceptance Criteria | pnpm -F @ludoforge/engine test:e2e | run directly | passed`
  - Acceptance Criteria | Markdown lint if project runs one | not run; no markdown lint/remark script found in package/workspace scripts | direct source inspection plus `pnpm turbo lint`
  - `Test Plan | pnpm turbo build && pnpm turbo test && pnpm turbo lint | run directly as split serial commands | passed`
  - `Test Plan | manual markdown preview | substituted by direct source inspection in this non-GUI session | passed by source review`
- Final proof:
  - `pnpm -F @ludoforge/engine build` — passed
  - `node --test packages/engine/dist/test/architecture/lookup-refs/lookup-collection-coverage.test.js` — passed
  - `pnpm -F @ludoforge/engine test:e2e` — passed
  - `pnpm turbo build` — passed
  - `pnpm turbo test` — passed
  - `pnpm turbo lint` — passed
  - post-`pnpm turbo test` focused lookup test rerun — passed
  - direct source inspection of `docs/agent-dsl-cookbook.md` — passed
  - `pnpm run check:ticket-deps` — passed
- No-invalidation: terminal status/proof transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, or dependency classification changed after the final proof lanes.
